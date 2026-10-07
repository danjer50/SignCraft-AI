// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ITERATIONS,
  MINIMUM_ITERATIONS,
  hashPassword,
  isPasswordHash,
  parsePasswordHash,
  timingSafeEqual,
  verifyPassword,
} from './passwords.js';
import {
  DEFAULT_COOKIE_NAME,
  cookieName,
  issueSession,
  parseCookieHeader,
  readAuthState,
  sessionTtlMinutes,
  signSessionToken,
  signedOutCookie,
  verifySessionToken,
} from './sessions.js';
import { createUserRepository, diagnoseUserStore } from './users.js';
import type { AuthEnvironment } from './types.js';
import type { AuthAccount } from '../../src/domain/auth.js';

/**
 * Throwaway fixture secrets. They exist only inside this test file, they are not credentials for
 * any deployment, and no real password is ever written into the repository, logs or docs.
 */
const FIXTURE_SECRET = 'fixture-only-session-secret-value-that-is-long-enough';
const FIXTURE_PASSWORD = 'fixture-only-not-a-real-password';
const FIXTURE_WRONG_PASSWORD = 'fixture-only-a-different-password';

async function fixtureHash(password = FIXTURE_PASSWORD): Promise<string> {
  return hashPassword(password, { iterations: MINIMUM_ITERATIONS });
}

function environment(overrides: Partial<AuthEnvironment> = {}): AuthEnvironment {
  return { AUTH_SESSION_SECRET: FIXTURE_SECRET, ...overrides };
}

const ownerAccount: AuthAccount = {
  id: 'owner',
  username: 'owner',
  email: 'owner@signcraft.example',
  role: 'ADMIN',
  status: 'ACTIVE',
  createdAt: new Date(0).toISOString(),
};

describe('password hashing', () => {
  it('stores a salted PBKDF2 hash and never the plaintext', async () => {
    const stored = await fixtureHash();

    expect(isPasswordHash(stored)).toBe(true);
    expect(stored).not.toContain(FIXTURE_PASSWORD);
    expect(stored.startsWith(`pbkdf2-sha256$${MINIMUM_ITERATIONS}$`)).toBe(true);
    expect(parsePasswordHash(stored)?.salt).toHaveLength(16);
  });

  it('verifies the right password and rejects a wrong one', async () => {
    const stored = await fixtureHash();

    expect(await verifyPassword(FIXTURE_PASSWORD, stored)).toBe(true);
    expect(await verifyPassword(FIXTURE_WRONG_PASSWORD, stored)).toBe(false);
    expect(await verifyPassword('', stored)).toBe(false);
  });

  it('produces a different hash for the same password (unique salt)', async () => {
    expect(await fixtureHash()).not.toBe(await fixtureHash());
  });

  it('refuses plaintext or malformed stored values instead of comparing them', async () => {
    expect(isPasswordHash('1234')).toBe(false);
    expect(isPasswordHash('admin')).toBe(false);
    expect(await verifyPassword('1234', '1234')).toBe(false);
    expect(await verifyPassword('admin', 'admin')).toBe(false);
    expect(await verifyPassword(FIXTURE_PASSWORD, 'pbkdf2-sha256$1000$AAAA$BBBB')).toBe(false);
    expect(await verifyPassword(FIXTURE_PASSWORD, 'not-a-hash')).toBe(false);
  });

  it('rejects iteration counts below the accepted floor', async () => {
    expect(parsePasswordHash(`pbkdf2-sha256$999$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`)).toBeNull();
    expect(DEFAULT_ITERATIONS).toBeGreaterThanOrEqual(MINIMUM_ITERATIONS);
    await expect(hashPassword(FIXTURE_PASSWORD, { iterations: 1000 })).rejects.toThrow();
  });

  it('refuses passwords that are too short or too long', async () => {
    await expect(hashPassword('short')).rejects.toThrow();
    await expect(hashPassword('x'.repeat(400))).rejects.toThrow();
  });

  it('compares byte strings in constant time', () => {
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2]))).toBe(false);
  });
});

