import type { AuthAccount, AccountRole, AccountStatus } from '../../src/domain/auth';

/**
 * Authentication configuration. Every value comes from the deployment environment (Vercel
 * environment variables / Cloudflare Pages secrets), never from the bundle: the browser only ever
 * receives the public account shape plus a signed session cookie.
 */
export interface AuthEnvironment {
  /** Secret used to sign session cookies (HMAC-SHA256). Without it no session can be issued. */
  AUTH_SESSION_SECRET?: string;
  /** Session lifetime in minutes; defaults to 12 hours. */
  AUTH_SESSION_TTL_MINUTES?: string;
  /** Cookie name; defaults to `signcraft_session`. */
  AUTH_COOKIE_NAME?: string;
  /** `lax` (default) | `strict` | `none` — `none` is only for embedding the app in a frame. */
  AUTH_COOKIE_SAME_SITE?: string;
  /** The single owner account. This is the only way an ADMIN can exist. */
  AUTH_OWNER_USERNAME?: string;
  AUTH_OWNER_EMAIL?: string;
  /** PBKDF2 hash produced by `npm run hash-password`; plaintext is never accepted. */
  AUTH_OWNER_PASSWORD_HASH?: string;
  /** Optional JSON array of additional PRO / CUSTOMER accounts. ADMIN entries are rejected. */
  AUTH_USERS_JSON?: string;
  /** Read-only information shown in the Admin console. */
  AI_PROVIDER?: string;
  QUOTE_STORAGE_PROVIDER?: string;
}

/**
 * Server-side record. It extends the public shape with the credential material, and it must never
 * be serialized to a response — `toPublicAccount()` strips it.
 */
export interface StoredAccount extends AuthAccount {
  passwordHash: string;
}

export interface ProAccountInput {
  username: string;
  email: string;
  password: string;
}

export type AccountWriteResult =
  | { ok: true; account: AuthAccount }
  | { ok: false; code: 'WRITE_STORE_NOT_CONFIGURED' | 'INVALID_ARGUMENT' | 'DUPLICATE_IDENTIFIER' | 'NOT_FOUND' };

/**
 * Where accounts live. The default implementation is environment-backed and read-only, which is
 * enough to sign in and to authorize; the Admin console calls the write methods so a durable store
 * (D1/KV/Postgres adapter) can be plugged in later without touching the HTTP layer.
 */
export interface UserRepository {
  /** False when no owner account is configured: sign-in then reports it honestly. */
  readonly configured: boolean;
  listAccounts(): AuthAccount[];
  listAccountsByRole(role: AccountRole): AuthAccount[];
  /** Accepts a username or an email, case-insensitively. Returns the hash only to the server. */
  findAccount(identifier: string): StoredAccount | null;
  createProAccount(input: ProAccountInput): Promise<AccountWriteResult>;
  updateAccount(id: string, changes: { username?: string; email?: string; password?: string }): Promise<AccountWriteResult>;
  setAccountStatus(id: string, status: AccountStatus): Promise<AccountWriteResult>;
  removeAccount(id: string): Promise<AccountWriteResult>;
}

/** Claims carried inside the signed session cookie. */
export interface SessionClaims {
  /** Subject: the account id. */
  sub: string;
  /** Random per-session id, so a future revocation list has something to point at. */
  sid: string;
  role: AccountRole;
  username: string;
  email: string;
  status: AccountStatus;
  /** Issued-at / expiry, in seconds since the epoch. */
  iat: number;
  exp: number;
}

export type AuthState =
  | { status: 'AUTHENTICATED'; account: AuthAccount; claims: SessionClaims; expiresAt: string }
  | { status: 'UNAUTHENTICATED'; reason: 'MISSING' | 'EXPIRED' | 'INVALID' | 'NOT_CONFIGURED' };

export interface IssuedSession {
  cookieHeader: string;
  expiresAt: string;
}
