import { sanitizeProviderErrorMessage } from './http.js';
import type { AIEnvironment } from './types.js';

export type AIDiagnosticStage = 'pre-provider' | 'provider-request' | 'provider-response' | 'success' | 'error';

export interface AIDiagnosticEvent {
  readonly stage: AIDiagnosticStage;
  readonly provider?: string;
  readonly model?: string;
  /** `null` means an outbound request was attempted but no provider response confirmed reachability. */
  readonly providerReached?: boolean | null;
  readonly httpStatus?: number | null;
  readonly responseContentType?: string | null;
  readonly errorCode?: string;
  /** Provider-native code (for example, an upstream status string), before SignCraft maps it. */
  readonly providerErrorCode?: string;
  readonly errorMessage?: string;
  readonly validatedImageDataReturned?: boolean;
}

const RESPONSE_CONTENT_TYPE_PATTERN = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/;
const IMAGE_DATA_URL_PATTERN = /(?:data:)?image\/[a-z0-9.+-]+;base64,[a-z0-9+/=_-]+/gi;
const BASE64_TOKEN_PATTERN = /[A-Za-z0-9+/]{24,}={0,2}/g;

function knownSecrets(environment: AIEnvironment): (string | undefined)[] {
  return [
    environment.AI_API_KEY,
    environment.CLOUDFLARE_ACCOUNT_ID,
    environment.CLOUDFLARE_API_TOKEN,
    environment.GROQ_API_KEY,
    environment.GEMINI_API_KEY,
    environment.OPENROUTER_API_KEY,
    environment.POLLINATIONS_API_KEY,
  ];
}

/** Strip known credentials, bearer values, image data URLs, and long base64-like tokens. */
export function sanitizeAIDiagnosticText(
  value: unknown,
  environment: AIEnvironment = {},
  maximumLength = 240,
): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const sanitized = sanitizeProviderErrorMessage(String(value), knownSecrets(environment));
  if (!sanitized) return undefined;
  return sanitized
    .replace(IMAGE_DATA_URL_PATTERN, '[redacted image data]')
    .replace(BASE64_TOKEN_PATTERN, '[redacted]')
    .replace(/\b(authorization|api[_\s-]?key|access[_\s-]?token|token|secret|key)\s*[:=]\s*(?:bearer\s+)?(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1=[redacted]')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maximumLength) || undefined;
}

/** Normalize an upstream content type to its media type only, e.g. `application/json`. */
export function normalizeResponseContentType(value: string | null): string | null {
  if (!value) return null;
  const mediaType = value.split(';', 1)[0].trim().toLowerCase();
  return RESPONSE_CONTENT_TYPE_PATTERN.test(mediaType) ? mediaType.slice(0, 100) : null;
}

function safeIdentifier(value: string | undefined, environment: AIEnvironment, fallback: string): string {
  const sanitized = sanitizeAIDiagnosticText(value, environment, 120);
  if (!sanitized) return fallback;
  const identifier = sanitized.replace(/[^a-zA-Z0-9._/@:+-]/g, '');
  return identifier.slice(0, 120) || fallback;
}

function safeCode(value: string | undefined, environment: AIEnvironment): string | null {
  const sanitized = sanitizeAIDiagnosticText(value, environment, 100);
  if (!sanitized) return null;
  const code = sanitized.replace(/[^a-zA-Z0-9_.:-]/g, '');
  return code.slice(0, 100) || null;
}

/**
 * Write a strictly allow-listed diagnostic record. Never pass request bodies, headers, prompts,
 * provider response bodies, or image data to this function.
 */
export function logAIDiagnostic(event: AIDiagnosticEvent, environment: AIEnvironment = {}): void {
  const record = {
    stage: event.stage,
    provider: safeIdentifier(event.provider, environment, 'none'),
    model: event.model ? safeIdentifier(event.model, environment, 'unknown') : null,
    providerReached: event.providerReached ?? null,
    httpStatus: Number.isInteger(event.httpStatus) && (event.httpStatus ?? -1) >= 100 && (event.httpStatus ?? 0) <= 599
      ? event.httpStatus
      : null,
    responseContentType: normalizeResponseContentType(event.responseContentType ?? null),
    errorCode: safeCode(event.errorCode, environment),
    providerErrorCode: safeCode(event.providerErrorCode, environment),
    errorMessage: sanitizeAIDiagnosticText(event.errorMessage, environment) ?? null,
    validatedImageDataReturned: event.validatedImageDataReturned ?? false,
  };
  console.info(`[AI_DIAGNOSTIC] ${JSON.stringify(record)}`);
}
