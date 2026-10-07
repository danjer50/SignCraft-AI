import { handleLogin } from '../../../server/http/auth.js';
import type { AuthEnvironment } from '../../../server/auth/types.js';

type PagesContext = { request: Request; env: AuthEnvironment };

export function onRequestPost({ request, env }: PagesContext): Promise<Response> {
  return handleLogin(request, env);
}

/** Any other method is answered by the shared handler, which replies 405 with a JSON body. */
export function onRequest(context: PagesContext): Promise<Response> {
  return handleLogin(context.request, context.env);
}
