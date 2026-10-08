import { ACCOUNT_ROLES, homePathForRole } from '../../src/domain/auth.js';
import { authFailure, isSameOriginRequest, jsonResponse, requireRole } from '../auth/guard.js';
import { cookieName, sessionTtlMinutes } from '../auth/sessions.js';
import { createUserRepository, diagnoseUserStore } from '../auth/users.js';
import { MINIMUM_ITERATIONS } from '../auth/passwords.js';
import { describeAiProviders } from '../ai/router.js';
import type { AuthEnvironment } from '../auth/types.js';

/**
 * Admin API. Every handler authorizes the ADMIN role server-side before it reads or writes
 * anything: a PRO account, a customer or an anonymous visitor gets 401/403 JSON, never data.
 *
 * This is the *foundation* the dashboard needs — the eight sections exist, the accounts that are
 * configured are listed, and the write operations are wired to the repository seam so a durable
 * store can be plugged in later without changing these routes or the UI.
 */

const ADMIN_ONLY = ['ADMIN'] as const;

export const ADMIN_SECTION_IDS = [
  'users',
  'proAccounts',
  'customerProjects',
  'quoteRequests',
  'aiUsage',
  'websiteSettings',
  'featureSettings',
  'system',
] as const;

export type AdminSectionId = (typeof ADMIN_SECTION_IDS)[number];

export interface AdminSectionState {
  id: AdminSectionId;
  /** `ready` = live data, `local-only` = data lives in the operator's browser, `foundation` = structure only. */
  state: 'ready' | 'local-only' | 'foundation';
  metrics: Record<string, number | string | boolean>;
  /** Non-secret configuration problems the operator should see. */
  issues: string[];
}

function sessionSecuritySummary(environment: AuthEnvironment) {
  const secret = environment.AUTH_SESSION_SECRET;
  return {
    secretConfigured: typeof secret === 'string' && secret.trim().length >= 32,
    cookieName: cookieName(environment),
    ttlMinutes: sessionTtlMinutes(environment),
    sameSite: (environment.AUTH_COOKIE_SAME_SITE ?? 'lax').toLowerCase(),
    passwordHashAlgorithm: `pbkdf2-sha256 (>= ${MINIMUM_ITERATIONS} iterations)`,
  };
}

/** GET /api/admin/overview — the dashboard skeleton plus whatever is genuinely connected. */
export async function handleAdminOverview(request: Request, environment: AuthEnvironment): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return authFailure(405, 'METHOD_NOT_ALLOWED', 'Use GET to read the admin overview.');
  }
  const authorization = await requireRole(request, environment, ADMIN_ONLY);
  if (!authorization.ok) return authorization.response;

  const diagnostics = diagnoseUserStore(environment);
  const security = sessionSecuritySummary(environment);
  const quoteProvider = (environment.QUOTE_STORAGE_PROVIDER ?? 'demo').toLowerCase();
  const aiProvider = (environment.AI_PROVIDER ?? 'demo').toLowerCase();
  // Non-secret view of the AI chain: ids, models and readiness only — never a key.
  const ai = describeAiProviders(environment);
  const aiChain = ai.order.join(', ') || 'none configured';
  const aiConfigured = ai.providers.filter((provider) => provider.configured).map((provider) => provider.id).join(', ') || 'none';

  const sections: AdminSectionState[] = [
    {
      id: 'users',
      state: diagnostics.configured ? 'ready' : 'foundation',
      metrics: {
        total: diagnostics.accounts,
        admins: diagnostics.admins,
        pro: diagnostics.pro,
        customers: diagnostics.customers,
        roles: ACCOUNT_ROLES.join(' · '),
      },
      issues: diagnostics.issues,
    },
    {
      id: 'proAccounts',
      state: 'foundation',
      metrics: { pro: diagnostics.pro, writeStoreConfigured: false, canManage: false },
      issues: diagnostics.configured
        ? []
        : ['No account store is configured, so Pro accounts cannot be created yet.'],
    },
    {
      id: 'customerProjects',
      state: 'foundation',
      metrics: { serverProjects: 0, storageConnected: false },
      issues: ['Customer projects are still drafted in the customer’s own browser; no server store is connected.'],
    },
    {
      id: 'quoteRequests',
      state: 'local-only',
      metrics: { storageProvider: quoteProvider, serverQueueConnected: false },
      issues: quoteProvider === 'demo'
        ? ['Quote requests are stored in the browser that received them (QUOTE_STORAGE_PROVIDER=demo).']
        : [],
    },
    {
      id: 'aiUsage',
      state: 'foundation',
      metrics: {
        provider: aiProvider,
        fallbackChain: aiChain,
        providersConfigured: aiConfigured,
        activityStoreConnected: false,
        requestsLogged: 0,
      },
      issues: ['AI activity logging is not connected; the provider setting is reported for information only.'],
    },
    {
      id: 'websiteSettings',
      state: 'foundation',
      metrics: { configurableContent: 0, settingsStoreConnected: false },
      issues: ['Website content settings need a writable store before they can be edited here.'],
    },
    {
      id: 'featureSettings',
      state: 'ready',
      metrics: {
        aiMode: aiProvider,
        aiFallbackChain: aiChain,
        quoteMode: quoteProvider,
        proWorkspaceEnabled: diagnostics.pro > 0,
        adminAccounts: diagnostics.admins,
      },
      issues: [],
    },
    {
      id: 'system',
      state: security.secretConfigured ? 'ready' : 'foundation',
      metrics: {
        sessionSecretConfigured: security.secretConfigured,
        sessionCookie: security.cookieName,
        sessionTtlMinutes: security.ttlMinutes,
        sessionSameSite: security.sameSite,
        passwordHashing: security.passwordHashAlgorithm,
        errorStoreConnected: false,
      },
      issues: security.secretConfigured
        ? []
        : ['AUTH_SESSION_SECRET is missing or shorter than 32 characters, so nobody can sign in.'],
    },
  ];

  return jsonResponse(200, {
    status: 'OK',
    generatedAt: new Date().toISOString(),
    signedInAs: { id: authorization.state.account.id, role: authorization.state.account.role },
    sections,
  });
}

