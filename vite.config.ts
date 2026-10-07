import { defineConfig, type Plugin } from 'vitest/config';
import { loadEnv } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import react from '@vitejs/plugin-react';

/**
 * Dev-only API middleware.
 *
 * The authentication and AI endpoints are the same shared handlers that Vercel (`api/**`) and
 * Cloudflare Pages (`functions/**`) run, loaded here through Vite's SSR module runner so `npm run
 * dev` can sign a developer in and run a real sign generation against a local `.env`. Nothing about
 * the deployed architecture changes: no extra server, no second implementation, no mock provider.
 * Without the environment variables the endpoints answer `AUTH_NOT_CONFIGURED` or "no provider
 * configured", exactly like an unconfigured deployment.
 */
type AuthHandler = (request: Request, environment: Record<string, string | undefined>) => Promise<Response>;

const DEV_API_ROUTES: Array<{ path: string; module: string; handler: string }> = [
  { path: '/api/auth/login', module: '/server/http/auth.ts', handler: 'handleLogin' },
  { path: '/api/auth/logout', module: '/server/http/auth.ts', handler: 'handleLogout' },
  { path: '/api/auth/session', module: '/server/http/auth.ts', handler: 'handleSession' },
  { path: '/api/admin/overview', module: '/server/http/admin.ts', handler: 'handleAdminOverview' },
  { path: '/api/admin/users', module: '/server/http/admin.ts', handler: 'handleAdminUsers' },
  { path: '/api/admin/pro-accounts', module: '/server/http/admin.ts', handler: 'handleAdminProAccounts' },
  // Multi-provider AI routing, including the Groq / Gemini / OpenRouter fallback chain.
  { path: '/api/ai/generate-sign', module: '/server/http/ai.ts', handler: 'handleAiGeneration' },
  { path: '/api/ai/generate', module: '/server/http/ai.ts', handler: 'handleAiGeneration' },
];

function devApiRoutes(environment: Record<string, string | undefined>): Plugin {
  return {
    name: 'signcraft-dev-api-routes',
    configureServer(server) {
      server.middlewares.use(async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
        const url = request.url ?? '/';
        const route = DEV_API_ROUTES.find((entry) => url === entry.path || url.startsWith(`${entry.path}?`));
        if (!route) {
          next();
          return;
        }
        try {
          const { bridgeVercelRequest } = await server.ssrLoadModule('/server/http/vercelAdapter.ts') as
            {
              bridgeVercelRequest: (
                incoming: IncomingMessage,
                outgoing: ServerResponse,
                handler: (request: Request) => Promise<Response>,
                options?: { protocol?: 'http' | 'https'; host?: string },
              ) => Promise<void>;
            };
          const handlers = await server.ssrLoadModule(route.module) as Record<string, AuthHandler | undefined>;
          const handler = handlers[route.handler];
          if (!handler) {
            response.statusCode = 500;
            response.setHeader('content-type', 'application/json; charset=utf-8');
            response.end(JSON.stringify({ status: 'REJECTED', code: 'UNEXPECTED', message: 'The dev auth handler is missing.' }));
            return;
          }
          const forwardedProto = request.headers['x-forwarded-proto'];
          const forwardedHost = request.headers['x-forwarded-host'];
          await bridgeVercelRequest(request, response, (webRequest) => handler(webRequest, environment), {
            // Behind the preview proxy the browser speaks HTTPS to a local HTTP server: use the
            // forwarded values so the same-origin check compares like with like.
            protocol: forwardedProto === 'https' ? 'https' : 'http',
            host: (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost) || request.headers.host || 'localhost:5173',
          });
        } catch {
          if (!response.headersSent) {
            response.statusCode = 500;
            response.setHeader('content-type', 'application/json; charset=utf-8');
            response.end(JSON.stringify({ status: 'REJECTED', code: 'UNEXPECTED', message: 'The dev auth endpoint failed.' }));
          } else {
            response.end();
          }
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  // `loadEnv(..., '')` reads every variable (not only VITE_*) so the dev middleware can run the
  // real authentication handlers against a local `.env`.
  plugins: [react(), devApiRoutes(loadEnv(mode, process.cwd(), ''))],
  server: {
    host: '0.0.0.0',
    strictPort: false,
    allowedHosts: ['.e2b.app', 'localhost'],
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: ['.e2b.app', 'localhost'],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    restoreMocks: true,
  },
}));
