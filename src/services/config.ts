export type AiMode = 'demo' | 'api';
export type QuoteMode = 'local' | 'api';

function readMode<T extends string>(value: string | undefined, accepted: readonly T[], fallback: T): T {
  return value && accepted.includes(value as T) ? (value as T) : fallback;
}

/** Only public, non-secret feature flags may use the VITE_ prefix. */
export const clientConfig = {
  aiMode: readMode(import.meta.env.VITE_AI_MODE, ['demo', 'api'] as const, 'demo'),
  quoteMode: readMode(import.meta.env.VITE_QUOTE_MODE, ['local', 'api'] as const, 'local'),
  siteUrl: import.meta.env.VITE_SITE_URL?.replace(/\/$/, '') ?? '',
  whatsappNumber: import.meta.env.VITE_WHATSAPP_NUMBER?.replace(/\D/g, '') ?? '',
} as const;
