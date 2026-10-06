import { handleQuoteSubmission } from '../../server/http/quotes';
import type { QuoteEnvironment } from '../../server/quotes/types';

type PagesContext = { request: Request; env: QuoteEnvironment };

export function onRequestPost({ request, env }: PagesContext): Promise<Response> {
  return handleQuoteSubmission(request, env);
}

export function onRequest({ request, env }: PagesContext): Promise<Response> | Response {
  if (request.method === 'POST') return handleQuoteSubmission(request, env);
  return new Response(JSON.stringify({ status: 'UNAVAILABLE', message: 'Use POST to create a quote request.' }), {
    status: 405,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
