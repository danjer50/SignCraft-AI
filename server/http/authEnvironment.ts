import type { AuthEnvironment } from '../auth/types.js';

/**
 * Reads the authentication configuration from the Node process environment (Vercel Functions).
 * Cloudflare Pages passes the same names as `env` bindings, so the shared handlers never read a
 * global directly.
 */
export function readAuthEnvironment(source: NodeJS.ProcessEnv = process.env): AuthEnvironment {
  return {
    DATABASE_URL: source.DATABASE_URL,
    DATABASE_SSL: source.DATABASE_SSL,
    SIGNCRAFT_DB_FILE: source.SIGNCRAFT_DB_FILE,
    REQUIRE_DURABLE_SESSIONS: source.REQUIRE_DURABLE_SESSIONS,
    AI_ABUSE_SECRET: source.AI_ABUSE_SECRET,
    AUTH_SESSION_SECRET: source.AUTH_SESSION_SECRET,
    AUTH_SESSION_TTL_MINUTES: source.AUTH_SESSION_TTL_MINUTES,
    AUTH_COOKIE_NAME: source.AUTH_COOKIE_NAME,
    AUTH_COOKIE_SAME_SITE: source.AUTH_COOKIE_SAME_SITE,
    AUTH_OWNER_USERNAME: source.AUTH_OWNER_USERNAME,
    AUTH_OWNER_EMAIL: source.AUTH_OWNER_EMAIL,
    AUTH_OWNER_PASSWORD_HASH: source.AUTH_OWNER_PASSWORD_HASH,
    AUTH_USERS_JSON: source.AUTH_USERS_JSON,
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
    QUOTE_STORAGE_PROVIDER: source.QUOTE_STORAGE_PROVIDER,
  };
}
