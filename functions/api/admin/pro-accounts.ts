import { handleAdminProAccounts } from '../../../server/http/admin.js';
import type { AuthEnvironment } from '../../../server/auth/types.js';

type PagesContext = { request: Request; env: AuthEnvironment };

export function onRequestPost({ request, env }: PagesContext): Promise<Response> {
  return handleAdminProAccounts(request, env);
}
export function onRequestPatch({ request, env }: PagesContext): Promise<Response> {
  return handleAdminProAccounts(request, env);
}
export function onRequestDelete({ request, env }: PagesContext): Promise<Response> {
  return handleAdminProAccounts(request, env);
}

/** Any other method is answered by the shared handler, which replies 405 with a JSON body. */
export function onRequest(context: PagesContext): Promise<Response> {
  return handleAdminProAccounts(context.request, context.env);
}
