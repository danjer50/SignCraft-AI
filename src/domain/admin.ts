import { isAccountRole, type AccountRole } from './auth';

/**
 * Admin console domain: the eight sections the dashboard is built around, plus defensive parsing
 * of what the admin API returns. Types live here (not in `server/`) so the browser bundle never
 * imports server code, and so a malformed payload can never crash the console.
 */

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

export type AdminSectionReadiness = 'ready' | 'local-only' | 'foundation';

export interface AdminSectionState {
  id: AdminSectionId;
  state: AdminSectionReadiness;
  metrics: Record<string, string | number | boolean>;
  issues: string[];
}

export interface AdminOverview {
  generatedAt: string;
  signedInAs: { id: string; role: AccountRole | null };
  sections: AdminSectionState[];
}

export interface AdminAccountRow {
  id: string;
  username: string;
  email: string;
  role: AccountRole;
  status: string;
}

export interface AdminAccounts {
  accounts: AdminAccountRow[];
  writable: boolean;
  issues: string[];
}

function isSectionId(value: unknown): value is AdminSectionId {
  return typeof value === 'string' && (ADMIN_SECTION_IDS as readonly string[]).includes(value);
}

function isReadiness(value: unknown): value is AdminSectionReadiness {
  return value === 'ready' || value === 'local-only' || value === 'foundation';
}

function metricValue(value: unknown): string | number | boolean {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value;
  return typeof value === 'string' ? value.slice(0, 200) : '';
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string').slice(0, 40).map((entry) => entry.slice(0, 300));
}

/** Normalizes the overview payload; returns null when it is not usable at all. */
export function normalizeAdminOverview(value: unknown): AdminOverview | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (!Array.isArray(source.sections)) return null;

  const sections: AdminSectionState[] = [];
  for (const entry of source.sections) {
    if (typeof entry !== 'object' || entry === null) continue;
    const section = entry as Record<string, unknown>;
    if (!isSectionId(section.id)) continue;
    const metrics: Record<string, string | number | boolean> = {};
    if (typeof section.metrics === 'object' && section.metrics !== null && !Array.isArray(section.metrics)) {
      for (const [key, metric] of Object.entries(section.metrics as Record<string, unknown>)) {
        metrics[key.slice(0, 60)] = metricValue(metric);
      }
    }
    sections.push({
      id: section.id,
      state: isReadiness(section.state) ? section.state : 'foundation',
      metrics,
      issues: stringList(section.issues),
    });
  }

  const signedIn = typeof source.signedInAs === 'object' && source.signedInAs !== null
    ? (source.signedInAs as Record<string, unknown>)
    : {};

  return {
    generatedAt: typeof source.generatedAt === 'string' ? source.generatedAt : '',
    signedInAs: {
      id: typeof signedIn.id === 'string' ? signedIn.id.slice(0, 80) : '',
      role: isAccountRole(signedIn.role) ? signedIn.role : null,
    },
    sections,
  };
}

export function normalizeAdminAccounts(value: unknown): AdminAccounts | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (!Array.isArray(source.accounts)) return null;

  const accounts: AdminAccountRow[] = [];
  for (const entry of source.accounts) {
    if (typeof entry !== 'object' || entry === null) continue;
    const account = entry as Record<string, unknown>;
    if (!isAccountRole(account.role) || typeof account.id !== 'string') continue;
    accounts.push({
      id: account.id.slice(0, 80),
      username: typeof account.username === 'string' ? account.username.slice(0, 80) : '',
      email: typeof account.email === 'string' ? account.email.slice(0, 254) : '',
      role: account.role,
      status: typeof account.status === 'string' ? account.status.slice(0, 20) : 'ACTIVE',
    });
  }

  const diagnostics = typeof source.diagnostics === 'object' && source.diagnostics !== null
    ? (source.diagnostics as Record<string, unknown>)
    : {};

  return {
    accounts,
    writable: source.writable === true,
    issues: stringList(diagnostics.issues),
  };
}

export function sectionById(overview: AdminOverview | null, id: AdminSectionId): AdminSectionState | null {
  return overview?.sections.find((section) => section.id === id) ?? null;
}
