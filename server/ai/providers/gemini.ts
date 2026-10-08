import type { AIErrorCode } from '../../../src/domain/sign.js';
import { DEFAULT_PROVIDER_TIMEOUT_MS, mapHttpStatusToErrorCode, postJson, readProviderMessage, sanitizeProviderErrorMessage } from '../http.js';
import { sanitizeAIDiagnosticText } from '../diagnostics.js';
import { bytesToBase64, decodeProviderBase64Image, isUnchangedSource } from '../imageResult.js';
import type { AIEnvironment, AIProviderOptions, ServerAIImageProvider, ServerAIResult, ServerImageEditInput } from '../types.js';

export const GEMINI_DEFAULT_MODEL = 'gemini-3.1-flash-image';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';

type GeminiPart = { text?: unknown; thought?: unknown; inlineData?: { mimeType?: unknown; data?: unknown } };
type GeminiEnvelope = {
  candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: unknown }>;
  promptFeedback?: { blockReason?: unknown };
  error?: { message?: unknown; code?: unknown; status?: unknown };
};

function errorMessage(errorCode: AIErrorCode, model: string): string {
  switch (errorCode) {
    case 'AI_NOT_CONFIGURED': return `The Gemini model "${model}" is not available for this API key. Check GEMINI_MODEL and the key's model access.`;
    case 'AI_AUTHENTICATION': return 'Gemini rejected the server API key. No concept was created.';
    case 'AI_RATE_LIMITED': return 'Gemini is rate-limited (free-tier quota reached). Please retry shortly.';
    case 'AI_CREDITS_EXHAUSTED': return 'The Gemini project has no remaining quota, or billing is not enabled for image output.';
    case 'AI_TIMEOUT': return 'Gemini took too long to respond. No result was confirmed; please retry.';
    case 'AI_PROVIDER_UNAVAILABLE': return 'Gemini is temporarily unavailable. Please retry.';
    case 'AI_INVALID_RESPONSE': return 'Gemini did not return a usable image. No concept was created.';
    case 'AI_UNCHANGED_IMAGE': return 'Gemini returned the source photo unchanged. No concept was created.';
    case 'AI_IMAGE_PREPARATION': return 'The storefront image could not be prepared. Your original photo remains unchanged.';
    case 'AI_NETWORK_ERROR': return 'Gemini could not be reached. Photo receipt is unconfirmed.';
    case 'AI_REQUEST_REJECTED': return 'Gemini rejected this request. Review the sign details and retry.';
  }
}

/**
 * Google Gemini image-editing adapter (Nano Banana family).
 *
 * `GEMINI_MODEL` is configurable on purpose: Gemini image models have been renamed and retired
 * before, and Google's free tier for image output is not guaranteed. A model change is therefore
 * an environment change, never a code change.
 *
 * The endpoint host and `:generateContent` path are constants, so request data can never become an
 * arbitrary URL. The key travels in the `x-goog-api-key` header, never in the URL or body.
 */
export class GeminiImageProvider implements ServerAIImageProvider {
  readonly id = 'gemini';
  readonly capabilities = ['image-edit'] as const;

  private readonly model: string;
  private readonly apiKey: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(environment: AIEnvironment, options: AIProviderOptions = {}) {
    this.model = environment.GEMINI_MODEL?.trim() || GEMINI_DEFAULT_MODEL;
    this.apiKey = environment.GEMINI_API_KEY?.trim();
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
  }

  async generate(input: ServerImageEditInput): Promise<ServerAIResult> {
    const failure = (
      errorCode: AIErrorCode,
      details: { providerHttpStatus?: number; providerErrorCode?: string; providerErrorMessage?: string } = {},
    ): ServerAIResult => ({
      status: 'ERROR',
      providerId: this.id,
      errorCode,
      message: errorMessage(errorCode, this.model),
      ...details,
    });

    if (!this.apiKey) return failure('AI_NOT_CONFIGURED');

    const result = await postJson(
      `${GEMINI_API_BASE}${encodeURIComponent(this.model)}:generateContent`,
      { 'x-goog-api-key': this.apiKey },
      {
        contents: [{
          role: 'user',
          parts: [
            { text: input.prompt },
            { inlineData: { mimeType: input.image.mimeType, data: bytesToBase64(input.image.bytes) } },
          ],
        }],
        generationConfig: { responseModalities: ['IMAGE'] },
      },
      this.fetchImpl,
      this.timeoutMs,
    );

    const body = result.body as GeminiEnvelope | null;
    if (!result.ok) {
      const providerMessage = typeof body?.error?.message === 'string'
        ? body.error.message
        : readProviderMessage(result.body);
      const safeProviderMessage = sanitizeProviderErrorMessage(providerMessage, [this.apiKey]);
      const providerErrorCode = sanitizeAIDiagnosticText(body?.error?.status ?? body?.error?.code, {
        GEMINI_API_KEY: this.apiKey,
      }, 100);
      return failure(mapHttpStatusToErrorCode(result.status, providerMessage), {
        ...(result.status >= 100 ? { providerHttpStatus: result.status } : {}),
        ...(providerErrorCode ? { providerErrorCode } : {}),
        ...(safeProviderMessage ? { providerErrorMessage: safeProviderMessage } : {}),
      });
    }
    if (!body || typeof body !== 'object') return failure('AI_INVALID_RESPONSE');
    if (body.promptFeedback?.blockReason) {
      const reason = typeof body.promptFeedback.blockReason === 'string'
        ? `Gemini blocked the request: ${body.promptFeedback.blockReason}`
        : 'Gemini blocked the request.';
      const safeProviderMessage = sanitizeProviderErrorMessage(reason, [this.apiKey]);
      const providerErrorCode = sanitizeAIDiagnosticText(body.promptFeedback.blockReason, {
        GEMINI_API_KEY: this.apiKey,
      }, 100);
      return failure('AI_REQUEST_REJECTED', {
        providerHttpStatus: result.status,
        ...(providerErrorCode ? { providerErrorCode } : {}),
        ...(safeProviderMessage ? { providerErrorMessage: safeProviderMessage } : {}),
      });
    }

    let sawUnchangedSource = false;
    for (const part of body.candidates?.[0]?.content?.parts ?? []) {
      // Thought images are intermediate reasoning, not a final edit for the customer.
      if (part.thought === true) continue;
      const data = part.inlineData?.data;
      if (typeof data !== 'string') continue;
      const decoded = decodeProviderBase64Image(data);
      if (!decoded) return failure('AI_INVALID_RESPONSE');
      if (isUnchangedSource(decoded, input.image.bytes)) {
        sawUnchangedSource = true;
        continue;
      }
      return {
        status: 'GENERATED',
        providerId: this.id,
        imageUrl: `data:${decoded.mimeType};base64,${decoded.base64}`,
        createdAt: new Date().toISOString(),
      };
    }
    return failure(sawUnchangedSource ? 'AI_UNCHANGED_IMAGE' : 'AI_INVALID_RESPONSE');
  }
}
