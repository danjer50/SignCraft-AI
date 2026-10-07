// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { handleLogin, handleLogout, handleSession, resetLoginThrottling } from './auth.js';
import { handleAdminOverview, handleAdminProAccounts, handleAdminUsers, ADMIN_SECTION_IDS } from './admin.js';
import { MINIMUM_ITERATIONS, hashPassword } from '../auth/passwords.js';
import { signSessionToken } from '../auth/sessions.js';
import type { AuthEnvironment } from '../auth/types.js';

/**
 * Fixture credentials for these tests only. They are not deployed anywhere, they are not the
 * owner's password, and no real secret is written into the repository, logs or documentation.
 */
const FIXTURE_SECRET = 'fixture-only-session-secret-value-that-is-long-enough';
const OWNER_PASSWORD = 'fixture-only-owner-password-value';
const PRO_PASSWORD = 'fixture-only-pro-password-value';
const CUSTOMER_PASSWORD = 'fixture-only-customer-password-value';

const ORIGIN = 'https://signcraft.example';

/** Hashing is expensive, so the fixture environment is built once and copied per test. */
let cachedEnvironment: AuthEnvironment | null = null;

async function environment(): Promise<AuthEnvironment> {
  if (cachedEnvironment) return { ...cachedEnvironment };
  const built = {
    AUTH_SESSION_SECRET: FIXTURE_SECRET,
    AUTH_OWNER_USERNAME: 'owner',
    AUTH_OWNER_EMAIL: 'owner@signcraft.example',
    AUTH_OWNER_PASSWORD_HASH: await hashPassword(OWNER_PASSWORD, { iterations: MINIMUM_ITERATIONS }),
    AUTH_USERS_JSON: JSON.stringify([
      {
        id: 'pro-atelier',
        username: 'atelier',
        email: 'atelier@signcraft.example',
        role: 'PRO',
        passwordHash: await hashPassword(PRO_PASSWORD, { iterations: MINIMUM_ITERATIONS }),
      },
      {
        id: 'customer-sami',
        username: 'sami',
        email: 'sami@example.com',
        role: 'CUSTOMER',
        passwordHash: await hashPassword(CUSTOMER_PASSWORD, { iterations: MINIMUM_ITERATIONS }),
      },
      {
        id: 'pro-suspended',
        username: 'paused',
        email: 'paused@signcraft.example',
        role: 'PRO',
        status: 'SUSPENDED',
        passwordHash: await hashPassword(PRO_PASSWORD, { iterations: MINIMUM_ITERATIONS }),
      },
    ]),
    AI_PROVIDER: 'cloudflare-flux',
    QUOTE_STORAGE_PROVIDER: 'demo',
  };
  cachedEnvironment = built;
  return { ...built };
}

function loginRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function cookieOf(response: Response): string {
  const header = response.headers.get('set-cookie') ?? '';
  return header.split(';')[0] ?? '';
}

function signedInRequest(path: string, cookie: string, method = 'GET'): Request {
  return new Request(`${ORIGIN}${path}`, { method, headers: { cookie, origin: ORIGIN } });
}

async function signIn(env: AuthEnvironment, identifier: string, password: string): Promise<Response> {
  return handleLogin(loginRequest({ identifier, password }), env);
}

beforeEach(() => resetLoginThrottling());

