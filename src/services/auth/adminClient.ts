import { normalizeAuthFailure, type AuthFailure } from '../../domain/auth';
import {
  normalizeAdminAccounts,
  normalizeAdminOverview,
  type AdminAccounts,
  type AdminOverview,
} from '../../domain/admin';
import { SERVICE_UNAVAILABLE, readJsonBody, sendJsonRequest } from './httpJson';

/**
 * Admin API client. Authorization happens on the server: these calls simply report what the server
 * allowed. A 401/403 becomes a typed result the console can explain (and the route guard can act
 * on) instead of an empty panel or a crash.
 */

export type AdminResult<T> =
  | { status: 'OK'; data: T }
  | { status: 'REJECTED'; statusCode: number; failure: AuthFailure }
  | { status: 'UNAVAILABLE'; failure: AuthFailure };

async function fetchAdmin<T>(path: string, normalize: (value: unknown) => T | null): Promise<AdminResult<T>> {
  let response: Response;
  try {
    response = await sendJsonRequest(path, { method: 'GET', headers: { accept: 'application/json' } });
  } catch {
    return { status: 'UNAVAILABLE', failure: SERVICE_UNAVAILABLE };
  }

  const body = await readJsonBody(response);
  if (!body) {
    if (response.status === 401 || response.status === 403) {
      return { status: 'REJECTED', statusCode: response.status, failure: { code: 'SESSION_REQUIRED', message: '' } };
    }
    return { status: 'UNAVAILABLE', failure: SERVICE_UNAVAILABLE };
  }

  if (response.status === 401 || response.status === 403) {
    return { status: 'REJECTED', statusCode: response.status, failure: normalizeAuthFailure(body) };
  }
  if (!response.ok) {
    return { status: 'REJECTED', statusCode: response.status, failure: normalizeAuthFailure(body) };
  }

  const data = normalize(body);
  if (!data) return { status: 'UNAVAILABLE', failure: { code: 'UNEXPECTED', message: '' } };
  return { status: 'OK', data };
}

export function fetchAdminOverview(): Promise<AdminResult<AdminOverview>> {
  return fetchAdmin('/api/admin/overview', normalizeAdminOverview);
}

export function fetchAdminAccounts(): Promise<AdminResult<AdminAccounts>> {
  return fetchAdmin('/api/admin/users', normalizeAdminAccounts);
}
