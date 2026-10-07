import type { AuthEnvironment } from '../auth/types';

/**
 * Reads the authentication configuration from the Node process environment (Vercel Functions).
 * Cloudflare Pages passes the same names as `env` bindings, so the shared handlers never read a
 * global directly.
 */
export function readAuthEnvironment(source: NodeJS.ProcessEnv = process.env): AuthEnvironment {
  return {
    AUTH_SESSION_SECRET: source.AUTH_SESSION_SECRET,
    AUTH_SESSION_TTL_MINUTES: source.AUTH_SESSION_TTL_MINUTES,
    AUTH_COOKIE_NAME: source.AUTH_COOKIE_NAME,
    AUTH_COOKIE_SAME_SITE: source.AUTH_COOKIE_SAME_SITE,
    AUTH_OWNER_USERNAME: source.AUTH_OWNER_USERNAME,
    AUTH_OWNER_EMAIL: source.AUTH_OWNER_EMAIL,
    AUTH_OWNER_PASSWORD_HASH: source.AUTH_OWNER_PASSWORD_HASH,
    AUTH_USERS_JSON: source.AUTH_USERS_JSON,
    AI_PROVIDER: source.AI_PROVIDER,
    QUOTE_STORAGE_PROVIDER: source.QUOTE_STORAGE_PROVIDER,
  };
}
