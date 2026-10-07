import type { IncomingMessage, ServerResponse } from 'node:http';
import { readAiEnvironment } from '../../server/ai/environment.js';
import { handleAiGeneration } from '../../server/http/ai.js';
import { bridgeVercelRequest } from '../../server/http/vercelAdapter.js';

export const config = { api: { bodyParser: false } };

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  await bridgeVercelRequest(request, response, (webRequest) => handleAiGeneration(webRequest, readAiEnvironment()));
}
