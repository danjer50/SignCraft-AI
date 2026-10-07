import { isAccountRole, isAccountStatus, type AuthAccount } from '../../src/domain/auth';
import type { AuthEnvironment, AuthState, IssuedSession, SessionClaims } from './types';

/**
 * Sessions are stateless, signed cookies (HMAC-SHA256 over a JSON claim set).
 *
 * Why this shape: the project has no database — it deploys as static assets plus Vercel Node
 * functions and Cloudflare Pages Functions — so a signed token is the simplest secure option that
 * works identically on both runtimes with no new infrastructure. The cookie is `HttpOnly`, so no
 * script in the page can read the token; the browser only ever asks `/api/auth/session` for the
 * public account shape.
 */

export const DEFAULT_COOKIE_NAME = 'signcraft_session';
export const DEFAULT_TTL_MINUTES = 12 * 60;
const MIN_TTL_MINUTES = 5;
const MAX_TTL_MINUTES = 60 * 24 * 30;
const MIN_SECRET_LENGTH = 32;

function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function bytesFromBase64Url(value: string): Uint8Array | null {
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}

export function cookieName(environment: AuthEnvironment): string {
  const custom = typeof environment.AUTH_COOKIE_NAME === 'string' ? environment.AUTH_COOKIE_NAME.trim() : '';
  return /^[A-Za-z0-9!#$%&'*+\-.^_`|~]{1,64}$/.test(custom) ? custom : DEFAULT_COOKIE_NAME;
}

export function sessionTtlMinutes(environment: AuthEnvironment): number {
  const parsed = Number(environment.AUTH_SESSION_TTL_MINUTES);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TTL_MINUTES;
  return Math.min(MAX_TTL_MINUTES, Math.max(MIN_TTL_MINUTES, Math.round(parsed)));
}

/** A secret that is missing or too short disables sessions entirely (fail closed). */
function signingKey(environment: AuthEnvironment): Uint8Array | null {
  const secret = environment.AUTH_SESSION_SECRET;
  if (typeof secret !== 'string' || secret.trim().length < MIN_SECRET_LENGTH) return null;
  return new TextEncoder().encode(secret);
}

async function hmacKey(secret: Uint8Array): Promise<CryptoKey | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  try {
    return await subtle.importKey('raw', secret as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  } catch {
    return null;
  }
}

export function parseCookieHeader(header: string | null): Record<string, string> {
  const jar: Record<string, string> = {};
  if (typeof header !== 'string' || header === '') return jar;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!name) continue;
    try {
      jar[name] = decodeURIComponent(value.replace(/^"|"$/g, ''));
    } catch {
      jar[name] = value.replace(/^"|"$/g, '');
    }
  }
  return jar;
}

function isSecureContext(request: Request | null): boolean {
  if (!request) return true;
  try {
    const url = new URL(request.url);
    if (url.protocol === 'https:') return true;
    const host = url.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  } catch {
    return false;
  }
}

function sameSite(environment: AuthEnvironment, secure: boolean): 'Lax' | 'Strict' | 'None' {
  const requested = typeof environment.AUTH_COOKIE_SAME_SITE === 'string' ? environment.AUTH_COOKIE_SAME_SITE.trim().toLowerCase() : 'lax';
  // SameSite=None is only honoured over HTTPS (browsers reject it otherwise) and is meant for the
  // case where the app is embedded in a frame on another site.
  if (requested === 'none') return secure ? 'None' : 'Lax';
  if (requested === 'strict') return 'Strict';
  return 'Lax';
}

