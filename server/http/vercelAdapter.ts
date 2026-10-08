import type { IncomingMessage, ServerResponse } from 'node:http';

const MAX_API_BODY_BYTES = 12 * 1024 * 1024;

type WebRequestHandler = (request: Request) => Promise<Response>;

export interface BridgeDiagnosticFailure {
  readonly status: number;
  readonly internalErrorCode: 'AI_BRIDGE_BODY_TOO_LARGE' | 'AI_BRIDGE_ERROR';
}

function writeJson(response: ServerResponse, status: number, message: string, diagnosticId?: string): void {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  if (diagnosticId) response.setHeader('x-ai-diagnostic-id', diagnosticId);
  response.end(JSON.stringify({ status: 'UNAVAILABLE', message }));
}

export interface BridgeOptions {
  /**
   * Protocol and host used to rebuild the request URL. Vercel always terminates TLS, so `https`
   * and the `host` header are correct there; a local dev middleware passes the forwarded values so
   * same-origin checks compare what the browser actually sent.
   */
  protocol?: 'http' | 'https';
  host?: string;
  /** Optional diagnostics are supplied only by the AI generation route. */
  aiDiagnosticId?: string;
  onAIDiagnosticFailure?: (failure: BridgeDiagnosticFailure) => void;
}

function reportAIBridgeFailure(
  options: BridgeOptions,
  status: number,
  internalErrorCode: BridgeDiagnosticFailure['internalErrorCode'],
): void {
  try {
    options.onAIDiagnosticFailure?.({ status, internalErrorCode });
  } catch {
    // Diagnostics must never change the response from the shared Vercel bridge.
  }
}

/** Adapt a Vercel Node.js function request to the shared Fetch Request handlers. */
export async function bridgeVercelRequest(
  incoming: IncomingMessage,
  outgoing: ServerResponse,
  handler: WebRequestHandler,
  options: BridgeOptions = {},
): Promise<void> {
  const declaredLength = Number(incoming.headers['content-length'] ?? 0);
  if (declaredLength > MAX_API_BODY_BYTES) {
    reportAIBridgeFailure(options, 413, 'AI_BRIDGE_BODY_TOO_LARGE');
    writeJson(outgoing, 413, 'Request body exceeds the server limit.', options.aiDiagnosticId);
    return;
  }

  const chunks: Buffer[] = [];
  let byteLength = 0;
  try {
    for await (const chunk of incoming) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      byteLength += buffer.byteLength;
      if (byteLength > MAX_API_BODY_BYTES) {
        reportAIBridgeFailure(options, 413, 'AI_BRIDGE_BODY_TOO_LARGE');
        writeJson(outgoing, 413, 'Request body exceeds the server limit.', options.aiDiagnosticId);
        return;
      }
      chunks.push(buffer);
    }

    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) {
      if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
    }
    const method = incoming.method ?? 'GET';
    const host = options.host ?? incoming.headers.host ?? 'localhost';
    const protocol = options.protocol ?? 'https';
    const requestUrl = new URL(incoming.url ?? '/', `${protocol}://${host}`);
    const requestBody = method === 'GET' || method === 'HEAD'
      ? undefined
      : new Blob([Buffer.concat(chunks)]);
    const webRequest = new Request(requestUrl, { method, headers, body: requestBody });
    const webResponse = await handler(webRequest);
    outgoing.statusCode = webResponse.status;
    webResponse.headers.forEach((value, name) => outgoing.setHeader(name, value));
    outgoing.end(Buffer.from(await webResponse.arrayBuffer()));
  } catch {
    const status = outgoing.headersSent ? outgoing.statusCode : 500;
    reportAIBridgeFailure(options, status, 'AI_BRIDGE_ERROR');
    if (!outgoing.headersSent) writeJson(outgoing, status, 'The server could not process this request.', options.aiDiagnosticId);
    else outgoing.end();
  }
}
