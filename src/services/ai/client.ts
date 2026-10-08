import type { AIConceptResult, AIErrorCode, AIProviderFailureDiagnostic, SignConfiguration } from '../../domain/sign';
import { AI_ERROR_CODES, normalizeMaterials } from '../../domain/sign';
import { clientConfig } from '../config';
import { DemoAIProvider } from './demoProvider';
import type { ImageEditingRequest } from './contracts';
import { buildStorefrontEditPrompt, SIGNCRAFT_PROMPT_VERSION } from './promptBuilder';
import { prepareCloudflareReferenceImage } from './imagePreparation';
import { isOverEditedRender, isUnchangedRender } from './renderComparison';

function normalizedConfiguration(configuration: SignConfiguration): SignConfiguration {
  return {
    ...configuration,
    businessName: configuration.businessName.trim(),
    exactText: configuration.exactText.trim() ? configuration.exactText : configuration.businessName.trim(),
    materials: normalizeMaterials(configuration.materials),
  };
}

interface ProviderDiagnostics {
  providerHttpStatus?: number;
  providerErrorMessage?: string;
  providerFailures?: AIProviderFailureDiagnostic[];
}

function parseProviderDiagnostics(body: Record<string, unknown>): ProviderDiagnostics {
  const diagnostics: ProviderDiagnostics = {};
  if (typeof body.providerHttpStatus === 'number'
    && Number.isInteger(body.providerHttpStatus)
    && body.providerHttpStatus >= 100
    && body.providerHttpStatus <= 599) {
    diagnostics.providerHttpStatus = body.providerHttpStatus;
  }
  if (typeof body.providerErrorMessage === 'string') {
    const message = body.providerErrorMessage.trim().slice(0, 500);
    if (message) diagnostics.providerErrorMessage = message;
  }
  if (Array.isArray(body.providerFailures)) {
    const failures: AIProviderFailureDiagnostic[] = [];
    for (const value of body.providerFailures.slice(0, 5)) {
      if (!value || typeof value !== 'object') continue;
      const entry = value as Record<string, unknown>;
      const errorCode = AI_ERROR_CODES.find((code) => code === entry.errorCode);
      if (typeof entry.providerId !== 'string' || entry.providerId.length > 80 || !errorCode) continue;
      const failure: AIProviderFailureDiagnostic = { providerId: entry.providerId, errorCode };
      if (typeof entry.providerHttpStatus === 'number'
        && Number.isInteger(entry.providerHttpStatus)
        && entry.providerHttpStatus >= 100
        && entry.providerHttpStatus <= 599) {
        failure.providerHttpStatus = entry.providerHttpStatus;
      }
      if (typeof entry.providerErrorMessage === 'string') {
        const message = entry.providerErrorMessage.trim().slice(0, 500);
        if (message) failure.providerErrorMessage = message;
      }
      failures.push(failure);
    }
    if (failures.length > 0) diagnostics.providerFailures = failures;
  }
  return diagnostics;
}

function errorResult(
  errorCode: AIErrorCode,
  sourceImageTransfer: 'LOCAL_ONLY' | 'SENT_TO_SERVER' | 'UNKNOWN',
  message: string,
  providerId = 'signcraft-ai-api',
  diagnostics: ProviderDiagnostics = {},
): AIConceptResult {
  return {
    status: 'ERROR',
    providerId,
    errorCode,
    message,
    createdAt: new Date().toISOString(),
    sourceImageTransfer,
    ...diagnostics,
  };
}

/**
 * Client-side guard so a stalled connection can never leave the studio stuck on its loading
 * panel. It is deliberately longer than the server's own provider timeout.
 */
export const AI_REQUEST_TIMEOUT_MS = 120_000;

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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);
  try {
    const payload = new FormData();
    payload.append('storefrontImage', preparedImage, 'storefront.jpg');
    payload.append('configuration', JSON.stringify(fullRequest.configuration));
    payload.append('promptVersion', SIGNCRAFT_PROMPT_VERSION);

    requestStarted = true;
    const response = await fetch('/api/ai/generate-sign', { method: 'POST', body: payload, signal: controller.signal });
    const body = (await response.json().catch(() => ({}))) as {
      status?: string;
      providerId?: string;
      imageUrl?: string;
      promptVersion?: string;
      message?: string;
      code?: string;
      providerHttpStatus?: number;
      providerErrorMessage?: string;
      providerFailures?: unknown;
    };
    const imageUrlIsSafe = typeof body.imageUrl === 'string' &&
      body.imageUrl.length <= 17 * 1024 * 1024 &&
      /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(body.imageUrl);
    if (response.ok && body.status === 'GENERATED' && imageUrlIsSafe) {
      if (await isUnchangedRender(preparedImage, body.imageUrl as string)) {
        return errorResult(
          'AI_UNCHANGED_IMAGE',
          'SENT_TO_SERVER',
          'The AI service returned the source photo without a visible change. No concept was created.',
          typeof body.providerId === 'string' ? body.providerId : 'server-ai',
        );
      }
      if (await isOverEditedRender(preparedImage, body.imageUrl as string, configuration.signArea)) {
        return errorResult(
          'AI_INVALID_RESPONSE',
          'SENT_TO_SERVER',
          'The AI service redrew too much of the storefront instead of adding one localized sign. The result was rejected; mark the sign area and retry.',
          typeof body.providerId === 'string' ? body.providerId : 'server-ai',
        );
      }
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
      parseProviderDiagnostics(body),
    );
  } catch (error) {
    const aborted = controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError');
    if (aborted) {
      // The request may have reached the server, so the photo transfer stays unconfirmed.
      return errorResult(
        'AI_TIMEOUT',
        requestStarted ? 'UNKNOWN' : 'LOCAL_ONLY',
        'The secure image service did not answer in time. No result was confirmed; you can retry.',
      );
    }
    return errorResult(
      'AI_NETWORK_ERROR',
      requestStarted ? 'UNKNOWN' : 'LOCAL_ONLY',
      'The connection ended before the secure server confirmed an AI result.',
    );
  } finally {
    clearTimeout(timeout);
  }
}