/** Builds a `Set-Cookie` value: HttpOnly always, Secure on HTTPS/localhost, explicit Max-Age. */
function buildCookie(environment: AuthEnvironment, request: Request | null, value: string, maxAgeSeconds: number): string {
  const secure = isSecureContext(request);
  const parts = [
    `${cookieName(environment)}=${value}`,
    'Path=/',
    'HttpOnly',
    `SameSite=${sameSite(environment, secure)}`,
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/** Signs the claim set. Returns null when the runtime or the secret cannot sign. */
export async function signSessionToken(claims: SessionClaims, environment: AuthEnvironment): Promise<string | null> {
  const secret = signingKey(environment);
  if (!secret) return null;
  const key = await hmacKey(secret);
  if (!key) return null;
  const payload = base64UrlFromBytes(new TextEncoder().encode(JSON.stringify(claims)));
  try {
    const signature = await globalThis.crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
    return `${payload}.${base64UrlFromBytes(new Uint8Array(signature))}`;
  } catch {
    return null;
  }
}

export type TokenVerification =
  | { status: 'VALID'; claims: SessionClaims }
  | { status: 'EXPIRED' }
  | { status: 'INVALID' };

/** Verifies the signature and every claim; a token that lies about its role is rejected. */
export async function verifySessionToken(token: string, environment: AuthEnvironment): Promise<TokenVerification> {
  if (typeof token !== 'string' || token.length === 0 || token.length > 4096) return { status: 'INVALID' };
  const secret = signingKey(environment);
  if (!secret) return { status: 'INVALID' };
  const separator = token.lastIndexOf('.');
  if (separator <= 0 || separator === token.length - 1) return { status: 'INVALID' };
  const payload = token.slice(0, separator);
  const signature = bytesFromBase64Url(token.slice(separator + 1));
  if (!signature) return { status: 'INVALID' };
  const key = await hmacKey(secret);
  if (!key) return { status: 'INVALID' };

  let valid = false;
  try {
    valid = await globalThis.crypto.subtle.verify('HMAC', key, signature as BufferSource, new TextEncoder().encode(payload));
  } catch {
    return { status: 'INVALID' };
  }
  if (!valid) return { status: 'INVALID' };

  const decoded = bytesFromBase64Url(payload);
  if (!decoded) return { status: 'INVALID' };
  let claims: unknown;
  try {
    claims = JSON.parse(new TextDecoder().decode(decoded));
  } catch {
    return { status: 'INVALID' };
  }
  if (typeof claims !== 'object' || claims === null || Array.isArray(claims)) return { status: 'INVALID' };
  const source = claims as Record<string, unknown>;
  if (typeof source.sub !== 'string' || typeof source.sid !== 'string') return { status: 'INVALID' };
  if (!isAccountRole(source.role) || !isAccountStatus(source.status)) return { status: 'INVALID' };
  if (typeof source.exp !== 'number' || typeof source.iat !== 'number') return { status: 'INVALID' };
  if (source.exp <= Math.floor(Date.now() / 1000)) return { status: 'EXPIRED' };

  return {
    status: 'VALID',
    claims: {
      sub: source.sub,
      sid: source.sid,
      role: source.role,
      username: typeof source.username === 'string' ? source.username.slice(0, 80) : '',
      email: typeof source.email === 'string' ? source.email.slice(0, 254) : '',
      status: source.status,
      iat: source.iat,
      exp: source.exp,
    },
  };
}

function randomId(bytes: number): string {
  const buffer = globalThis.crypto.getRandomValues(new Uint8Array(bytes));
  return base64UrlFromBytes(buffer);
}

/** Issues the session cookie for an authenticated account. */
export async function issueSession(
  account: AuthAccount,
  environment: AuthEnvironment,
  request: Request | null = null,
): Promise<IssuedSession | null> {
  if (!signingKey(environment)) return null;
  const ttlMinutes = sessionTtlMinutes(environment);
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAtSeconds = issuedAt + ttlMinutes * 60;
  const token = await signSessionToken({
    sub: account.id,
    sid: randomId(16),
    role: account.role,
    username: account.username,
    email: account.email,
    status: account.status,
    iat: issuedAt,
    exp: expiresAtSeconds,
  }, environment);
  if (!token) return null;
  return {
    cookieHeader: buildCookie(environment, request, token, ttlMinutes * 60),
    expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
  };
}

/** Expired cookie that removes the session from the browser. */
export function signedOutCookie(environment: AuthEnvironment, request: Request | null = null): string {
  return buildCookie(environment, request, '', 0);
}

export function readSessionToken(request: Request, environment: AuthEnvironment): string | null {
  const jar = parseCookieHeader(request.headers.get('cookie'));
  const token = jar[cookieName(environment)];
  return typeof token === 'string' && token !== '' ? token : null;
}

/** Resolves the request into an authenticated account, or explains why it is not. */
export async function readAuthState(request: Request, environment: AuthEnvironment): Promise<AuthState> {
  if (!signingKey(environment)) return { status: 'UNAUTHENTICATED', reason: 'NOT_CONFIGURED' };
  const token = readSessionToken(request, environment);
  if (!token) return { status: 'UNAUTHENTICATED', reason: 'MISSING' };
  const verification = await verifySessionToken(token, environment);
  if (verification.status === 'EXPIRED') return { status: 'UNAUTHENTICATED', reason: 'EXPIRED' };
  if (verification.status === 'INVALID') return { status: 'UNAUTHENTICATED', reason: 'INVALID' };

  const claims = verification.claims;
  if (claims.status !== 'ACTIVE') return { status: 'UNAUTHENTICATED', reason: 'INVALID' };

  return {
    status: 'AUTHENTICATED',
    account: {
      id: claims.sub,
      username: claims.username,
      email: claims.email,
      role: claims.role,
      status: claims.status,
      createdAt: new Date(claims.iat * 1000).toISOString(),
    },
    claims,
    expiresAt: new Date(claims.exp * 1000).toISOString(),
  };
}
