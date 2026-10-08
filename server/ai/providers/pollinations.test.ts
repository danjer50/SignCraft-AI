// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SIGN_CONFIGURATION } from '../../../src/domain/sign.js';
import type { AIEnvironment, ServerImageEditInput } from '../types.js';
import { POLLINATIONS_DEFAULT_MODEL, PollinationsImageProvider } from './pollinations.js';

/**
 * Every provider response in this file is mocked. No request leaves the process, so the suite
 * consumes no Pollinations balance.
 */

const apiKey = 'pollinations-test-only-key-never-real';
const env: AIEnvironment = { POLLINATIONS_API_KEY: apiKey };

function tinyPng(): Uint8Array {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x10,
  ]);
}

function jpegFixture(width = 511, height = 287): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xd9,
  ]);
}

function makeInput(): ServerImageEditInput {
  return {
    image: { bytes: jpegFixture(), fileName: 'storefront.jpg', mimeType: 'image/jpeg', width: 511, height: 287 },
    configuration: { ...DEFAULT_SIGN_CONFIGURATION, businessName: 'Atelier Sable', exactText: 'ATELIER SABLE' },
    prompt: 'Preserve the facade. Exact sign text: ATELIER SABLE.',
    preserveSourceArchitecture: true,
    exactTextOverlayRequired: true,
  };
}