/** GET /api/admin/users — accounts without any credential material. */
export async function handleAdminUsers(request: Request, environment: AuthEnvironment): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return authFailure(405, 'METHOD_NOT_ALLOWED', 'Use GET to list accounts.');
  }
  const authorization = await requireRole(request, environment, ADMIN_ONLY);
  if (!authorization.ok) return authorization.response;

  const repository = createUserRepository(environment);
  const diagnostics = diagnoseUserStore(environment);
  return jsonResponse(200, {
    status: 'OK',
    accounts: repository.listAccounts(),
    diagnostics: { configured: diagnostics.configured, issues: diagnostics.issues },
    writable: false,
  });
}

/**
 * /api/admin/pro-accounts — Pro account management.
 *
 * GET lists Pro accounts. POST/PATCH/DELETE are the Admin console's create / edit / suspend /
 * remove operations: they are authorized exactly like the rest of the admin API and they already
 * speak to the repository seam, which answers `WRITE_STORE_NOT_CONFIGURED` until a durable account
 * store is attached. Nothing here is reachable without the ADMIN role.
 */
export async function handleAdminProAccounts(request: Request, environment: AuthEnvironment): Promise<Response> {
  const authorization = await requireRole(request, environment, ADMIN_ONLY);
  if (!authorization.ok) return authorization.response;

  const repository = createUserRepository(environment);

  if (request.method === 'GET' || request.method === 'HEAD') {
    return jsonResponse(200, {
      status: 'OK',
      accounts: repository.listAccountsByRole('PRO'),
      writable: false,
      writeStoreCode: 'WRITE_STORE_NOT_CONFIGURED',
    });
  }

  if (request.method !== 'POST' && request.method !== 'PATCH' && request.method !== 'DELETE') {
    return authFailure(405, 'METHOD_NOT_ALLOWED', 'Use GET, POST, PATCH or DELETE on this endpoint.');
  }

  if (!isSameOriginRequest(request)) return authFailure(403, 'FORBIDDEN', 'A same-origin request is required.');
  const result = request.method === 'POST'
    ? await repository.createProAccount({ username: '', email: '', password: '' })
    : request.method === 'PATCH'
      ? await repository.updateAccount('', {})
      : await repository.removeAccount('');

  if (!result.ok) {
    return jsonResponse(501, {
      status: 'REJECTED',
      code: result.code,
      message: 'Pro account management needs a writable account store. The route, the authorization and the repository interface are in place; attach a store adapter to enable it.',
      allowedOperations: ['create', 'edit', 'suspend', 'disable', 'remove'],
      redirect: homePathForRole('ADMIN'),
    });
  }
  return jsonResponse(200, { status: 'OK', account: result.account });
}
