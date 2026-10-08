import type { AIErrorCode } from '../../../src/domain/sign.js';
import { DEFAULT_PROVIDER_TIMEOUT_MS, mapHttpStatusToErrorCode, postJson, readProviderMessage } from '../http.js';
import { bytesToBase64, decodeProviderDataUrlImage, isUnchangedSource } from '../imageResult.js';
import type { AIEnvironment, AIProviderOptions, ServerAIImageProvider, ServerAIResult, ServerImageEditInput } from '../types.js';

/**
 * OpenRouter image models are addressed as `vendor/model`. Gemini's image family is used as the
 * default because it accepts an input image (image-to-image editing), which is what SignCraft's
 * storefront task requires. Any OpenRouter model that accepts image input and returns image output
 * works here: change `OPENROUTER_MODEL` in the environment, not this file.
 */
export const OPENROUTER_DEFAULT_MODEL = 'google/gemini-3.1-flash-image';
const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_APP_TITLE = 'SignCraft AI';

type OpenRouterMessage = {
  content?: unknown;
  images?: Array<{ image_url?: { url?: unknown } }>;
};
type OpenRouterEnvelope = {
  choices?: Array<{ message?: OpenRouterMessage; finish_reason?: unknown }>;
  error?: { message?: unknown; code?: unknown };
};

function errorMessage(errorCode: AIErrorCode, model: string): string {
  switch (errorCode) {
    case 'AI_NOT_CONFIGURED': return `The OpenRouter model "${model}" is not available for this key. Check OPENROUTER_MODEL and the key's model access.`;
    case 'AI_AUTHENTICATION': return 'OpenRouter rejected the server API key. No concept was created.';
    case 'AI_RATE_LIMITED': return 'OpenRouter is rate-limited. Please retry shortly.';
    case 'AI_CREDITS_EXHAUSTED': return 'The OpenRouter account has insufficient credit for this request.';
    case 'AI_TIMEOUT': return 'OpenRouter took too long to respond. No result was confirmed; please retry.';
    case 'AI_PROVIDER_UNAVAILABLE': return 'OpenRouter is temporarily unavailable. Please retry.';
    case 'AI_INVALID_RESPONSE': return 'OpenRouter did not return a usable image. No concept was created.';
    case 'AI_UNCHANGED_IMAGE': return 'OpenRouter returned the source photo unchanged. No concept was created.';
    case 'AI_IMAGE_PREPARATION': return 'The storefront image could not be prepared. Your original photo remains unchanged.';
    case 'AI_NETWORK_ERROR': return 'OpenRouter could not be reached. Photo receipt is unconfirmed.';
    case 'AI_REQUEST_REJECTED': return 'OpenRouter rejected this request. Review the sign details and retry.';
  }
}

/**
 * OpenRouter adapter. Image editing goes through the OpenAI-compatible chat-completions endpoint
 * with `modalities: ['text', 'image']`; the source photo is attached as a base64 data URL and the
 * edited image comes back on `choices[0].message.images[0]`.
 *
 * Enhanced to support mask-based inpainting when a mask is provided.
 *
 * The base URL is a constant, so request data cannot become an arbitrary URL. The key is sent only
 * in the `authorization` header.
 */
export class OpenRouterImageProvider implements ServerAIImageProvider {
  readonly id = 'openrouter';
  readonly capabilities = ['image-edit'] as const;

  private readonly model: string;
  private readonly apiKey: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(environment: AIEnvironment, options: AIProviderOptions = {}) {
    this.model = environment.OPENROUTER_MODEL?.trim() || OPENROUTER_DEFAULT_MODEL;
    this.apiKey = environment.OPENROUTER_API_KEY?.trim();
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
  }

  async generate(input: ServerImageEditInput): Promise<ServerAIResult> {
    const failure = (errorCode: AIErrorCode): ServerAIResult => ({
      status: 'ERROR',
      providerId: this.id,
      errorCode,
      message: errorMessage(errorCode, this.model),
    });

    if (!this.apiKey) return failure('AI_NOT_CONFIGURED');

    const dataUrl = `data:${input.image.mimeType};base64,${bytesToBase64(input.image.bytes)}`;
    
    // Build the content array
    const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
      { type: 'text', text: input.prompt },
      { type: 'image_url', image_url: { url: dataUrl } },
    ];

    // Add mask if provided for inpainting
    if (input.mask) {
      const maskDataUrl = `data:image/png;base64,${bytesToBase64(input.mask)}`;
      content.push({ type: 'image_url', image_url: { url: maskDataUrl } });
      // Update prompt to reference the mask
      content[0].text = `${input.prompt}\n\nIMPORTANT: Use the second image (index 1) as an inpainting mask. The white areas of the mask indicate where to add the sign, and the black areas must remain unchanged.`;
    }

    const result = await postJson(
      OPENROUTER_CHAT_URL,
      { authorization: `Bearer ${this.apiKey}`, 'x-title': OPENROUTER_APP_TITLE },
      {
        model: this.model,
        modalities: ['text', 'image'],
        messages: [{
          role: 'user',
          content: content,
        }],
      },
      this.fetchImpl,
      this.timeoutMs,
    );

    const body = result.body as OpenRouterEnvelope | null;
    if (!result.ok) {
      const providerMessage = body?.error?.message;
      return failure(mapHttpStatusToErrorCode(
        result.status,
        typeof providerMessage === 'string' ? providerMessage : readProviderMessage(result.body),
      ));
    }
    if (!body || typeof body !== 'object') return failure('AI_INVALID_RESPONSE');
    if (body.error) {
      // OpenRouter can report a routing/quota failure inside an HTTP 200 envelope.
      const providerMessage = typeof body.error.message === 'string' ? body.error.message : '';
      return failure(mapHttpStatusToErrorCode(200, providerMessage));
    }

    let sawUnchangedSource = false;
    for (const entry of body.choices?.[0]?.message?.images ?? []) {
      const url = entry.image_url?.url;
      if (typeof url !== 'string') continue;
      const decoded = decodeProviderDataUrlImage(url);
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
