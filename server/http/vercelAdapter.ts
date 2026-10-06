import type { IncomingMessage, ServerResponse } from 'node:http';

const MAX_API_BODY_BYTES = 12 * 1024 * 1024;

type WebRequestHandler = (request: Request) => Promise<Response>;

function writeJson(response: ServerResponse, status: number, message: string): void {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  response.end(JSON.stringify({ status: 'UNAVAILABLE', message }));
}

/** Adapt a Vercel Node.js function request to the shared Fetch Request handlers. */
export async function bridgeVercelRequest(
  incoming: IncomingMessage,
  outgoing: ServerResponse,
  handler: WebRequestHandler,
): Promise<void> {
  const declaredLength = Number(incoming.headers['content-length'] ?? 0);
  if (declaredLength > MAX_API_BODY_BYTES) {
    writeJson(outgoing, 413, 'Request body exceeds the server limit.');
    return;
  }

  const chunks: Buffer[] = [];
  let byteLength = 0;
  try {
    for await (const chunk of incoming) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      byteLength += buffer.byteLength;
      if (byteLength > MAX_API_BODY_BYTES) {
        writeJson(outgoing, 413, 'Request body exceeds the server limit.');
        return;
      }
      chunks.push(buffer);
    }

    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) {
      if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
    }
    const method = incoming.method ?? 'GET';
    const host = incoming.headers.host ?? 'localhost';
    const requestUrl = new URL(incoming.url ?? '/', `https://${host}`);
    const requestBody = method === 'GET' || method === 'HEAD'
      ? undefined
      : new Blob([Buffer.concat(chunks)]);
    const webRequest = new Request(requestUrl, { method, headers, body: requestBody });
    const webResponse = await handler(webRequest);
    outgoing.statusCode = webResponse.status;
    webResponse.headers.forEach((value, name) => outgoing.setHeader(name, value));
    outgoing.end(Buffer.from(await webResponse.arrayBuffer()));
  } catch {
    if (!outgoing.headersSent) writeJson(outgoing, 500, 'The server could not process this request.');
    else outgoing.end();
  }
}