describe('session tokens and cookies', () => {
  it('signs and verifies a token that carries the role', async () => {
    const token = await signSessionToken({
      sub: ownerAccount.id,
      sid: 'session-fixture',
      role: 'ADMIN',
      username: ownerAccount.username,
      email: ownerAccount.email,
      status: 'ACTIVE',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 600,
    }, environment());

    expect(token).toBeTruthy();
    const verified = await verifySessionToken(token as string, environment());
    expect(verified.status).toBe('VALID');
    if (verified.status === 'VALID') {
      expect(verified.claims.role).toBe('ADMIN');
      expect(verified.claims.sub).toBe('owner');
    }
  });

  it('rejects a tampered token, a foreign secret and an expired token', async () => {
    const token = (await signSessionToken({
      sub: 'owner', sid: 's', role: 'ADMIN', username: 'owner', email: '', status: 'ACTIVE',
      iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600,
    }, environment())) as string;

    const [payload, signature] = token.split('.');
    const forgedAdmin = JSON.stringify({ sub: 'attacker', sid: 'x', role: 'ADMIN', username: 'x', email: '', status: 'ACTIVE', iat: 0, exp: Math.floor(Date.now() / 1000) + 600 });
    const forgedPayload = Buffer.from(forgedAdmin, 'utf8').toString('base64url');

    expect((await verifySessionToken(`${forgedPayload}.${signature}`, environment())).status).toBe('INVALID');
    expect((await verifySessionToken(`${payload}.${signature!.slice(0, -2)}aa`, environment())).status).toBe('INVALID');
    expect((await verifySessionToken(token, environment({ AUTH_SESSION_SECRET: 'a-completely-different-secret-value-32chars' }))).status).toBe('INVALID');
    expect((await verifySessionToken('garbage', environment())).status).toBe('INVALID');

    const expired = (await signSessionToken({
      sub: 'owner', sid: 's', role: 'ADMIN', username: 'owner', email: '', status: 'ACTIVE',
      iat: Math.floor(Date.now() / 1000) - 7200, exp: Math.floor(Date.now() / 1000) - 3600,
    }, environment())) as string;
    expect((await verifySessionToken(expired, environment())).status).toBe('EXPIRED');
  });

  it('refuses to sign or verify without a strong secret', async () => {
    expect(await signSessionToken({
      sub: 'owner', sid: 's', role: 'ADMIN', username: 'owner', email: '', status: 'ACTIVE', iat: 0, exp: 9999999999,
    }, { AUTH_SESSION_SECRET: 'too-short' })).toBeNull();
    expect(await issueSession(ownerAccount, {})).toBeNull();
    expect((await verifySessionToken('anything.anything', {})).status).toBe('INVALID');
  });

  it('issues an HttpOnly cookie and clears it on sign-out', async () => {
    const request = new Request('https://signcraft.example/api/auth/login', { method: 'POST' });
    const issued = await issueSession(ownerAccount, environment(), request);

    expect(issued).not.toBeNull();
    const cookie = issued!.cookieHeader;
    expect(cookie).toContain(`${DEFAULT_COOKIE_NAME}=`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).not.toContain(FIXTURE_SECRET);

    const cleared = signedOutCookie(environment(), request);
    expect(cleared).toContain('Max-Age=0');
    expect(cleared).toContain('HttpOnly');
  });

  it('reads a session back from the cookie it issued', async () => {
    const issued = (await issueSession(ownerAccount, environment()))!;
    const token = issued.cookieHeader.split(';')[0]!;
    const request = new Request('https://signcraft.example/api/admin/overview', { headers: { cookie: token } });

    const state = await readAuthState(request, environment());
    expect(state.status).toBe('AUTHENTICATED');
    if (state.status === 'AUTHENTICATED') {
      expect(state.account.role).toBe('ADMIN');
      expect(state.expiresAt).toBe(issued.expiresAt);
      expect(JSON.stringify(state.account)).not.toContain(FIXTURE_SECRET);
    }
  });

  it('reports a missing, expired or malformed cookie instead of throwing', async () => {
    expect((await readAuthState(new Request('https://signcraft.example/'), environment())).status).toBe('UNAUTHENTICATED');
    const malformed = new Request('https://signcraft.example/', { headers: { cookie: `${DEFAULT_COOKIE_NAME}=%E0%A4%A` } });
    expect((await readAuthState(malformed, environment())).status).toBe('UNAUTHENTICATED');
    expect((await readAuthState(new Request('https://signcraft.example/'), {})).status).toBe('UNAUTHENTICATED');
  });

  it('parses cookie headers and honours the configured name, TTL and SameSite', () => {
    expect(parseCookieHeader('a=1; b=2; c')).toEqual({ a: '1', b: '2' });
    expect(parseCookieHeader(null)).toEqual({});
    expect(cookieName({ AUTH_COOKIE_NAME: 'signcraft' })).toBe('signcraft');
    expect(cookieName({ AUTH_COOKIE_NAME: 'has space' })).toBe(DEFAULT_COOKIE_NAME);
    expect(sessionTtlMinutes({})).toBe(720);
    expect(sessionTtlMinutes({ AUTH_SESSION_TTL_MINUTES: '30' })).toBe(30);
    expect(sessionTtlMinutes({ AUTH_SESSION_TTL_MINUTES: '-5' })).toBe(720);
    expect(signedOutCookie(environment({ AUTH_COOKIE_SAME_SITE: 'none' }), new Request('https://x.example/'))).toContain('SameSite=None');
    // SameSite=None without HTTPS is downgraded: browsers would reject the cookie otherwise.
    expect(signedOutCookie(environment({ AUTH_COOKIE_SAME_SITE: 'none' }), new Request('http://signcraft.example/'))).toContain('SameSite=Lax');
  });
});

