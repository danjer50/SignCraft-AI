import { homePathForRole, normalizeAuthAccount } from '../../src/domain/auth';
import { equalizeTiming, verifyPassword } from '../auth/passwords';
import { authenticate, authFailure, isSameOriginRequest, jsonResponse } from '../auth/guard';
import { issueSession, signedOutCookie } from '../auth/sessions';
import { createUserRepository } from '../auth/users';
import type { AuthEnvironment } from '../auth/types';

/**
 * Authentication HTTP handlers: one shared login for every role.
 *
 * The role is resolved here, on the server, from the verified account record. The client receives
 * the public account shape plus the path it must go to (`redirect`) and never chooses its own role.
 */

const MAX_LOGIN_BODY_BYTES = 16 * 1024;

/** Credentials are checked against these limits before any hashing work happens. */
const MAX_IDENTIFIER_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 256;

/* --- best-effort throttling -----------------------------------------------------------------
 * Serverless instances are short-lived, so this is a bounded in-memory brake on repeated failed
 * attempts, not a durable lockout. It is deliberately small and self-cleaning so it can never grow
 * without limit or lock out a whole deployment.
 * -------------------------------------------------------------------------------------------- */
const THROTTLE_WINDOW_MS = 10 * 60 * 1000;
const THROTTLE_MAX_FAILURES = 5;
const THROTTLE_MAX_ENTRIES = 500;
const failures = new Map<string, { count: number; resetAt: number }>();

function throttleKey(request: Request, identifier: string): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const address = (forwarded ? forwarded.split(',')[0]!.trim() : '') || 'unknown';
  return `${address}·${identifier.trim().toLowerCase()}`;
}

function isThrottled(key: string): boolean {
  const entry = failures.get(key);
  if (!entry) return false;
  if (entry.resetAt < Date.now()) {
    failures.delete(key);
    return false;
  }
  return entry.count >= THROTTLE_MAX_FAILURES;
}

function recordFailure(key: string): void {
  const now = Date.now();
  for (const [storedKey, entry] of failures) {
    if (entry.resetAt < now) failures.delete(storedKey);
  }
  if (failures.size >= THROTTLE_MAX_ENTRIES && !failures.has(key)) {
    const oldest = failures.keys().next().value;
    if (oldest !== undefined) failures.delete(oldest);
  }
  const entry = failures.get(key);
  if (entry && entry.resetAt >= now) {
    entry.count += 1;
  } else {
    failures.set(key, { count: 1, resetAt: now + THROTTLE_WINDOW_MS });
  }
}

function clearFailures(key: string): void {
  failures.delete(key);
}

/** Test helper: keeps throttling deterministic between cases. */
export function resetLoginThrottling(): void {
  failures.clear();
}

async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const declared = Number(request.headers.get('content-length') ?? 0);
    if (declared > MAX_LOGIN_BODY_BYTES) return null;
    const raw = await request.text();
    if (raw.length > MAX_LOGIN_BODY_BYTES) return null;
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function pickIdentifier(body: Record<string, unknown>): string {
  for (const key of ['identifier', 'username', 'email', 'login'] as const) {
    const value = body[key];
    if (typeof value === 'string' && value.trim() !== '') return value.trim().slice(0, MAX_IDENTIFIER_LENGTH);
  }
  return '';
}

function pickPassword(body: Record<string, unknown>): string {
  const value = body.password;
  return typeof value === 'string' ? value.slice(0, MAX_PASSWORD_LENGTH) : '';
}

