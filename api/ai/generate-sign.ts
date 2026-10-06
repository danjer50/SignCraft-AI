import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleAiGeneration } from '../../server/http/ai';
import { bridgeVercelRequest } from '../../server/http/vercelAdapter';

export const config = { api: { bodyParser: false } };

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  await bridgeVercelRequest(request, response, (webRequest) => handleAiGeneration(webRequest, {
    AI_PROVIDER: process.env.AI_PROVIDER,
    AI_API_KEY: process.env.AI_API_KEY,
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
  }));
}
