import type { AIConceptResult, AIErrorCode, SignConfiguration } from '../../domain/sign';
import { clientConfig } from '../config';
import { DemoAIProvider } from './demoProvider';
import type { ImageEditingRequest } from './contracts';
import { buildStorefrontEditPrompt, SIGNCRAFT_PROMPT_VERSION } from './promptBuilder';
import { prepareCloudflareReferenceImage } from './imagePreparation';

const AI_ERROR_CODES: readonly AIErrorCode[] = [
  'AI_NOT_CONFIGURED',
  'AI_AUTHENTICATION',
  'AI_RATE_LIMITED',
  'AI_CREDITS_EXHAUSTED',
  'AI_TIMEOUT',
  'AI_PROVIDER_UNAVAILABLE',
  'AI_INVALID_RESPONSE',
  'AI_IMAGE_PREPARATION',
  'AI_NETWORK_ERROR',
  'AI_REQUEST_REJECTED',
];

function normalizedConfiguration(configuration: SignConfiguration): SignConfiguration {
  return {
    ...configuration,
    businessName: configuration.businessName.trim(),
    exactText: configuration.exactText.trim() ? configuration.exactText : configuration.businessName.trim(),
  };
}

function errorResult(
  errorCode: AIErrorCode,
  sourceImageTransfer: 'LOCAL_ONLY' | 'SENT_TO_SERVER' | 'UNKNOWN',
  message: string,
  providerId = 'signcraft-ai-api',
): AIConceptResult {
  return {
    status: 'ERROR',
    providerId,
    errorCode,
    message,
    createdAt: new Date().toISOString(),
    sourceImageTransfer,
  };
}

export async function generateStorefrontConcept(
  request: Omit<ImageEditingRequest, 'prompt' | 'preserveSourceArchitecture' | 'exactTextOverlayRequired'>,
): Promise<AIConceptResult> {
  const configuration = normalizedConfiguration(request.configuration);
  const fullRequest: ImageEditingRequest = {
    ...request,
    configuration,
    prompt: buildStorefrontEditPrompt(configuration),
    preserveSourceArchitecture: true,
    exactTextOverlayRequired: true,
  };

  if (clientConfig.aiMode === 'demo') return new DemoAIProvider().generate(fullRequest);

  let preparedImage: File;
  try {
    preparedImage = await prepareCloudflareReferenceImage(fullRequest.sourceImage);
  } catch {
    return errorResult(
      'AI_IMAGE_PREPARATION',
      'LOCAL_ONLY',
      'The image could not be resized for the AI service. Your original photo was not sent.',
    );
  }

  let requestStarted = false;
  try {
    const payload = new FormData();
    payload.append('storefrontImage', preparedImage, 'storefront.jpg');
    payload.append('configuration', JSON.stringify(fullRequest.configuration));
    payload.append('promptVersion', SIGNCRAFT_PROMPT_VERSION);
    if (fullRequest.mask) payload.append('mask', fullRequest.mask, 'sign-mask.png');

    requestStarted = true;
    const response = await fetch('/api/ai/generate-sign', { method: 'POST', body: payload });
    const body = (await response.json().catch(() => ({}))) as {
      status?: string;
      providerId?: string;
      imageUrl?: string;
      promptVersion?: string;
      message?: string;
      code?: string;
    };
    const imageUrlIsSafe = typeof body.imageUrl === 'string' &&
      body.imageUrl.length <= 17 * 1024 * 1024 &&
      /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(body.imageUrl);
    if (response.ok && body.status === 'GENERATED' && imageUrlIsSafe) {
      return {
        status: 'GENERATED',
        providerId: typeof body.providerId === 'string' ? body.providerId : 'server-ai',
        imageUrl: body.imageUrl as string,
        createdAt: new Date().toISOString(),
        promptVersion: typeof body.promptVersion === 'string' ? body.promptVersion : SIGNCRAFT_PROMPT_VERSION,
        sourceImageTransfer: 'SENT_TO_SERVER',
      };
    }
    const errorCode = AI_ERROR_CODES.find((code) => code === body.code) ?? 'AI_REQUEST_REJECTED';
    return errorResult(
      errorCode,
      'SENT_TO_SERVER',
      typeof body.message === 'string' ? body.message : 'The secure server did not confirm successful AI processing.',
      typeof body.providerId === 'string' ? body.providerId : 'server-ai-api',
    );
  } catch {
    return errorResult(
      'AI_NETWORK_ERROR',
      requestStarted ? 'UNKNOWN' : 'LOCAL_ONLY',
      'The connection ended before the secure server confirmed an AI result.',
    );
  }
}