/** POST /api/auth/login — one endpoint, three roles, server-decided destination. */
export async function handleLogin(request: Request, environment: AuthEnvironment): Promise<Response> {
  if (request.method !== 'POST') {
    return authFailure(405, 'METHOD_NOT_ALLOWED', 'Use POST to sign in.');
  }
  if (!isSameOriginRequest(request)) {
    return authFailure(403, 'FORBIDDEN', 'Cross-site sign-in is blocked.');
  }

  const body = await readJsonBody(request);
  if (!body) {
    return authFailure(400, 'MALFORMED_REQUEST', 'The sign-in request could not be read. Please try again.');
  }

  const identifier = pickIdentifier(body);
  const password = pickPassword(body);
  if (!identifier || !password) {
    return authFailure(400, 'MISSING_CREDENTIALS', 'Enter your email or username and your password.');
  }

  const repository = createUserRepository(environment);
  if (!repository.configured) {
    return authFailure(503, 'AUTH_NOT_CONFIGURED', 'Authentication is not configured on this deployment yet.');
  }

  const key = throttleKey(request, identifier);
  if (isThrottled(key)) {
    return authFailure(429, 'TOO_MANY_ATTEMPTS', 'Too many attempts. Wait a few minutes, then sign in again.');
  }

  const account = repository.findAccount(identifier);
  if (!account) {
    // Same cost and same answer as a wrong password: no account enumeration.
    await equalizeTiming();
    recordFailure(key);
    return authFailure(401, 'INVALID_CREDENTIALS', 'These credentials do not match an account.');
  }

  const passwordMatches = await verifyPassword(password, account.passwordHash);
  if (!passwordMatches) {
    recordFailure(key);
    return authFailure(401, 'INVALID_CREDENTIALS', 'These credentials do not match an account.');
  }

  if (account.status !== 'ACTIVE') {
    return authFailure(403, 'ACCOUNT_NOT_ACTIVE', 'This account is not active. Contact the SignCraft studio.');
  }

  const publicAccount = normalizeAuthAccount({
    id: account.id,
    username: account.username,
    email: account.email,
    role: account.role,
    status: account.status,
    createdAt: account.createdAt,
  });
  if (!publicAccount) {
    return authFailure(503, 'UNEXPECTED', 'This account could not be resolved. Contact the SignCraft studio.');
  }

  const session = await issueSession(publicAccount, environment, request);
  if (!session) {
    return authFailure(503, 'AUTH_NOT_CONFIGURED', 'Sessions cannot be signed on this deployment (AUTH_SESSION_SECRET).');
  }

  clearFailures(key);
  return jsonResponse(200, {
    status: 'AUTHENTICATED',
    account: publicAccount,
    redirect: homePathForRole(publicAccount.role),
    expiresAt: session.expiresAt,
  }, { 'set-cookie': session.cookieHeader });
}

/** GET /api/auth/session — what the SPA boots from. Never returns a hash or a secret. */
export async function handleSession(request: Request, environment: AuthEnvironment): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return authFailure(405, 'METHOD_NOT_ALLOWED', 'Use GET to read the current session.');
  }

  const state = await authenticate(request, environment);
  if (state.status !== 'AUTHENTICATED') {
    if (state.reason === 'NOT_CONFIGURED') {
      return authFailure(503, 'AUTH_NOT_CONFIGURED', 'Authentication is not configured on this deployment yet.');
    }
    const code = state.reason === 'EXPIRED' ? 'SESSION_EXPIRED' : state.reason === 'INVALID' ? 'SESSION_INVALID' : 'SESSION_REQUIRED';
    const message = state.reason === 'EXPIRED'
      ? 'Your session expired. Sign in again.'
      : state.reason === 'INVALID'
        ? 'Your session could not be verified. Sign in again.'
        : 'You are not signed in.';
    return jsonResponse(401, { status: 'UNAUTHENTICATED', reason: state.reason, code, message });
  }

  return jsonResponse(200, {
    status: 'AUTHENTICATED',
    account: state.account,
    redirect: homePathForRole(state.account.role),
    expiresAt: state.expiresAt,
  });
}

/** POST /api/auth/logout — always succeeds and always clears the cookie. */
export async function handleLogout(request: Request, environment: AuthEnvironment): Promise<Response> {
  if (request.method !== 'POST') {
    return authFailure(405, 'METHOD_NOT_ALLOWED', 'Use POST to sign out.');
  }
  if (!isSameOriginRequest(request)) {
    return authFailure(403, 'FORBIDDEN', 'Cross-site sign-out is blocked.');
  }
  clearFailures(throttleKey(request, ''));
  return jsonResponse(200, { status: 'SIGNED_OUT' }, { 'set-cookie': signedOutCookie(environment, request) });
}
