import type { AIErrorCode } from '../../src/domain/sign.js';

/** Default per-provider timeout. Matches the existing Cloudflare FLUX adapter. */
export const DEFAULT_PROVIDER_TIMEOUT_MS = 90_000;

/** Whole-chain budget; the browser aborts the request at 120 s, so stay below that. */
export const DEFAULT_TOTAL_TIMEOUT_MS = 110_000;

/** Below this remaining budget a further provider attempt is pointless (and would not fit). */
export const MINIMUM_ATTEMPT_BUDGET_MS = 5_000;

export interface JsonPostResult {
  ok: boolean;
  status: number;
  body: unknown;
  aborted: boolean;
}

/**
 * POST a `multipart/form-data` body with a hard timeout.
 *
 * Same contract as `postJson` (fixed code-level host, abort on timeout, defensive body parsing) for
 * providers that accept an uploaded file instead of JSON. The content type is deliberately not set:
 * `FormData` supplies it together with the multipart boundary.
 */
export async function postMultipart(
  url: string,
  headers: Record<string, string>,
  form: FormData,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<JsonPostResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { ...headers },
      body: form,
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, body, aborted: false };
  } catch (error) {
    const aborted = controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError');
    return { ok: false, status: aborted ? 504 : 0, body: null, aborted };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * POST a JSON body with a hard timeout.
 *
 * Only fixed, code-level provider hosts are ever passed in, so no request data can turn this into
 * an arbitrary-URL fetcher. The abort signal guarantees one stalled provider cannot consume the
 * whole chain budget, and provider response bodies are parsed defensively (`unknown`).
 */
export async function postJson(
  url: string,
  headers: Record<string, string>,
  payload: unknown,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<JsonPostResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, body, aborted: false };
  } catch (error) {
    const aborted = controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError');
    return { ok: false, status: aborted ? 504 : 0, body: null, aborted };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Map an HTTP failure onto SignCraft's existing public error vocabulary. Raw provider payload text
 * is used here only for classification; public diagnostics are separately extracted and redacted.
 */
export function mapHttpStatusToErrorCode(status: number, providerMessage = ''): AIErrorCode {
  if (/quota|credit|billing|insufficient|payment required|exceeded your current/i.test(providerMessage)) {
    return status === 429 ? 'AI_RATE_LIMITED' : 'AI_CREDITS_EXHAUSTED';
  }
  if (status === 401 || status === 403) return 'AI_AUTHENTICATION';
  if (status === 402) return 'AI_CREDITS_EXHAUSTED';
  if (status === 429) return 'AI_RATE_LIMITED';
  if (status === 404) return 'AI_NOT_CONFIGURED';
  if (status === 408 || status === 504) return 'AI_TIMEOUT';
  if (status === 0) return 'AI_NETWORK_ERROR';
  if (status >= 500) return 'AI_PROVIDER_UNAVAILABLE';
  return 'AI_REQUEST_REJECTED';
}

/** Extract a short provider error string; sanitize it before logging or returning it to the browser. */
export function readProviderMessage(body: unknown): string {
  if (typeof body !== 'object' || body === null) return '';
  const record = body as Record<string, unknown>;
  const error = record.error;
  if (typeof error === 'string') return error.slice(0, 500);
  if (typeof error === 'object' && error !== null) {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === 'string') return message.slice(0, 500);
  }
  if (typeof record.message === 'string') return record.message.slice(0, 500);
  return '';
}

/**
 * Keep only a short provider error message that is safe to show in the user's own error screen
 * and Vercel function logs. Provider messages can include echoed credentials, so redact both
 * common key formats and the exact secrets known to the adapter before returning any text.
 */
export function sanitizeProviderErrorMessage(
  message: string,
  secrets: readonly (string | undefined)[] = [],
): string | undefined {
  let safe = message;
  for (const secret of secrets) {
    const value = secret?.trim();
    if (value && value.length >= 4) {
      const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      safe = safe.replace(new RegExp(escaped, 'g'), '[redacted]');
    }
  }
  safe = safe
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replace(/\b(?:AIza[0-9A-Za-z_-]{20,}|sk-(?:or-v1-)?[A-Za-z0-9_-]{12,}|sk_[A-Za-z0-9_-]{12,})\b/gi, '[redacted]')
    .replace(/\b((?:api[_\s-]?key|access[_\s-]?token|secret)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1[redacted]')
    .split('')
    .map((character) => {
      const code = character.charCodeAt(0);
      return code < 0x20 || (code >= 0x7f && code <= 0x9f) ? ' ' : character;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
  return safe || undefined;
}

/** Read an optional numeric environment setting, ignoring anything out of range. */
export function readDuration(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(value);
  if (!value || !Number.isFinite(parsed)) return fallback;
  const rounded = Math.round(parsed);
  if (rounded < minimum || rounded > maximum) return fallback;
  return rounded;
}
