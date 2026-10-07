export type AiMode = 'demo' | 'api';
export type QuoteMode = 'local' | 'api';

function readMode<T extends string>(value: string | undefined, accepted: readonly T[], fallback: T): T {
  // Case and stray whitespace must not silently change a mode: an unrecognised value falls back to
  // the documented default instead of disabling a feature.
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return normalized && accepted.includes(normalized as T) ? (normalized as T) : fallback;
}

/**
 * Only public, non-secret feature flags may use the VITE_ prefix.
 *
 * `aiMode` defaults to `api`, and that default is the point: in `api` the browser calls the
 * same-origin `/api/ai/generate-sign` route, where the provider credentials live, so a deployment
 * generates real concepts without any build-time flag. `demo` is now the explicit opt-out for
 * offline demonstrations.
 *
 * Previously a missing `VITE_AI_MODE` silently switched the whole AI feature off: the client
 * returned a canned "no image-editing provider configured" result without ever contacting the
 * server, and the result page then blamed "demo mode" for a deployment that was never asked.
 */
export const clientConfig = {
  aiMode: readMode(import.meta.env.VITE_AI_MODE, ['demo', 'api'] as const, 'api'),
  quoteMode: readMode(import.meta.env.VITE_QUOTE_MODE, ['local', 'api'] as const, 'local'),
  siteUrl: import.meta.env.VITE_SITE_URL?.replace(/\/$/, '') ?? '',
  whatsappNumber: import.meta.env.VITE_WHATSAPP_NUMBER?.replace(/\D/g, '') ?? '',
} as const;
