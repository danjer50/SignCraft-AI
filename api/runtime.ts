import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleRuntime } from '../server/http/studio.js';
import { readAuthEnvironment } from '../server/http/authEnvironment.js';
import { bridgeVercelRequest } from '../server/http/vercelAdapter.js';
export const config = { api: { bodyParser: false } };
export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
 await bridgeVercelRequest(request, response, (webRequest) => handleRuntime(webRequest, readAuthEnvironment()));
}
