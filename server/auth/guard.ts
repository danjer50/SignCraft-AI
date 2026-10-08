import { homePathForRole, type AccountRole } from '../../src/domain/auth.js';
import { readAuthState } from './sessions.js';
import type { AuthEnvironment, AuthState } from './types.js';

/** Shared HTTP helpers for the authenticated surface. */

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

export function jsonResponse(status: number, body: unknown, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extraHeaders } });
}

export interface AuthFailureBody {
  status: 'REJECTED';
  code: string;
  message: string;
  redirect?: string;
}

/**
 * 401 = who are you / your session ended, 403 = we know who you are and this area is not yours.
 * A 403 always carries the caller's own permitted area so the UI can move them somewhere useful
 * instead of leaving a dead end.
 */
export function authFailure(status: 400 | 401 | 403 | 405 | 429 | 501 | 503, code: string, message: string, redirect?: string): Response {
  const body: AuthFailureBody = { status: 'REJECTED', code, message };
  if (redirect) body.redirect = redirect;
  return jsonResponse(status, body);
}

/**
 * CSRF guard for state-changing requests. Browsers send `Sec-Fetch-Site` (or `Origin`); a
 * cross-site submission is refused. Requests without those headers (server-to-server, curl) are
 * allowed through because the session cookie itself is still required.
 */
export function isSameOriginRequest(request: Request): boolean {
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return false;
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function authenticate(request: Request, environment: AuthEnvironment): Promise<AuthState> {
  try {
    return await readAuthState(request, environment);
  } catch {
    // A malformed cookie or a crypto failure must never become a 500 with a blank body.
    return { status: 'UNAUTHENTICATED', reason: 'INVALID' };
  }
}

export type AuthorizationResult =
  | { ok: true; state: AuthState & { status: 'AUTHENTICATED' } }
  | { ok: false; response: Response };

const UNAUTHENTICATED_CODES: Record<'MISSING' | 'EXPIRED' | 'INVALID' | 'NOT_CONFIGURED', { status: 401 | 503; code: string; message: string }> = {
  MISSING: { status: 401, code: 'SESSION_REQUIRED', message: 'Sign in to continue.' },
  EXPIRED: { status: 401, code: 'SESSION_EXPIRED', message: 'Your session expired. Sign in again.' },
  INVALID: { status: 401, code: 'SESSION_INVALID', message: 'Your session could not be verified. Sign in again.' },
  NOT_CONFIGURED: { status: 503, code: 'AUTH_NOT_CONFIGURED', message: 'Authentication is not configured on this deployment.' },
};

/** Server-side role authorization: the only gate that decides who reaches an admin/pro area. */
export async function requireRole(
  request: Request,
  environment: AuthEnvironment,
  allowed: readonly AccountRole[],
): Promise<AuthorizationResult> {
  const state = await authenticate(request, environment);
  if (state.status !== 'AUTHENTICATED') {
    const failure = UNAUTHENTICATED_CODES[state.reason];
    return { ok: false, response: authFailure(failure.status, failure.code, failure.message) };
  }
  if (!allowed.includes(state.account.role)) {
    return {
      ok: false,
      response: authFailure(403, 'FORBIDDEN', 'Your account does not have access to this area.', homePathForRole(state.account.role)),
    };
  }
  return { ok: true, state };
}
