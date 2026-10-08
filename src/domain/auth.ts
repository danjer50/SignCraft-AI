/**
 * Authentication vocabulary shared by the browser and the server.
 *
 * Rules that keep this safe:
 * - Roles are *decided on the server*. The client only renders what a verified session says and
 *   can never grant itself a role: every privileged API re-checks the role server-side.
 * - The public account shape below never carries a password hash, a session secret or any other
 *   credential material. The server-side record extends it (see `server/auth/types.ts`).
 */

export const ACCOUNT_ROLES = ['CUSTOMER', 'PRO', 'ADMIN'] as const;
export type AccountRole = (typeof ACCOUNT_ROLES)[number];

export const ACCOUNT_STATUSES = ['ACTIVE', 'SUSPENDED', 'DISABLED'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/** Everything the browser is allowed to know about a signed-in account. */
export interface AuthAccount {
  id: string;
  username: string;
  email: string;
  role: AccountRole;
  status: AccountStatus;
  createdAt: string;
}

export interface AuthSession {
  account: AuthAccount;
  /** ISO timestamp; the client uses it to explain an expired session instead of failing silently. */
  expiresAt: string;
}

export const AUTH_ERROR_CODES = [
  'MALFORMED_REQUEST',
  'MISSING_CREDENTIALS',
  'INVALID_CREDENTIALS',
  'TOO_MANY_ATTEMPTS',
  'ACCOUNT_NOT_ACTIVE',
  'AUTH_NOT_CONFIGURED',
  'SESSION_REQUIRED',
  'SESSION_EXPIRED',
  'SESSION_INVALID',
  'FORBIDDEN',
  'METHOD_NOT_ALLOWED',
  'WRITE_STORE_NOT_CONFIGURED',
  'UNEXPECTED',
  'SIGN_OUT_UNCONFIRMED',
] as const;
export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

/** Where each role lands after signing in. Nobody picks their own destination. */
export const ROLE_HOME_PATHS: Record<AccountRole, string> = {
  ADMIN: '/admin',
  PRO: '/pro',
  CUSTOMER: '/',
};

export function homePathForRole(role: AccountRole): string {
  return ROLE_HOME_PATHS[role] ?? ROLE_HOME_PATHS.CUSTOMER;
}

export function isAccountRole(value: unknown): value is AccountRole {
  return typeof value === 'string' && (ACCOUNT_ROLES as readonly string[]).includes(value);
}

export function isAccountStatus(value: unknown): value is AccountStatus {
  return typeof value === 'string' && (ACCOUNT_STATUSES as readonly string[]).includes(value);
}

export function isAuthErrorCode(value: unknown): value is AuthErrorCode {
  return typeof value === 'string' && (AUTH_ERROR_CODES as readonly string[]).includes(value);
}

function text(value: unknown, maximum: number): string {
  return typeof value === 'string' ? value.slice(0, maximum) : '';
}

/**
 * Defensive parsing for anything that crosses a network or storage boundary. A malformed or
 * hostile session payload becomes `null` (treated as "not signed in") instead of an object with
 * `undefined` fields that could crash a page or, worse, imply a role.
 */
export function normalizeAuthAccount(value: unknown): AuthAccount | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const role = source.role;
  if (!isAccountRole(role)) return null;
  const id = text(source.id, 80);
  if (!id) return null;
  return {
    id,
    username: text(source.username, 80),
    email: text(source.email, 254),
    role,
    status: isAccountStatus(source.status) ? source.status : 'ACTIVE',
    createdAt: typeof source.createdAt === 'string' && !Number.isNaN(Date.parse(source.createdAt))
      ? source.createdAt
      : new Date(0).toISOString(),
  };
}

export function normalizeAuthSession(value: unknown): AuthSession | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const account = normalizeAuthAccount(source.account);
  if (!account) return null;
  return {
    account,
    expiresAt: typeof source.expiresAt === 'string' && !Number.isNaN(Date.parse(source.expiresAt))
      ? source.expiresAt
      : new Date(0).toISOString(),
  };
}

export interface AuthFailure {
  code: AuthErrorCode;
  message: string;
}

/** Never returns `undefined` text, so a failed sign-in always explains itself on screen. */
export function normalizeAuthFailure(value: unknown): AuthFailure {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { code: 'UNEXPECTED', message: '' };
  }
  const source = value as Record<string, unknown>;
  return {
    code: isAuthErrorCode(source.code) ? source.code : 'UNEXPECTED',
    message: text(source.message, 400),
  };
}

/**
 * Login results the client can act on. `redirect` always comes from the server so the role →
 * area mapping lives in exactly one place.
 */
export type SignInResult =
  | { status: 'AUTHENTICATED'; session: AuthSession; redirect: string }
  | { status: 'REJECTED'; failure: AuthFailure };

export function isAuthorizedForRole(role: AccountRole | null | undefined, allowed: readonly AccountRole[]): boolean {
  return typeof role === 'string' && allowed.includes(role);
}

/* --- Navigation policy ------------------------------------------------------------------------
 * Kept in the domain layer (not in a component) so both the login page and the tests reason about
 * the same rules, and so a `?next=` parameter can never become an open redirect.
 * ------------------------------------------------------------------------------------------------ */

/** Paths anybody may open, signed in or not: the public customer experience stays public. */
export const PUBLIC_PATHS = ['/', '/studio', '/result', '/professional'] as const;

/** Extra paths each role may open. Everything else falls back to the role's own home. */
export const ROLE_PATHS: Record<AccountRole, readonly string[]> = {
  ADMIN: ['/admin', '/pro'],
  PRO: ['/pro'],
  CUSTOMER: [],
};

/** True for a same-origin path: starts with a single `/`, no protocol, no `//host`. */
export function isLocalPath(value: unknown): boolean {
  if (typeof value !== 'string' || value === '') return false;
  if (!value.startsWith('/')) return false;
  if (value.startsWith('//')) return false;
  return !/[\\<>"]/.test(value);
}

export function pathOnly(value: string): string {
  const withoutQuery = value.split('?')[0] ?? value;
  return withoutQuery === '' ? '/' : withoutQuery;
}

export function mayOpenPath(role: AccountRole, path: string): boolean {
  const target = pathOnly(path);
  if ((PUBLIC_PATHS as readonly string[]).includes(target)) return true;
  return (ROLE_PATHS[role] ?? []).some((allowed) => target === allowed || target.startsWith(`${allowed}/`));
}

/**
 * Where a successful sign-in goes. The server already sends the authoritative destination; this
 * only decides whether a requested `?next=` path is permitted for that role, and otherwise falls
 * back to the role home. Nobody picks their own role, and nobody is sent off-site.
 */
export function resolvePostSignInPath(role: AccountRole, next?: string | null, serverRedirect?: string | null): string {
  if (typeof next === 'string' && isLocalPath(next) && mayOpenPath(role, next)) return next;
  if (typeof serverRedirect === 'string' && isLocalPath(serverRedirect)) return serverRedirect;
  return homePathForRole(role);
}