describe('environment-backed account store', () => {
  it('loads exactly one ADMIN: the configured owner', async () => {
    const repository = createUserRepository(environment({
      AUTH_OWNER_USERNAME: 'owner',
      AUTH_OWNER_EMAIL: 'owner@signcraft.example',
      AUTH_OWNER_PASSWORD_HASH: await fixtureHash(),
    }));

    expect(repository.configured).toBe(true);
    const accounts = repository.listAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0]!.role).toBe('ADMIN');
    expect(JSON.stringify(accounts)).not.toContain('pbkdf2-sha256');
    expect(repository.findAccount('OWNER@signcraft.example')?.role).toBe('ADMIN');
    expect(repository.findAccount('nobody@example.com')).toBeNull();
  });

  it('refuses ADMIN entries coming from AUTH_USERS_JSON', async () => {
    const hash = await fixtureHash();
    const diagnostics = diagnoseUserStore(environment({
      AUTH_USERS_JSON: JSON.stringify([
        { id: 'self-made-admin', username: 'intruder', email: 'intruder@example.com', role: 'ADMIN', passwordHash: hash },
        { id: 'pro-1', username: 'atelier', email: 'atelier@example.com', role: 'PRO', passwordHash: hash },
      ]),
    }));

    expect(diagnostics.admins).toBe(0);
    expect(diagnostics.pro).toBe(1);
    expect(diagnostics.issues.join(' ')).toMatch(/ADMIN entries in AUTH_USERS_JSON are refused/);
  });

  it('reports a plaintext or malformed owner hash instead of accepting it', async () => {
    const diagnostics = diagnoseUserStore(environment({
      AUTH_OWNER_EMAIL: 'owner@signcraft.example',
      AUTH_OWNER_PASSWORD_HASH: '1234',
    }));

    expect(diagnostics.configured).toBe(false);
    expect(diagnostics.issues.join(' ')).toMatch(/not a valid PBKDF2 hash/);
    expect(diagnostics.issues.join(' ')).toMatch(/npm run hash-password/);
    expect(createUserRepository(environment({ AUTH_OWNER_PASSWORD_HASH: '1234' })).configured).toBe(false);
  });

  it('recognizes a hash that a dotenv loader truncated by expanding $', async () => {
    // `$210000$salt$digest` becomes `pbkdf2-sha256$210000==$digest` when `$salt` is expanded away.
    const diagnostics = diagnoseUserStore(environment({
      AUTH_OWNER_EMAIL: 'owner@signcraft.example',
      AUTH_OWNER_PASSWORD_HASH: 'pbkdf2-sha256$210000==$5w9LU1awACsIO5Jk5GcL',
    }));

    expect(diagnostics.configured).toBe(false);
    expect(diagnostics.issues.join(' ')).toMatch(/escape/);
  });

  it('survives malformed AUTH_USERS_JSON and an account with no usable identifier', async () => {
    const diagnostics = diagnoseUserStore(environment({ AUTH_USERS_JSON: '{not json' }));
    expect(diagnostics.configured).toBe(false);
    expect(diagnostics.issues.join(' ')).toMatch(/not valid JSON/);

    const hash = await fixtureHash();
    const partial = diagnoseUserStore(environment({
      AUTH_USERS_JSON: JSON.stringify([{ role: 'PRO', passwordHash: hash }, 'nope', null, { username: 'ok', role: 'PRO', passwordHash: hash }]),
    }));
    expect(partial.accounts).toBe(1);
    expect(partial.issues.length).toBeGreaterThan(0);
  });

  it('keeps write operations honest until a durable store is attached', async () => {
    const repository = createUserRepository(environment({ AUTH_OWNER_PASSWORD_HASH: await fixtureHash() }));
    expect(await repository.createProAccount({ username: 'x', email: 'x@example.com', password: 'y' })).toEqual({ ok: false, code: 'WRITE_STORE_NOT_CONFIGURED' });
    expect(await repository.setAccountStatus('x', 'SUSPENDED')).toEqual({ ok: false, code: 'WRITE_STORE_NOT_CONFIGURED' });
    expect(await repository.removeAccount('x')).toEqual({ ok: false, code: 'WRITE_STORE_NOT_CONFIGURED' });
  });

  it('finds a suspended account and keeps its status', async () => {
    const hash = await fixtureHash();
    const repository = createUserRepository(environment({
      AUTH_USERS_JSON: JSON.stringify([{ id: 'pro-2', username: 'suspended-pro', role: 'PRO', status: 'SUSPENDED', passwordHash: hash }]),
    }));
    expect(repository.findAccount('suspended-pro')?.status).toBe('SUSPENDED');
    expect(repository.listAccounts()[0]!.status).toBe('SUSPENDED');
  });
});
