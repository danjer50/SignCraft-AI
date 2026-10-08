// @vitest-environment node
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { bridgeVercelRequest } from './vercelAdapter.js';

const MAX_BODY_BYTES = 12 * 1024 * 1024;

function incomingRequest(headers: IncomingMessage['headers']): IncomingMessage {
  const incoming = Readable.from([]) as unknown as IncomingMessage;
  Object.assign(incoming, {
    headers,
    method: 'POST',
    url: '/api/ai/generate-sign',
  });
  return incoming;
}

function outgoingResponse(): {
  response: ServerResponse;
  headers: Map<string, string>;
  body: string | Buffer | undefined;
} {
  const headers = new Map<string, string>();
  let body: string | Buffer | undefined;
  const response = {
    statusCode: 200,
    headersSent: false,
    setHeader: vi.fn((name: string, value: string) => { headers.set(name.toLowerCase(), value); }),
    end: vi.fn((value?: string | Buffer) => { body = value; }),
  } as unknown as ServerResponse;
  return { response, headers, get body() { return body; } };
}

describe('Vercel AI diagnostic bridge hooks', () => {
  it('correlates a request rejected by the bridge body-size limit without reading or logging its body', async () => {
    const requestId = 'diagnostic-id-413';
    const onAIDiagnosticFailure = vi.fn();
    const outgoing = outgoingResponse();
    const handler = vi.fn(async () => new Response('unexpected handler call'));

    await bridgeVercelRequest(
      incomingRequest({ 'content-length': String(MAX_BODY_BYTES + 1) }),
      outgoing.response,
      handler,
      { aiDiagnosticId: requestId, onAIDiagnosticFailure },
    );

    expect(handler).not.toHaveBeenCalled();
    expect(outgoing.response.statusCode).toBe(413);
    expect(outgoing.headers.get('x-ai-diagnostic-id')).toBe(requestId);
    expect(onAIDiagnosticFailure).toHaveBeenCalledWith({
      status: 413,
      internalErrorCode: 'AI_BRIDGE_BODY_TOO_LARGE',
    });
    expect(JSON.parse(String(outgoing.body))).toMatchObject({ status: 'UNAVAILABLE' });
  });

  it('reports a bridge exception without forwarding its exception message', async () => {
    const requestId = 'diagnostic-id-500';
    const onAIDiagnosticFailure = vi.fn();
    const outgoing = outgoingResponse();
    const brokenStream = new Readable({
      read() {
        this.destroy(new Error('PRIVATE_STREAM_ERROR_MUST_NOT_BE_LOGGED'));
      },
    }) as unknown as IncomingMessage;
    Object.assign(brokenStream, {
      headers: { 'content-length': '5' },
      method: 'POST',
      url: '/api/ai/generate-sign',
    });

    await bridgeVercelRequest(
      brokenStream,
      outgoing.response,
      async () => new Response('unexpected handler call'),
      { aiDiagnosticId: requestId, onAIDiagnosticFailure },
    );

    expect(outgoing.response.statusCode).toBe(500);
    expect(outgoing.headers.get('x-ai-diagnostic-id')).toBe(requestId);
    expect(onAIDiagnosticFailure).toHaveBeenCalledWith({
      status: 500,
      internalErrorCode: 'AI_BRIDGE_ERROR',
    });
    expect(String(outgoing.body)).not.toContain('PRIVATE_STREAM_ERROR_MUST_NOT_BE_LOGGED');
  });
});
