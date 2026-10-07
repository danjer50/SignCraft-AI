/**
 * Tiny JSON transport shared by the authentication and admin clients.
 *
 * One place decides what "the service did not answer like an API" means, so a deployment without
 * these functions (or a browser offline) produces the same honest, typed result everywhere instead
 * of an exception escaping into the UI.
 */

import type { AuthFailure } from '../../domain/auth';

export const REQUEST_TIMEOUT_MS = 20_000;

export const JSON_HEADERS: Record<string, string> = {
  accept: 'application/json',
  'content-type': 'application/json',
};

export const SERVICE_UNAVAILABLE: AuthFailure = {
  code: 'AUTH_NOT_CONFIGURED',
  message: 'The authentication service did not answer.',
};

export async function sendJsonRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(path, { ...init, credentials: 'same-origin', signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Returns the parsed JSON object, or null when the answer was not a JSON object at all. */
export async function readJsonBody(response: Response): Promise<Record<string, unknown> | null> {
  const contentType = response.headers.get('content-type') ?? '';
  // Without the API functions a static host answers with the SPA's HTML. That is "no service
  // here", which must not be confused with "you are signed out".
  if (!contentType.includes('application/json')) return null;
  try {
    const parsed: unknown = await response.json();
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}
