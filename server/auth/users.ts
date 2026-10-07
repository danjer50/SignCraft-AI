import {
  isAccountRole,
  isAccountStatus,
  type AccountRole,
  type AccountStatus,
  type AuthAccount,
} from '../../src/domain/auth';
import { isPasswordHash } from './passwords';
import type {
  AccountWriteResult,
  AuthEnvironment,
  ProAccountInput,
  StoredAccount,
  UserRepository,
} from './types';

/** Hard cap on configured accounts: the store is environment-backed, not a database. */
const MAX_CONFIGURED_ACCOUNTS = 200;

const OWNER_ID = 'owner';

export interface UserStoreDiagnostics {
  configured: boolean;
  accounts: number;
  admins: number;
  pro: number;
  customers: number;
  /** Human-readable configuration problems. Never includes a secret or a hash. */
  issues: string[];
}

/**
 * Hashes contain `$` separators, and dotenv-based loaders (a local `.env`, docker-compose) expand
 * `$NAME` references — which silently truncates a hash. Detect that case and say what to do.
 */
function hashProblem(value: unknown): string {
  if (typeof value === 'string' && value.startsWith('pbkdf2-sha256$')) {
    return ' It looks like a PBKDF2 hash that was truncated: in a .env file every $ must be escaped as \\$, because dotenv expands $VARIABLE references.';
  }
  return ' Run `npm run hash-password` to produce one.';
}

function text(value: unknown, maximum: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function isoDate(value: unknown): string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : new Date(0).toISOString();
}

function toPublicAccount(account: StoredAccount): AuthAccount {
  // The hash is dropped here and nowhere else: responses are always built from this shape.
  const { passwordHash: _passwordHash, ...publicAccount } = account;
  return publicAccount;
}

interface ParsedStore {
  accounts: StoredAccount[];
  issues: string[];
}

/**
 * Reads accounts from the deployment environment.
 *
 * Exactly one ADMIN can exist — the owner account, configured with `AUTH_OWNER_*`. `AUTH_USERS_JSON`
 * may only add PRO and CUSTOMER accounts; an ADMIN entry there is refused and reported, so there is
 * no configuration path (and no public endpoint) that grants admin privileges.
 */
function parseStore(environment: AuthEnvironment): ParsedStore {
  const accounts: StoredAccount[] = [];
  const issues: string[] = [];

  const ownerUsername = text(environment.AUTH_OWNER_USERNAME, 80);
  const ownerEmail = text(environment.AUTH_OWNER_EMAIL, 254);
  const ownerHash = environment.AUTH_OWNER_PASSWORD_HASH;

  if (ownerHash !== undefined && ownerHash !== '') {
    if (!isPasswordHash(ownerHash)) {
      issues.push(`AUTH_OWNER_PASSWORD_HASH is not a valid PBKDF2 hash; plaintext passwords are refused.${hashProblem(ownerHash)}`);
    } else if (!ownerUsername && !ownerEmail) {
      issues.push('The owner account needs AUTH_OWNER_USERNAME or AUTH_OWNER_EMAIL.');
    } else {
      accounts.push({
        id: OWNER_ID,
        username: ownerUsername || ownerEmail,
        email: ownerEmail,
        role: 'ADMIN',
        status: 'ACTIVE',
        createdAt: isoDate(undefined),
        passwordHash: ownerHash,
      });
    }
  } else if (ownerUsername || ownerEmail) {
    issues.push('The owner account is missing AUTH_OWNER_PASSWORD_HASH, so no administrator can sign in.');
  }

  const rawUsers = environment.AUTH_USERS_JSON;
  if (typeof rawUsers === 'string' && rawUsers.trim() !== '') {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(rawUsers);
    } catch {
      issues.push('AUTH_USERS_JSON is not valid JSON; it was ignored.');
    }
    if (parsed !== null && !Array.isArray(parsed)) {
      issues.push('AUTH_USERS_JSON must be an array of accounts; it was ignored.');
    }
    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        if (accounts.length >= MAX_CONFIGURED_ACCOUNTS) {
          issues.push(`Only the first ${MAX_CONFIGURED_ACCOUNTS} configured accounts were loaded.`);
          break;
        }
        if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
          issues.push('An entry in AUTH_USERS_JSON is not an object; it was ignored.');
          continue;
        }
        const source = entry as Record<string, unknown>;
        const username = text(source.username, 80);
        const email = text(source.email, 254);
        const hash = source.passwordHash;
        const role = source.role;
        if (!username && !email) {
          issues.push('An entry in AUTH_USERS_JSON has no username or email; it was ignored.');
          continue;
        }
        if (role === 'ADMIN') {
          issues.push('ADMIN entries in AUTH_USERS_JSON are refused: only the owner account may be an administrator.');
          continue;
        }
        if (!isAccountRole(role) || role === 'ADMIN') {
          issues.push(`An entry in AUTH_USERS_JSON has an invalid role; it was ignored.`);
          continue;
        }
        if (!isPasswordHash(hash)) {
          issues.push(`The account "${username || email}" has no valid PBKDF2 passwordHash; it was ignored.${hashProblem(hash)}`);
          continue;
        }
        const id = text(source.id, 80) || `acct-${accounts.length + 1}`;
        if (accounts.some((account) => account.id === id)) {
          issues.push(`Duplicate account id "${id}" in AUTH_USERS_JSON; the second entry was ignored.`);
          continue;
        }
        const status: AccountStatus = isAccountStatus(source.status) ? source.status : 'ACTIVE';
        accounts.push({
          id,
          username: username || email,
          email,
          role,
          status,
          createdAt: isoDate(source.createdAt),
          passwordHash: hash,
        });
      }
    }
  }

  return { accounts, issues };
}