function b64Response(data = tinyPng()): Response {
  return new Response(JSON.stringify({
    created: 1_700_000_000,
    data: [{ b64_json: Buffer.from(data).toString('base64'), media_type: 'image/png' }],
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

function failure(status: number, message: string, code = 'ERROR'): () => Response {
  return () => new Response(JSON.stringify({ status, success: false, error: { code, message } }), { status });
}

describe('Pollinations image-edit provider', () => {
  it('declares the image-edit capability only', () => {
    const provider = new PollinationsImageProvider(env);

    expect(provider.capabilities).toEqual(['image-edit']);
    expect(provider.capabilities).not.toContain('text');
  });

  it('does not call Pollinations when the API key is missing', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const result = await new PollinationsImageProvider({}, { fetchImpl: fetchMock }).generate(makeInput());

    expect(result.status).toBe('ERROR');
    if (result.status !== 'GENERATED') expect(result.errorCode).toBe('AI_NOT_CONFIGURED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uploads the storefront photo as multipart form data to the documented edits endpoint', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => b64Response());
    const input = makeInput();
    input.mask = tinyPng();
    const result = await new PollinationsImageProvider(env, { fetchImpl: fetchMock }).generate(input);
    const [url, init] = fetchMock.mock.calls[0];
    const form = init?.body as FormData;
    const image = form.get('image') as File;

    expect(url).toBe('https://gen.pollinations.ai/v1/images/edits');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${apiKey}`);
    // FormData must supply its own content type, boundary included.
    expect(new Headers(init?.headers).has('content-type')).toBe(false);
    expect(image.name).toBe('storefront.jpg');
    expect(image.type).toBe('image/jpeg');
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(makeInput().image.bytes);
    expect(form.get('prompt')).toBe(input.prompt);
    expect(form.get('response_format')).toBe('b64_json');
    // No verified native mask field exists in this adapter's current request contract.
    expect(form.has('mask')).toBe(false);
    expect(result.status).toBe('GENERATED');
    if (result.status === 'GENERATED') {
      expect(result.providerId).toBe('pollinations');
      expect(result.imageUrl).toMatch(/^data:image\/png;base64,/);
    }
  });

  it('rejects an echoed source photo instead of returning a fake concept', async () => {
    const input = makeInput();
    const fetchMock = vi.fn<typeof fetch>(async () => b64Response(input.image.bytes));
    const result = await new PollinationsImageProvider(env, { fetchImpl: fetchMock }).generate(input);

    expect(result).toMatchObject({ status: 'ERROR', errorCode: 'AI_UNCHANGED_IMAGE' });
    expect(result).not.toHaveProperty('imageUrl');
    expect(JSON.stringify(result)).not.toContain(apiKey);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('skips an echoed photo and uses a later edited image from the same response', async () => {
    const input = makeInput();
    const edit = Buffer.from(tinyPng()).toString('base64');
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ data: [
      { b64_json: Buffer.from(input.image.bytes).toString('base64') }, { b64_json: edit },
    ] }), { status: 200 }));
    const result = await new PollinationsImageProvider(env, { fetchImpl: fetchMock }).generate(input);

    expect(result).toMatchObject({ status: 'GENERATED', imageUrl: `data:image/png;base64,${edit}` });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('always sends an edit-capable model, never the text-to-image endpoint default', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => b64Response());
    await new PollinationsImageProvider(env, { fetchImpl: fetchMock }).generate(makeInput());
    const form = fetchMock.mock.calls[0][1]?.body as FormData;

    expect(form.get('model')).toBe(POLLINATIONS_DEFAULT_MODEL);
    expect(POLLINATIONS_DEFAULT_MODEL).toContain('kontext');
    // The endpoint's own default would ignore the source photo, so it must never be sent.
    expect(form.get('model')).not.toBe('black-forest-labs/flux.1-schnell');
  });

  it('honours POLLINATIONS_MODEL', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => b64Response());
    await new PollinationsImageProvider(
      { ...env, POLLINATIONS_MODEL: 'google/gemini-2.5-flash-image' },
      { fetchImpl: fetchMock },
    ).generate(makeInput());

    expect((fetchMock.mock.calls[0][1]?.body as FormData).get('model')).toBe('google/gemini-2.5-flash-image');
  });

  it('maps authentication, balance, moderation, rate-limit and availability failures to safe codes', async () => {
    for (const [status, message, expected] of [
      [401, 'Missing or invalid API key', 'AI_AUTHENTICATION'],
      [402, 'Insufficient pollen balance', 'AI_CREDITS_EXHAUSTED'],
      [403, 'Access denied for this model', 'AI_AUTHENTICATION'],
      [422, 'content_policy_violation', 'AI_REQUEST_REJECTED'],
      [429, 'Too many requests', 'AI_RATE_LIMITED'],
      [500, 'Internal error', 'AI_PROVIDER_UNAVAILABLE'],
      [503, 'Safety service degraded', 'AI_PROVIDER_UNAVAILABLE'],
      [400, 'Invalid input', 'AI_REQUEST_REJECTED'],
    ] as const) {
      const fetchMock = vi.fn<typeof fetch>(async () => failure(status, message)());
      const result = await new PollinationsImageProvider(env, { fetchImpl: fetchMock }).generate(makeInput());

      expect(result.status).toBe('ERROR');
      if (result.status !== 'GENERATED') {
        expect(result.errorCode).toBe(expected);
        if (status === 400) {
          expect(result.providerHttpStatus).toBe(400);
          expect(result.providerErrorMessage).toBe('Invalid input');
        }
      }
    }
  });

  it('never follows a URL-only result, so a response cannot steer the server at another host', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      created: 1_700_000_000,
      data: [{ url: 'https://media.pollinations.ai/abc123', media_type: 'image/png' }],
    }), { status: 200 }));
    const result = await new PollinationsImageProvider(env, { fetchImpl: fetchMock }).generate(makeInput());

    expect(result.status).toBe('ERROR');
    if (result.status !== 'GENERATED') expect(result.errorCode).toBe('AI_INVALID_RESPONSE');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a payload that is not a real image', async () => {
    const notAnImage = vi.fn<typeof fetch>(async () => b64Response(new TextEncoder().encode('definitely not an image')));
    const rejected = await new PollinationsImageProvider(env, { fetchImpl: notAnImage }).generate(makeInput());

    expect(rejected.status).toBe('ERROR');
    if (rejected.status !== 'GENERATED') expect(rejected.errorCode).toBe('AI_INVALID_RESPONSE');

    const empty = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }));
    const missing = await new PollinationsImageProvider(env, { fetchImpl: empty }).generate(makeInput());
    expect(missing.status).toBe('ERROR');
    if (missing.status !== 'GENERATED') expect(missing.errorCode).toBe('AI_INVALID_RESPONSE');
  });

  it('reports a timeout when Pollinations never answers', async () => {
    const stuck = vi.fn<typeof fetch>((_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const result = await new PollinationsImageProvider(env, { fetchImpl: stuck, timeoutMs: 20 }).generate(makeInput());

    expect(result.status).toBe('ERROR');
    if (result.status !== 'GENERATED') expect(result.errorCode).toBe('AI_TIMEOUT');
  });

  it('never echoes the API key in its error messages or result', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => failure(401, `bad key ${apiKey}`, 'UNAUTHORIZED')());
    const result = await new PollinationsImageProvider(env, { fetchImpl: fetchMock }).generate(makeInput());

    expect(JSON.stringify(result)).not.toContain(apiKey);
  });
});
