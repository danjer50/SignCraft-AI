import {
  normalizeAuthFailure,
  normalizeAuthSession,
  resolvePostSignInPath,
  type AuthFailure,
  type AuthSession,
} from '../../domain/auth';

/**
 * Browser side of authentication.
 *
 * The session lives in an HttpOnly cookie set by the server, so this module never sees a token, a
 * password hash or a secret: it posts credentials, then only ever handles the public account shape.
 * Every failure path returns a typed result — a missing API, an HTML answer where JSON was
 * expected, a network error or a hostile payload all become a message the UI can show instead of a
 * blank screen or a crash.
 */

import { JSON_HEADERS, SERVICE_UNAVAILABLE, readJsonBody, sendJsonRequest } from './httpJson';

const SESSION_PATH = '/api/auth/session';
const LOGIN_PATH = '/api/auth/login';
const LOGOUT_PATH = '/api/auth/logout';

export type SessionStatus = 'anonymous' | 'authenticated' | 'unavailable';

export interface SessionSnapshot {
  status: SessionStatus;
  session: AuthSession | null;
  failure: AuthFailure | null;
}

export type SignInOutcome =
  | { status: 'AUTHENTICATED'; session: AuthSession; redirect: string }
  | { status: 'REJECTED'; failure: AuthFailure }
  | { status: 'UNAVAILABLE'; failure: AuthFailure };

/** Reads the current session. Safe to call on every app start; it never throws. */
export async function fetchSessionSnapshot(): Promise<SessionSnapshot> {
  let response: Response;
  try {
    response = await sendJsonRequest(SESSION_PATH, { method: 'GET', headers: { accept: 'application/json' } });
  } catch {
    return { status: 'unavailable', session: null, failure: SERVICE_UNAVAILABLE };
  }

  const body = await readJsonBody(response);
  if (!body) {
    if (response.status === 401 || response.status === 404) return { status: 'anonymous', session: null, failure: null };
    return { status: 'unavailable', session: null, failure: SERVICE_UNAVAILABLE };
  }

  if (response.status === 200 && body.status === 'AUTHENTICATED') {
    const session = normalizeAuthSession(body);
    // A payload that claims to be authenticated but does not parse is treated as signed out.
    return session
      ? { status: 'authenticated', session, failure: null }
      : { status: 'anonymous', session: null, failure: null };
  }

  if (response.status === 401) return { status: 'anonymous', session: null, failure: normalizeAuthFailure(body) };
  if (response.status === 503) return { status: 'unavailable', session: null, failure: normalizeAuthFailure(body) };
  return { status: 'unavailable', session: null, failure: normalizeAuthFailure(body) };
}

/**
 * Signs in with an email or username plus a password. The server answers with the account and the
 * path that account is allowed to open; `resolvePostSignInPath` keeps a `?next=` parameter honest.
 */
export async function requestSignIn(identifier: string, password: string, next?: string | null): Promise<SignInOutcome> {
  if (typeof identifier !== 'string' || identifier.trim() === '' || typeof password !== 'string' || password === '') {
    return { status: 'REJECTED', failure: { code: 'MISSING_CREDENTIALS', message: '' } };
  }

  let response: Response;
  try {
    response = await sendJsonRequest(LOGIN_PATH, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ identifier: identifier.trim().slice(0, 254), password: password.slice(0, 256) }),
    });
  } catch {
    return { status: 'UNAVAILABLE', failure: SERVICE_UNAVAILABLE };
  }

  const body = await readJsonBody(response);
  if (!body) return { status: 'UNAVAILABLE', failure: SERVICE_UNAVAILABLE };

  if (response.status === 200 && body.status === 'AUTHENTICATED') {
    const session = normalizeAuthSession({ account: body.account, expiresAt: body.expiresAt });
    if (!session) return { status: 'UNAVAILABLE', failure: { code: 'UNEXPECTED', message: '' } };
    const serverRedirect = typeof body.redirect === 'string' ? body.redirect : null;
    return {
      status: 'AUTHENTICATED',
      session,
      redirect: resolvePostSignInPath(session.account.role, next, serverRedirect),
    };
  }

  if (response.status === 503) return { status: 'UNAVAILABLE', failure: normalizeAuthFailure(body) };
  return { status: 'REJECTED', failure: normalizeAuthFailure(body) };
}

/** Signs out. A failed call still clears the local session so the UI is never stuck signed in. */
export async function requestSignOut(): Promise<boolean> {
  try {
    const response = await sendJsonRequest(LOGOUT_PATH, { method: 'POST', headers: JSON_HEADERS });
    return response.ok;
  } catch {
    return false;
  }
}