function matches(account: StoredAccount, identifier: string): boolean {
  const needle = identifier.trim().toLowerCase();
  if (!needle) return false;
  return account.username.toLowerCase() === needle || (account.email !== '' && account.email.toLowerCase() === needle);
}

/**
 * Environment-backed, read-only user store. Sign-in and authorization are fully functional with
 * it; the write methods are the seam where a durable store (D1, KV, Postgres…) gets plugged in for
 * the Admin console, and until then they report honestly that no write store is configured.
 */
export function createUserRepository(environment: AuthEnvironment): UserRepository {
  const store = parseStore(environment);

  const notWritable = (): AccountWriteResult => ({ ok: false, code: 'WRITE_STORE_NOT_CONFIGURED' });

  return {
    configured: store.accounts.length > 0,

    listAccounts(): AuthAccount[] {
      return store.accounts.map(toPublicAccount);
    },

    listAccountsByRole(role: AccountRole): AuthAccount[] {
      return store.accounts.filter((account) => account.role === role).map(toPublicAccount);
    },

    findAccount(identifier: string): StoredAccount | null {
      if (typeof identifier !== 'string') return null;
      return store.accounts.find((account) => matches(account, identifier)) ?? null;
    },

    // --- Admin console foundation -----------------------------------------------------------
    // The HTTP layer and the Admin UI already call these; a writable adapter only has to replace
    // this repository (same interface) to make Pro account management live.
    async createProAccount(_input: ProAccountInput): Promise<AccountWriteResult> {
      return notWritable();
    },
    async updateAccount(): Promise<AccountWriteResult> {
      return notWritable();
    },
    async setAccountStatus(): Promise<AccountWriteResult> {
      return notWritable();
    },
    async removeAccount(): Promise<AccountWriteResult> {
      return notWritable();
    },
  };
}

/** Configuration health for the Admin "System" section. Contains no secrets. */
export function diagnoseUserStore(environment: AuthEnvironment): UserStoreDiagnostics {
  const store = parseStore(environment);
  const accounts = store.accounts.map(toPublicAccount);
  return {
    configured: store.accounts.length > 0,
    accounts: accounts.length,
    admins: accounts.filter((account) => account.role === 'ADMIN').length,
    pro: accounts.filter((account) => account.role === 'PRO').length,
    customers: accounts.filter((account) => account.role === 'CUSTOMER').length,
    issues: store.issues,
  };
}
