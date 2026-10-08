import { sanitizeProviderErrorMessage } from './http.js';
import type { AIEnvironment } from './types.js';

export type AIDiagnosticStage =
  | 'pre-provider'
  | 'provider-request'
  | 'provider-response'
  | 'success'
  | 'error'
  | 'request-summary';

export type AIDiagnosticValidationState = 'not-run' | 'incomplete' | 'passed' | 'failed';

export interface AIDiagnosticValidationResult {
  readonly state: AIDiagnosticValidationState;
  readonly failureCode?: string;
}

/** Per-provider attempt details held only for this request's sanitized diagnostic record. */
export interface AIDiagnosticProviderAttempt {
  readonly providerId: string;
  readonly model: string;
  adapterInvoked: boolean;
  requestAttempted: boolean;
  responseReceived: boolean;
  providerHttpStatus: number | null;
  errorCode?: string;
  providerErrorCode?: string;
  providerErrorMessage?: string;
}

/** Mutable, request-scoped context; sensitiveValues are used only for redaction and never serialized. */
export interface AIRequestDiagnosticContext {
  readonly requestId: string;
  imageValidation: AIDiagnosticValidationResult;
  configurationValidation: AIDiagnosticValidationResult;
  providerAdapterInvoked: boolean;
  readonly providerAttempts: AIDiagnosticProviderAttempt[];
  readonly sensitiveValues: string[];
}

export function createAIRequestDiagnosticContext(): AIRequestDiagnosticContext {
  return {
    requestId: globalThis.crypto.randomUUID(),
    imageValidation: { state: 'not-run' },
    configurationValidation: { state: 'not-run' },
    providerAdapterInvoked: false,
    providerAttempts: [],
    sensitiveValues: [],
  };
}

export interface AIDiagnosticEvent {
  readonly stage: AIDiagnosticStage;
  readonly requestId?: string;
  readonly provider?: string;
  readonly model?: string;
  /** Legacy summary of provider reachability: null = attempted/no response, false = no response, true = response. */
  readonly providerReached?: boolean | null;
  readonly providerAdapterInvoked?: boolean | null;
  readonly providerRequestAttempted?: boolean | null;
  readonly providerResponseReceived?: boolean | null;
  /** HTTP status returned by SignCraft's own API endpoint. */
  readonly appHttpStatus?: number | null;
  /** `code` from SignCraft's JSON response, when present. */
  readonly responseCode?: string;
  /** SignCraft's internal classification before any UI mapping. */
  readonly internalErrorCode?: string;
  /** HTTP status returned by the upstream AI provider. */
  readonly providerHttpStatus?: number | null;
  readonly responseContentType?: string | null;
  /** Provider-native code (for example, an upstream status string), before SignCraft maps it. */
  readonly providerErrorCode?: string;
  readonly providerErrorMessage?: string;
  readonly errorMessage?: string;
  readonly providerFailures?: readonly AIDiagnosticProviderAttempt[];
  readonly failedBeforeProviderInvocation?: boolean | null;
  readonly imageValidation?: AIDiagnosticValidationResult;
  readonly configurationValidation?: AIDiagnosticValidationResult;
  readonly validatedImageDataReturned?: boolean;
  /** Values to redact from provider errors; used for sanitization only, never logged. */
  readonly sensitiveValues?: readonly string[];
}

const RESPONSE_CONTENT_TYPE_PATTERN = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/;
const IMAGE_DATA_URL_PATTERN = /(?:data:)?image\/[a-z0-9.+-]+;base64,[a-z0-9+/=_-]+/gi;
const BASE64_TOKEN_PATTERN = /[A-Za-z0-9+/]{24,}={0,2}/g;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /(?<![\p{L}\p{N}])\+?\d[\d ()-]{6,}\d(?![\p{L}\p{N}])/gu;

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

function redactUserValues(value: string, sensitiveValues: readonly string[]): string {
  let redacted = value;
  const values = [...new Set(sensitiveValues)]
    .filter((entry) => typeof entry === 'string' && entry.trim().length >= 2)
    .sort((left, right) => right.length - left.length);

  for (const sensitiveValue of values) {
    try {
      const escaped = sensitiveValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      redacted = redacted.replace(new RegExp(escaped, 'giu'), '[redacted user input]');
    } catch {
      // A malformed Unicode edge case must not interrupt AI request handling or diagnostics.
    }
  }
  return redacted;
}

/**
 * Strip known credentials, user-supplied brief text, bearer values, image data URLs,
 * contact details, and long base64-like tokens before a diagnostic is emitted.
 */
