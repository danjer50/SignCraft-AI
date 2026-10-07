import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleAdminOverview } from '../../server/http/admin';
import { readAuthEnvironment } from '../../server/http/authEnvironment';
import { bridgeVercelRequest } from '../../server/http/vercelAdapter';

export const config = { api: { bodyParser: false } };

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  await bridgeVercelRequest(request, response, (webRequest) => handleAdminOverview(webRequest, readAuthEnvironment()));
}
