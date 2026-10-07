import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleQuoteSubmission } from '../server/http/quotes.js';
import { bridgeVercelRequest } from '../server/http/vercelAdapter.js';

export const config = { api: { bodyParser: false } };

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  await bridgeVercelRequest(request, response, (webRequest) => handleQuoteSubmission(webRequest, {
    QUOTE_STORAGE_PROVIDER: process.env.QUOTE_STORAGE_PROVIDER,
    QUOTE_STORAGE_URL: process.env.QUOTE_STORAGE_URL,
    QUOTE_STORAGE_KEY: process.env.QUOTE_STORAGE_KEY,
  }));
}
