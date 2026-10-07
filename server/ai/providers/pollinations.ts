import type { AIErrorCode } from '../../../src/domain/sign.js';
import { DEFAULT_PROVIDER_TIMEOUT_MS, mapHttpStatusToErrorCode, postMultipart, readProviderMessage } from '../http.js';
import { decodeProviderBase64Image, isUnchangedSource } from '../imageResult.js';
import type { AIEnvironment, AIProviderOptions, ServerAIImageProvider, ServerAIResult, ServerImageEditInput } from '../types.js';

/**
 * Pollinations' OpenAI-compatible image-editing endpoint takes the source image as an uploaded
 * multipart file, so the model must itself accept image input. The endpoint's own documented
 * default (`black-forest-labs/flux.1-schnell`) is a text-to-image model and would ignore the
 * storefront photo, so the adapter always sends an edit-capable model explicitly and lets
 * `POLLINATIONS_MODEL` change it.
 *
 * `black-forest-labs/flux.1-kontext-pro` is the model Pollinations' own `/v1/images/edits`
 * documentation uses in its example. Any model on the account that accepts image input and returns
 * image output works here: change the environment variable, not this file.
 */
export const POLLINATIONS_DEFAULT_MODEL = 'black-forest-labs/flux.1-kontext-pro';
const POLLINATIONS_EDITS_URL = 'https://gen.pollinations.ai/v1/images/edits';

type PollinationsImage = { b64_json?: unknown; url?: unknown; media_type?: unknown };
type PollinationsEnvelope = {
  data?: PollinationsImage[];
  error?: { message?: unknown; code?: unknown };
};

function errorMessage(errorCode: AIErrorCode, model: string): string {
  switch (errorCode) {
    case 'AI_NOT_CONFIGURED': return `The Pollinations model “${model}” is not available for this key. Check POLLINATIONS_MODEL and the key's model access.`;
    case 'AI_AUTHENTICATION': return 'Pollinations rejected the server API key. No concept was created.';
    case 'AI_RATE_LIMITED': return 'Pollinations is rate-limited. Please retry shortly.';
    case 'AI_CREDITS_EXHAUSTED': return 'The Pollinations account or key has no remaining balance for this request.';
    case 'AI_TIMEOUT': return 'Pollinations took too long to respond. No result was confirmed; please retry.';
    case 'AI_PROVIDER_UNAVAILABLE': return 'Pollinations is temporarily unavailable. Please retry.';
    case 'AI_INVALID_RESPONSE': return 'Pollinations did not return a usable image. No concept was created.';
    case 'AI_UNCHANGED_IMAGE': return 'Pollinations returned the source photo unchanged. No concept was created.';
    case 'AI_IMAGE_PREPARATION': return 'The storefront image could not be prepared. Your original photo remains unchanged.';
    case 'AI_NETWORK_ERROR': return 'Pollinations could not be reached. Photo receipt is unconfirmed.';
    case 'AI_REQUEST_REJECTED': return 'Pollinations rejected this request. Review the sign details and retry.';
  }
}

/**
 * Pollinations adapter for the storefront image-edit task.
 *
 * `POST https://gen.pollinations.ai/v1/images/edits` with `multipart/form-data`: the resized
 * storefront photo as the `image` part, the existing SignCraft prompt, an edit-capable `model` and
 * `response_format=b64_json`. The edited image comes back either as base64 on `data[0].b64_json` or,
 * if a caller asks for it, as a stored URL — this adapter only ever reads the base64 form and never
 * fetches a returned URL, so a provider response can never make the server fetch an arbitrary host.
 *
 * The host is a constant and the key travels only in the `authorization` header, which is
 * server-side by design: Pollinations documents `sk_*` secret keys as backend-only credentials that
 * must never ship to a browser, a mobile app or a repository.
 */
export class PollinationsImageProvider implements ServerAIImageProvider {
  readonly id = 'pollinations';
  readonly capabilities = ['image-edit'] as const;

  private readonly model: string;
  private readonly apiKey: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(environment: AIEnvironment, options: AIProviderOptions = {}) {
    this.model = environment.POLLINATIONS_MODEL?.trim() || POLLINATIONS_DEFAULT_MODEL;
    this.apiKey = environment.POLLINATIONS_API_KEY?.trim();
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

    const form = new FormData();
    form.set('image', new Blob([input.image.bytes], { type: input.image.mimeType }), input.image.fileName);
    form.set('prompt', input.prompt);
    form.set('model', this.model);
    form.set('response_format', 'b64_json');

    const result = await postMultipart(
      POLLINATIONS_EDITS_URL,
      { authorization: `Bearer ${this.apiKey}` },
      form,
      this.fetchImpl,
      this.timeoutMs,
    );

    const body = result.body as PollinationsEnvelope | null;
    if (!result.ok) {
      const providerMessage = body?.error?.message;
      return failure(mapHttpStatusToErrorCode(
        result.status,
        typeof providerMessage === 'string' ? providerMessage : readProviderMessage(result.body),
      ));
    }
    if (!body || typeof body !== 'object' || !Array.isArray(body.data)) return failure('AI_INVALID_RESPONSE');

    let sawUnchangedSource = false;
    for (const image of body.data) {
      const base64 = image.b64_json;
      if (typeof base64 !== 'string') continue;
      const decoded = decodeProviderBase64Image(base64);
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
    // A URL-only result is deliberately not followed: fetching a provider-supplied URL would let a
    // response steer the server at an arbitrary host. The adapter asks for base64 instead.
    return failure(sawUnchangedSource ? 'AI_UNCHANGED_IMAGE' : 'AI_INVALID_RESPONSE');
  }
}
