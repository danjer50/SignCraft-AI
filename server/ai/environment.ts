import type { AIEnvironment } from './types.js';

/**
 * Reads the server-only AI provider configuration from the Node process environment
 * (Vercel Functions). Cloudflare Pages passes the same names as `env` bindings, so the shared
 * router never reads a global directly and every key stays on the server.
 *
 * Nothing returned here is ever sent to the browser.
 */
export function readAiEnvironment(source: NodeJS.ProcessEnv = process.env): AIEnvironment {
  return {
    AI_PROVIDER: source.AI_PROVIDER,
    AI_PROVIDER_ORDER: source.AI_PROVIDER_ORDER,
    AI_PROVIDER_TIMEOUT_MS: source.AI_PROVIDER_TIMEOUT_MS,
    AI_TOTAL_TIMEOUT_MS: source.AI_TOTAL_TIMEOUT_MS,
    AI_API_KEY: source.AI_API_KEY,
    GROQ_API_KEY: source.GROQ_API_KEY,
    GROQ_MODEL: source.GROQ_MODEL,
    GEMINI_API_KEY: source.GEMINI_API_KEY,
    GEMINI_MODEL: source.GEMINI_MODEL,
    OPENROUTER_API_KEY: source.OPENROUTER_API_KEY,
    OPENROUTER_MODEL: source.OPENROUTER_MODEL,
    POLLINATIONS_API_KEY: source.POLLINATIONS_API_KEY,
    POLLINATIONS_MODEL: source.POLLINATIONS_MODEL,
    CLOUDFLARE_ACCOUNT_ID: source.CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_API_TOKEN: source.CLOUDFLARE_API_TOKEN,
  };
}
