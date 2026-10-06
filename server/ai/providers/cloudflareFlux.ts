import type { AIErrorCode } from '../../../src/domain/sign';
import { hasValidImageSignature } from '../../http/imageValidation';
import type { AIEnvironment, ServerAIProvider, ServerAIResult, ServerImageEditInput } from '../types';

export const CLOUDFLARE_FLUX_MODEL = '@cf/black-forest-labs/flux-2-klein-9b';
const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4/accounts/';
const REQUEST_TIMEOUT_MS = 90_000;
const MAX_OUTPUT_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_OUTPUT_BASE64_CHARS = Math.ceil(MAX_OUTPUT_IMAGE_BYTES * 4 / 3) + 8;

type CloudflareEnvelope = {
  success?: boolean;
  result?: { image?: unknown };
  errors?: Array<{ message?: unknown }>;
};

function errorMessage(errorCode: AIErrorCode): string {
  switch (errorCode) {
    case 'AI_NOT_CONFIGURED': return 'Cloudflare Workers AI is not configured on the server.';
    case 'AI_AUTHENTICATION': return 'Cloudflare credentials or account permissions are invalid.';
    case 'AI_RATE_LIMITED': return 'The image service is rate-limited. Please wait a moment and retry.';
    case 'AI_CREDITS_EXHAUSTED': return 'Cloudflare Workers AI cannot process this request right now. Check account usage and retry.';
    case 'AI_TIMEOUT': return 'The image service took too long to respond. No result was confirmed; please retry.';
    case 'AI_PROVIDER_UNAVAILABLE': return 'Cloudflare Workers AI is temporarily unavailable. Please retry.';
    case 'AI_INVALID_RESPONSE': return 'The image service did not return a usable image. No concept was created.';
    case 'AI_IMAGE_PREPARATION': return 'The storefront image could not be prepared. Your original photo remains unchanged.';
    case 'AI_NETWORK_ERROR': return 'The secure image service could not be reached. Photo receipt is unconfirmed.';
    case 'AI_REQUEST_REJECTED': return 'The image service rejected this request. Review the sign details and retry.';
  }
}

function failure(
  errorCode: AIErrorCode,
  providerId = 'cloudflare-flux-2-klein-9b',
): ServerAIResult {
  return { status: 'ERROR', providerId, errorCode, message: errorMessage(errorCode) };
}

function getProviderErrorText(body: CloudflareEnvelope): string {
  return Array.isArray(body.errors)
    ? body.errors.map((error) => typeof error?.message === 'string' ? error.message : '').join(' ').slice(0, 2_000)
    : '';
}

function mapHttpError(status: number, providerMessage: string): ServerAIResult {
  if (/credit|billing|payment|insufficient balance|out of funds/i.test(providerMessage)) return failure('AI_CREDITS_EXHAUSTED');
  if (status === 401 || status === 403) return failure('AI_AUTHENTICATION');
  if (status === 429) return failure('AI_RATE_LIMITED');
  if (status === 408 || status === 504) return failure('AI_TIMEOUT');
  if (status >= 500) return failure('AI_PROVIDER_UNAVAILABLE');
  return failure('AI_REQUEST_REJECTED');
}

function decodeImage(base64: string): { bytes: Uint8Array; mimeType: string; base64: string } | null {
  const value = base64.trim();
  if (!value || value.length > MAX_OUTPUT_BASE64_CHARS || value.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return null;
  const padded = value + '='.repeat((4 - value.length % 4) % 4);
  try {
    const binary = atob(padded);
    if (!binary.length || binary.length > MAX_OUTPUT_IMAGE_BYTES) return null;
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const header = bytes.subarray(0, 12);
    const mimeType = (['image/jpeg', 'image/png', 'image/webp'] as const)
      .find((candidate) => hasValidImageSignature(candidate, header));
    return mimeType ? { bytes, mimeType, base64: padded } : null;
  } catch {
    return null;
  }
}

function outputDimensions(width: number, height: number): { width: number; height: number } {
  const ratio = width / height;
  if (ratio > 7.5) return { width: 1_920, height: 256 };
  if (ratio < 1 / 7.5) return { width: 256, height: 1_920 };

  const longestSide = Math.max(width, height);
  const shortestSide = Math.min(width, height);
  const minScale = 256 / shortestSide;
  const preferredScale = 1_024 / longestSide;
  const maxScale = 1_920 / longestSide;
  const scale = Math.min(Math.max(preferredScale, minScale), maxScale);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Cloudflare Workers AI REST adapter for FLUX.2 [klein] 9B. The account ID and
 * bearer token are read only from the server environment; the destination host
 * and model path are constants, so request data cannot become an arbitrary URL.
 */
export class CloudflareFluxProvider implements ServerAIProvider {
  readonly id = 'cloudflare-flux-2-klein-9b';

  constructor(
    private readonly environment: AIEnvironment,
    private readonly fetchImpl: typeof fetch = globalThis.fetch,
    private readonly timeoutMs = REQUEST_TIMEOUT_MS,
  ) {}

  async generate(input: ServerImageEditInput): Promise<ServerAIResult> {
    const accountId = this.environment.CLOUDFLARE_ACCOUNT_ID?.trim();
    const token = this.environment.CLOUDFLARE_API_TOKEN?.trim();
    if (!accountId || !/^[a-f0-9]{32}$/i.test(accountId) || !token) return failure('AI_NOT_CONFIGURED', this.id);

    const form = new FormData();
    form.set('prompt', input.prompt);
    form.set('input_image_0', new Blob([input.image.bytes], { type: input.image.mimeType }), 'storefront.jpg');
    const dimensions = outputDimensions(input.image.width, input.image.height);
    form.set('width', String(dimensions.width));
    form.set('height', String(dimensions.height));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(
        `${CLOUDFLARE_API_BASE}${accountId}/ai/run/${CLOUDFLARE_FLUX_MODEL}`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${token}` },
          body: form,
          signal: controller.signal,
        },
      );
      const body = await response.json().catch(() => null) as CloudflareEnvelope | null;
      if (!response.ok) return mapHttpError(response.status, body ? getProviderErrorText(body) : '');
      if (!body) return failure('AI_INVALID_RESPONSE', this.id);
      if (body.success === false) return mapHttpError(response.status, getProviderErrorText(body));
      const base64Image = body.result?.image;
      if (typeof base64Image !== 'string') return failure('AI_INVALID_RESPONSE', this.id);
      const decoded = decodeImage(base64Image);
      if (!decoded) return failure('AI_INVALID_RESPONSE', this.id);
      return {
        status: 'GENERATED',
        providerId: this.id,
        imageUrl: `data:${decoded.mimeType};base64,${decoded.base64}`,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        return failure('AI_TIMEOUT', this.id);
      }
      return failure('AI_PROVIDER_UNAVAILABLE', this.id);
    } finally {
      clearTimeout(timeout);
    }
  }
}