export function sanitizeAIDiagnosticText(
  value: unknown,
  environment: AIEnvironment = {},
  maximumLength = 240,
  sensitiveValues: readonly string[] = [],
): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const redactedUserText = redactUserValues(String(value), sensitiveValues);
  const sanitized = sanitizeProviderErrorMessage(redactedUserText, knownSecrets(environment));
  if (!sanitized) return undefined;
  return sanitized
    .replace(IMAGE_DATA_URL_PATTERN, '[redacted image data]')
    .replace(BASE64_TOKEN_PATTERN, '[redacted]')
    .replace(EMAIL_PATTERN, '[redacted email]')
    .replace(PHONE_PATTERN, '[redacted phone]')
    .replace(/\b(authorization|api[_\s-]?key|access[_\s-]?token|token|secret|key)\s*[:=]\s*(?:bearer\s+)?(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1=[redacted]')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
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

function safeRequestId(value: string | undefined): string | null {
  return typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)
    ? value
    : null;
}

function safeCode(value: string | undefined, environment: AIEnvironment): string | null {
  const sanitized = sanitizeAIDiagnosticText(value, environment, 100);
  if (!sanitized) return null;
  const code = sanitized.replace(/[^a-zA-Z0-9_.:-]/g, '');
  return code.slice(0, 100) || null;
}

function safeHttpStatus(value: number | null | undefined): number | null {
  return Number.isInteger(value) && (value ?? -1) >= 100 && (value ?? 0) <= 599 ? value ?? null : null;
}

function safeValidation(
  value: AIDiagnosticValidationResult | undefined,
  environment: AIEnvironment,
): { state: AIDiagnosticValidationState; failureCode: string | null } {
  const state: AIDiagnosticValidationState = value?.state === 'incomplete'
    || value?.state === 'passed'
    || value?.state === 'failed'
    ? value.state
    : 'not-run';
  return { state, failureCode: safeCode(value?.failureCode, environment) };
}

function safeProviderAttempt(
  attempt: AIDiagnosticProviderAttempt,
  environment: AIEnvironment,
  sensitiveValues: readonly string[],
): Record<string, unknown> {
  return {
    providerId: safeIdentifier(attempt.providerId, environment, 'unknown'),
    model: safeIdentifier(attempt.model, environment, 'unknown'),
    adapterInvoked: attempt.adapterInvoked,
    requestAttempted: attempt.requestAttempted,
    responseReceived: attempt.responseReceived,
    providerHttpStatus: safeHttpStatus(attempt.providerHttpStatus),
    internalErrorCode: safeCode(attempt.errorCode, environment),
    providerErrorCode: safeCode(attempt.providerErrorCode, environment),
    providerErrorMessage: sanitizeAIDiagnosticText(attempt.providerErrorMessage, environment, 240, sensitiveValues) ?? null,
  };
}

/**
 * Write a strictly allow-listed diagnostic record. Never pass request bodies, headers, prompts,
 * provider response bodies, or image data to the emitted record.
 */
export function logAIDiagnostic(event: AIDiagnosticEvent, environment: AIEnvironment = {}): void {
  const sensitiveValues = event.sensitiveValues ?? [];
  const safeRequestIdValue = safeRequestId(event.requestId);
  const record = {
    stage: event.stage,
    requestId: safeRequestIdValue,
    appHttpStatus: safeHttpStatus(event.appHttpStatus),
    responseCode: safeCode(event.responseCode, environment),
    internalErrorCode: safeCode(event.internalErrorCode, environment),
    provider: safeIdentifier(event.provider, environment, 'none'),
    model: event.model ? safeIdentifier(event.model, environment, 'unknown') : null,
    providerAdapterInvoked: event.providerAdapterInvoked ?? null,
    providerRequestAttempted: event.providerRequestAttempted ?? null,
    providerResponseReceived: event.providerResponseReceived ?? null,
    providerReached: event.providerReached ?? null,
    providerHttpStatus: safeHttpStatus(event.providerHttpStatus),
    responseContentType: normalizeResponseContentType(event.responseContentType ?? null),
    providerErrorCode: safeCode(event.providerErrorCode, environment),
    providerErrorMessage: sanitizeAIDiagnosticText(event.providerErrorMessage, environment, 240, sensitiveValues) ?? null,
    errorMessage: sanitizeAIDiagnosticText(event.errorMessage, environment, 240, sensitiveValues) ?? null,
    providerFailures: (event.providerFailures ?? []).slice(0, 5)
      .map((attempt) => safeProviderAttempt(attempt, environment, sensitiveValues)),
    failedBeforeProviderInvocation: event.failedBeforeProviderInvocation ?? null,
    imageValidation: safeValidation(event.imageValidation, environment),
    configurationValidation: safeValidation(event.configurationValidation, environment),
    validatedImageDataReturned: event.validatedImageDataReturned ?? false,
  };
  console.info(`[AI_DIAGNOSTIC] ${JSON.stringify(record)}`);
}
