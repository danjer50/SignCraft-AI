import type { IncomingMessage, ServerResponse } from 'node:http';
import { readAiEnvironment } from '../../server/ai/environment.js';
import { handleAiGeneration } from '../../server/http/ai.js';
import { bridgeVercelRequest } from '../../server/http/vercelAdapter.js';

export const config = { api: { bodyParser: false } };

/**
 * Backwards-compatible alias of `/api/ai/generate-sign`: both routes run the same handler, so the
 * multi-provider fallback applies identically to old and new clients.
 */
export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  await bridgeVercelRequest(request, response, (webRequest) => handleAiGeneration(webRequest, readAiEnvironment()));
}
