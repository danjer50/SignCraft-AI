import { handleAiGeneration } from '../../../server/http/ai';
import type { AIEnvironment } from '../../../server/ai/types';

type PagesContext = { request: Request; env: AIEnvironment };

export function onRequestPost({ request, env }: PagesContext): Promise<Response> {
  return handleAiGeneration(request, env);
}

export function onRequest({ request, env }: PagesContext): Promise<Response> | Response {
  if (request.method === 'POST') return handleAiGeneration(request, env);
  return new Response(JSON.stringify({ status: 'UNAVAILABLE', message: 'Use POST for image-edit requests.' }), {
    status: 405,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
