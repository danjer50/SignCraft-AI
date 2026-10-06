import type { AIConceptResult } from '../../domain/sign';
import { clientConfig } from '../config';
import { DemoAIProvider } from './demoProvider';
import type { ImageEditingRequest } from './contracts';
import { buildStorefrontEditPrompt, SIGNCRAFT_PROMPT_VERSION } from './promptBuilder';

export async function generateStorefrontConcept(
  request: Omit<ImageEditingRequest, 'prompt' | 'preserveSourceArchitecture' | 'exactTextOverlayRequired'>,
): Promise<AIConceptResult> {
  const fullRequest: ImageEditingRequest = {
    ...request,
    prompt: buildStorefrontEditPrompt(request.configuration),
    preserveSourceArchitecture: true,
    exactTextOverlayRequired: true,
  };

  if (clientConfig.aiMode === 'demo') return new DemoAIProvider().generate(fullRequest);

  try {
    const payload = new FormData();
    payload.append('storefrontImage', fullRequest.sourceImage, fullRequest.sourceImage.name);
    payload.append('configuration', JSON.stringify(fullRequest.configuration));
    payload.append('promptVersion', SIGNCRAFT_PROMPT_VERSION);
    if (fullRequest.mask) payload.append('mask', fullRequest.mask, 'sign-mask.png');

    const response = await fetch('/api/ai/generate', { method: 'POST', body: payload });
    const body = (await response.json().catch(() => ({}))) as {
      status?: string;
      providerId?: string;
      imageUrl?: string;
      createdAt?: string;
      promptVersion?: string;
      message?: string;
    };
    if (body.status === 'GENERATED' && typeof body.imageUrl === 'string') {
      return { ...body, sourceImageTransfer: 'SENT_TO_SERVER' } as AIConceptResult;
    }
    return {
      status: 'UNAVAILABLE',
      providerId: typeof body.providerId === 'string' ? body.providerId : 'server-api',
      message: typeof body.message === 'string'
        ? body.message
        : 'The image-editing service did not return a generated image. No concept was created.',
      createdAt: new Date().toISOString(),
      sourceImageTransfer: 'SENT_TO_SERVER',
    };
  } catch {
    return {
      status: 'UNAVAILABLE',
      providerId: 'server-api',
      message: 'The secure AI endpoint is unavailable. Your original storefront photo has not been edited.',
      createdAt: new Date().toISOString(),
      sourceImageTransfer: 'UNKNOWN',
    };
  }
}
