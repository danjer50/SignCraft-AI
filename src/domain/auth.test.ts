import { describe, expect, it } from 'vitest';
import {
  PUBLIC_PATHS,
  homePathForRole,
  isAuthorizedForRole,
  isLocalPath,
  mayOpenPath,
  normalizeAuthAccount,
  normalizeAuthFailure,
  normalizeAuthSession,
  resolvePostSignInPath,
} from './auth';

describe('role destinations', () => {
  it('maps each role to exactly one area', () => {
    expect(homePathForRole('ADMIN')).toBe('/admin');
    expect(homePathForRole('PRO')).toBe('/pro');
    expect(homePathForRole('CUSTOMER')).toBe('/');
  });

  it('only allows the roles that were declared', () => {
    expect(isAuthorizedForRole('ADMIN', ['ADMIN'])).toBe(true);
    expect(isAuthorizedForRole('PRO', ['ADMIN'])).toBe(false);
    expect(isAuthorizedForRole('CUSTOMER', ['PRO', 'ADMIN'])).toBe(false);
    expect(isAuthorizedForRole(null, ['ADMIN'])).toBe(false);
    expect(isAuthorizedForRole(undefined, ['ADMIN'])).toBe(false);
  });
});

describe('post sign-in navigation', () => {
  it('sends an admin to /admin and a pro account to /pro', () => {
    expect(resolvePostSignInPath('ADMIN', null, '/admin')).toBe('/admin');
    expect(resolvePostSignInPath('PRO', null, '/pro')).toBe('/pro');
    expect(resolvePostSignInPath('CUSTOMER', null, '/')).toBe('/');
  });

  it('honours a permitted ?next= path, such as the public studio', () => {
    expect(resolvePostSignInPath('CUSTOMER', '/studio', '/')).toBe('/studio');
    expect(resolvePostSignInPath('PRO', '/studio', '/pro')).toBe('/studio');
    expect(resolvePostSignInPath('ADMIN', '/result', '/admin')).toBe('/result');
  });

  it('refuses to escalate through ?next=', () => {
    // A PRO or customer account cannot use ?next=/admin to reach the console.
    expect(resolvePostSignInPath('PRO', '/admin', '/pro')).toBe('/pro');
    expect(resolvePostSignInPath('CUSTOMER', '/admin', '/')).toBe('/');
    expect(resolvePostSignInPath('CUSTOMER', '/pro', '/')).toBe('/');
  });

  it('refuses open redirects and malformed paths', () => {
    for (const hostile of ['//evil.example', 'https://evil.example', '/\\evil.example', 'javascript:alert(1)', '', 'admin']) {
      expect(isLocalPath(hostile)).toBe(false);
      expect(resolvePostSignInPath('ADMIN', hostile, '/admin')).toBe('/admin');
    }
    expect(isLocalPath('/studio?step=5')).toBe(true);
  });

  it('falls back to the server redirect, then to the role home', () => {
    expect(resolvePostSignInPath('PRO', null, '/pro')).toBe('/pro');
    expect(resolvePostSignInPath('PRO', null, 'https://evil.example')).toBe('/pro');
    expect(resolvePostSignInPath('ADMIN', null, null)).toBe('/admin');
  });

  it('keeps the public customer experience open to everybody', () => {
    for (const path of PUBLIC_PATHS) {
      expect(mayOpenPath('CUSTOMER', path)).toBe(true);
      expect(mayOpenPath('PRO', path)).toBe(true);
      expect(mayOpenPath('ADMIN', path)).toBe(true);
    }
    expect(mayOpenPath('PRO', '/admin')).toBe(false);
    expect(mayOpenPath('ADMIN', '/admin')).toBe(true);
    expect(mayOpenPath('ADMIN', '/pro')).toBe(true);
  });
});

describe('defensive parsing of authentication payloads', () => {
  it('rejects an account without an id or with an unknown role', () => {
    expect(normalizeAuthAccount({ id: 'a', role: 'ADMIN' })).not.toBeNull();
    expect(normalizeAuthAccount({ id: 'a', role: 'SUPERADMIN' })).toBeNull();
    expect(normalizeAuthAccount({ role: 'ADMIN' })).toBeNull();
    expect(normalizeAuthAccount(null)).toBeNull();
    expect(normalizeAuthAccount('ADMIN')).toBeNull();
    expect(normalizeAuthAccount([{ id: 'a', role: 'ADMIN' }])).toBeNull();
  });

  it('defaults an unknown status and an unparsable date instead of leaking undefined', () => {
    const account = normalizeAuthAccount({ id: 'a', role: 'PRO', status: 'WEIRD', createdAt: 'not-a-date' });
    expect(account?.status).toBe('ACTIVE');
    expect(account?.createdAt).toBe(new Date(0).toISOString());
  });

  it('never accepts a session that smuggles credential material into the public shape', () => {
    const session = normalizeAuthSession({
      account: { id: 'owner', role: 'ADMIN', username: 'owner', email: 'o@example.com', passwordHash: 'pbkdf2-sha256$1$a$b' },
      expiresAt: '2026-10-07T10:00:00.000Z',
    });
    expect(session?.account.role).toBe('ADMIN');
    expect(session && 'passwordHash' in session.account).toBe(false);
    expect(normalizeAuthSession({ account: { id: 'x' }, expiresAt: '' })).toBeNull();
    expect(normalizeAuthSession('ADMIN')).toBeNull();
  });

  it('turns any failure payload into a code plus text', () => {
    expect(normalizeAuthFailure({ code: 'INVALID_CREDENTIALS', message: 'nope' })).toEqual({ code: 'INVALID_CREDENTIALS', message: 'nope' });
    expect(normalizeAuthFailure({ code: 'MADE_UP', message: 'x' }).code).toBe('UNEXPECTED');
    expect(normalizeAuthFailure(undefined)).toEqual({ code: 'UNEXPECTED', message: '' });
    expect(normalizeAuthFailure([]).code).toBe('UNEXPECTED');
  });
});