describe('POST /api/auth/login', () => {
  it('signs the owner in as ADMIN and sends them to /admin', async () => {
    const env = await environment();
    const response = await signIn(env, 'owner@signcraft.example', OWNER_PASSWORD);
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.status).toBe('AUTHENTICATED');
    expect(body.redirect).toBe('/admin');
    expect((body.account as Record<string, unknown>).role).toBe('ADMIN');
    expect((body.account as Record<string, unknown>).email).toBe('owner@signcraft.example');
    // The response carries a session cookie and nothing secret.
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(JSON.stringify(body) + cookie).not.toContain(FIXTURE_SECRET);
    expect(JSON.stringify(body)).not.toContain('pbkdf2-sha256');
    expect(JSON.stringify(body)).not.toContain('passwordHash');
  });

  it('sends a PRO account to /pro and a customer to the public experience', async () => {
    const env = await environment();

    const pro = await signIn(env, 'atelier', PRO_PASSWORD);
    expect(pro.status).toBe(200);
    expect(((await pro.json()) as Record<string, unknown>).redirect).toBe('/pro');

    const customer = await signIn(env, 'sami@example.com', CUSTOMER_PASSWORD);
    expect(customer.status).toBe(200);
    const customerBody = (await customer.json()) as Record<string, unknown>;
    expect(customerBody.redirect).toBe('/');
    expect((customerBody.account as Record<string, unknown>).role).toBe('CUSTOMER');
  });

  it('rejects a wrong password without setting a session', async () => {
    const env = await environment();
    const response = await signIn(env, 'owner@signcraft.example', 'fixture-only-the-wrong-password');
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(401);
    expect(body.code).toBe('INVALID_CREDENTIALS');
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('answers an unknown account exactly like a wrong password (no enumeration)', async () => {
    const env = await environment();
    const unknown = await signIn(env, 'nobody@example.com', OWNER_PASSWORD);
    const wrong = await signIn(env, 'owner@signcraft.example', 'fixture-only-the-wrong-password');

    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect((await unknown.json()).message).toBe((await wrong.json()).message);
  });

  it('blocks a suspended account with an actionable message', async () => {
    const env = await environment();
    const response = await signIn(env, 'paused', PRO_PASSWORD);
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(403);
    expect(body.code).toBe('ACCOUNT_NOT_ACTIVE');
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('explains malformed, empty and cross-site requests instead of failing silently', async () => {
    const env = await environment();

    const malformed = await handleLogin(loginRequest('{"identifier":'), env);
    expect(malformed.status).toBe(400);
    expect(((await malformed.json()) as Record<string, unknown>).code).toBe('MALFORMED_REQUEST');

    const missing = await handleLogin(loginRequest({ identifier: 'owner' }), env);
    expect(missing.status).toBe(400);
    expect(((await missing.json()) as Record<string, unknown>).code).toBe('MISSING_CREDENTIALS');

    const wrongMethod = await handleLogin(new Request(`${ORIGIN}/api/auth/login`, { method: 'GET' }), env);
    expect(wrongMethod.status).toBe(405);

    const crossSite = await handleLogin(loginRequest({ identifier: 'owner', password: OWNER_PASSWORD }, { origin: 'https://attacker.example' }), env);
    expect(crossSite.status).toBe(403);
    expect(((await crossSite.json()) as Record<string, unknown>).code).toBe('FORBIDDEN');
  });

  it('reports an unconfigured deployment instead of pretending to authenticate', async () => {
    const response = await handleLogin(loginRequest({ identifier: 'owner', password: OWNER_PASSWORD }), {});
    expect(response.status).toBe(503);
    const body = await response.json() as Record<string, unknown>;
    expect(body.code).toBe('AUTH_NOT_CONFIGURED');
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('reports a missing signing secret even when accounts exist', async () => {
    const env = await environment();
    delete env.AUTH_SESSION_SECRET;
    const response = await signIn(env, 'owner@signcraft.example', OWNER_PASSWORD);
    expect(response.status).toBe(503);
    expect(((await response.json()) as Record<string, unknown>).code).toBe('AUTH_NOT_CONFIGURED');
  });

  it('slows down repeated failed attempts for the same identifier', async () => {
    const env = await environment();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const attemptResponse = await signIn(env, 'brute@example.com', 'fixture-only-a-guess');
      expect(attemptResponse.status).toBe(401);
    }
    const throttled = await signIn(env, 'brute@example.com', 'fixture-only-a-guess');
    expect(throttled.status).toBe(429);
    const throttledBody = (await throttled.json()) as Record<string, unknown>;
    expect(throttledBody.code).toBe('TOO_MANY_ATTEMPTS');
    expect(throttledBody.message).toMatch(/Too many attempts/);
  });
});

describe('GET /api/auth/session', () => {
  it('returns the signed-in account and its destination', async () => {
    const env = await environment();
    const cookie = cookieOf(await signIn(env, 'atelier', PRO_PASSWORD));
    const response = await handleSession(signedInRequest('/api/auth/session', cookie), env);
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.status).toBe('AUTHENTICATED');
    expect(body.redirect).toBe('/pro');
    expect(JSON.stringify(body)).not.toContain('pbkdf2-sha256');
  });

  it('answers 401 for a missing, tampered or expired session', async () => {
    const env = await environment();

    const missing = await handleSession(new Request(`${ORIGIN}/api/auth/session`), env);
    expect(missing.status).toBe(401);
    expect(((await missing.json()) as Record<string, unknown>).code).toBe('SESSION_REQUIRED');

    const cookie = cookieOf(await signIn(env, 'atelier', PRO_PASSWORD));
    const tampered = `${cookie.split('=')[0]}=${cookie.split('=')[1]!.slice(0, -3)}aaa`;
    const invalid = await handleSession(signedInRequest('/api/auth/session', tampered), env);
    expect(invalid.status).toBe(401);
    expect(((await invalid.json()) as Record<string, unknown>).code).toBe('SESSION_INVALID');

    // A role cannot be forged by editing the cookie: the signature no longer matches.
    const forgedPayload = Buffer.from(JSON.stringify({
      sub: 'pro-atelier', sid: 'x', role: 'ADMIN', username: 'atelier', email: '', status: 'ACTIVE',
      iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600,
    }), 'utf8').toString('base64url');
    const forged = await handleSession(signedInRequest('/api/auth/session', `signcraft_session=${forgedPayload}.${cookie.split('.')[1]}`), env);
    expect(forged.status).toBe(401);

    const expiredToken = await signSessionToken({
      sub: 'owner', sid: 'old', role: 'ADMIN', username: 'owner', email: '', status: 'ACTIVE',
      iat: Math.floor(Date.now() / 1000) - 7200, exp: Math.floor(Date.now() / 1000) - 60,
    }, env);
    const expired = await handleSession(signedInRequest('/api/auth/session', `signcraft_session=${expiredToken}`), env);
    expect(expired.status).toBe(401);
    expect(((await expired.json()) as Record<string, unknown>).code).toBe('SESSION_EXPIRED');
  });

  it('refuses a session cookie that claims a suspended status', async () => {
    const env = await environment();
    const token = await signSessionToken({
      sub: 'pro-suspended', sid: 's', role: 'PRO', username: 'paused', email: '', status: 'SUSPENDED',
      iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600,
    }, env);
    const response = await handleSession(signedInRequest('/api/auth/session', `signcraft_session=${token}`), env);
    expect(response.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the session cookie and never fails', async () => {
    const env = await environment();
    const response = await handleLogout(new Request(`${ORIGIN}/api/auth/logout`, { method: 'POST', headers: { origin: ORIGIN } }), env);
    const cookie = response.headers.get('set-cookie') ?? '';

    expect(response.status).toBe(200);
    expect((await response.json() as Record<string, unknown>).status).toBe('SIGNED_OUT');
    expect(cookie).toContain('Max-Age=0');
    expect(cookie).toContain('HttpOnly');

    const wrongMethod = await handleLogout(new Request(`${ORIGIN}/api/auth/logout`, { method: 'GET' }), env);
    expect(wrongMethod.status).toBe(405);

    const crossSite = await handleLogout(new Request(`${ORIGIN}/api/auth/logout`, { method: 'POST', headers: { origin: 'https://attacker.example' } }), env);
    expect(crossSite.status).toBe(403);
  });
});

describe('admin API authorization', () => {
  it('denies an anonymous visitor', async () => {
    const env = await environment();
    for (const handler of [handleAdminOverview, handleAdminUsers, handleAdminProAccounts]) {
      const response = await handler(new Request(`${ORIGIN}/api/admin/overview`), env);
      expect(response.status).toBe(401);
      const body = await response.json() as Record<string, unknown>;
      expect(body.code).toBe('SESSION_REQUIRED');
      expect(body.status).toBe('REJECTED');
    }
  });

  it('denies a signed-in PRO account and points it back to /pro', async () => {
    const env = await environment();
    const cookie = cookieOf(await signIn(env, 'atelier', PRO_PASSWORD));

    for (const handler of [handleAdminOverview, handleAdminUsers, handleAdminProAccounts]) {
      const response = await handler(signedInRequest('/api/admin/users', cookie), env);
      expect(response.status).toBe(403);
      const body = await response.json() as Record<string, unknown>;
      expect(body.code).toBe('FORBIDDEN');
      expect(body.redirect).toBe('/pro');
      expect(JSON.stringify(body)).not.toContain('passwordHash');
    }
  });

  it('denies a signed-in customer and points them back to the public experience', async () => {
    const env = await environment();
    const cookie = cookieOf(await signIn(env, 'sami@example.com', CUSTOMER_PASSWORD));

    const response = await handleAdminOverview(signedInRequest('/api/admin/overview', cookie), env);
    expect(response.status).toBe(403);
    expect(((await response.json()) as Record<string, unknown>).redirect).toBe('/');
  });

  it('serves the dashboard skeleton to the ADMIN only', async () => {
    const env = await environment();
    const cookie = cookieOf(await signIn(env, 'owner@signcraft.example', OWNER_PASSWORD));

    const overview = await handleAdminOverview(signedInRequest('/api/admin/overview', cookie), env);
    expect(overview.status).toBe(200);
    const overviewBody = await overview.json() as { sections: Array<{ id: string }> };
    expect(overviewBody.sections.map((section) => section.id)).toEqual([...ADMIN_SECTION_IDS]);

    const users = await handleAdminUsers(signedInRequest('/api/admin/users', cookie), env);
    expect(users.status).toBe(200);
    const usersBody = await users.json() as { accounts: Array<Record<string, unknown>> };
    expect(usersBody.accounts.map((account) => account.role).sort()).toEqual(['ADMIN', 'CUSTOMER', 'PRO', 'PRO']);
    expect(JSON.stringify(usersBody)).not.toContain('pbkdf2-sha256');
    expect(JSON.stringify(usersBody)).not.toContain('passwordHash');

    const proAccounts = await handleAdminProAccounts(signedInRequest('/api/admin/pro-accounts', cookie), env);
    expect(proAccounts.status).toBe(200);
    expect(((await proAccounts.json()) as { accounts: unknown[] }).accounts).toHaveLength(2);
  });

  it('answers Pro account writes with an honest 501 until a writable store exists', async () => {
    const env = await environment();
    const cookie = cookieOf(await signIn(env, 'owner@signcraft.example', OWNER_PASSWORD));

    const response = await handleAdminProAccounts(signedInRequest('/api/admin/pro-accounts', cookie, 'POST'), env);
    expect(response.status).toBe(501);
    const body = await response.json() as Record<string, unknown>;
    expect(body.code).toBe('WRITE_STORE_NOT_CONFIGURED');
    expect(body.allowedOperations).toEqual(['create', 'edit', 'suspend', 'disable', 'remove']);
  });

  it('rejects the wrong method on the admin endpoints', async () => {
    const env = await environment();
    const cookie = cookieOf(await signIn(env, 'owner@signcraft.example', OWNER_PASSWORD));
    const response = await handleAdminOverview(signedInRequest('/api/admin/overview', cookie, 'POST'), env);
    expect(response.status).toBe(405);
  });
});
