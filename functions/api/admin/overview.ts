import { handleAdminOverview } from '../../../server/http/admin.js';
import type { AuthEnvironment } from '../../../server/auth/types.js';

type PagesContext = { request: Request; env: AuthEnvironment };



/** Any other method is answered by the shared handler, which replies 405 with a JSON body. */
export function onRequest(context: PagesContext): Promise<Response> {
  return handleAdminOverview(context.request, context.env);
}
