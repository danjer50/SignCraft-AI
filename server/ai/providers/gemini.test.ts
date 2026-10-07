// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { SignConfiguration } from '../../../src/domain/sign.js';
import type { AIEnvironment, ServerImageEditInput } from '../types.js';
import { GEMINI_DEFAULT_MODEL, GeminiImageProvider } from './gemini.js';

const apiKey = 'gemini-test-only-key-never-real';
const env: AIEnvironment = { GEMINI_API_KEY: apiKey };
const configuration: SignConfiguration = {
  businessName: 'Atelier Sable',
  category: 'retail',
  signType: 'threeD',
  style: 'modern',
  materials: ['acrylic'],
  color: '#24463f',
  lighting: 'halo',
  exactText: 'ATELIER SABLE · حرف',
  widthCm: '320',
  heightCm: '80',
  notes: 'Preserve the stone arch.',
  signArea: null,
  replaceExistingSurface: false,
};

function jpegFixture(width = 511, height = 287): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xd9,
  ]);
}

function tinyPng(): Uint8Array {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x10,
  ]);
}

function makeInput(): ServerImageEditInput {
  return {
    image: { bytes: jpegFixture(), fileName: 'storefront.jpg', mimeType: 'image/jpeg', width: 511, height: 287 },
    configuration,
    prompt: 'Preserve the facade. Exact sign text: ATELIER SABLE · حرف.',
    preserveSourceArchitecture: true,
    exactTextOverlayRequired: true,
  };
}

function imageResponse(data: string, mimeType = 'image/png'): Response {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ inlineData: { mimeType, data } }] } }],
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('Gemini image provider', () => {
  it('does not call Gemini when the API key is missing', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const result = await new GeminiImageProvider({}, { fetchImpl: fetchMock }).generate(makeInput());

    expect(result.status).toBe('ERROR');
    if (result.status !== 'GENERATED') expect(result.errorCode).toBe('AI_NOT_CONFIGURED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the source photo as inline_data with the prompt, and reads the image back', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => imageResponse(Buffer.from(tinyPng()).toString('base64')));
    const result = await new GeminiImageProvider(env, { fetchImpl: fetchMock }).generate(makeInput());
    const [url, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init?.body)) as {
      contents: Array<{ parts: Array<{ text?: string; inline_data?: { mime_type?: string; data?: string } }> }>;
      generationConfig?: { responseModalities?: string[] };
    };

    expect(url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_DEFAULT_MODEL}:generateContent`);
    expect(new Headers(init?.headers).get('x-goog-api-key')).toBe(apiKey);
    expect(body.contents[0].parts[0].text).toBe(makeInput().prompt);
    expect(body.contents[0].parts[1].inline_data?.mime_type).toBe('image/jpeg');
    expect(body.contents[0].parts[1].inline_data?.data).toBe(Buffer.from(jpegFixture()).toString('base64'));
    expect(body.generationConfig?.responseModalities).toEqual(['IMAGE']);
    expect(result.status).toBe('GENERATED');
    if (result.status === 'GENERATED') {
      expect(result.providerId).toBe('gemini');
      expect(result.imageUrl).toMatch(/^data:image\/png;base64,/);
    }
  });

  it('rejects an echoed source photo as a failed edit, never as a generated concept', async () => {
    const input = makeInput();
    const fetchMock = vi.fn<typeof fetch>(async () => imageResponse(Buffer.from(input.image.bytes).toString('base64'), 'image/jpeg'));
    const result = await new GeminiImageProvider(env, { fetchImpl: fetchMock }).generate(input);

    expect(result).toMatchObject({ status: 'ERROR', providerId: 'gemini', errorCode: 'AI_UNCHANGED_IMAGE' });
    expect(result).not.toHaveProperty('imageUrl');
    expect(JSON.stringify(result)).toContain('No concept was created');
    expect(JSON.stringify(result)).not.toContain(apiKey);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('skips a source echo and a thought image to select the actual final edit', async () => {
    const input = makeInput();
    const final = tinyPng();
    final[final.length - 1] = 0x20;
    const finalBase64 = Buffer.from(final).toString('base64');
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [
        { inlineData: { mimeType: 'image/jpeg', data: Buffer.from(input.image.bytes).toString('base64') } },
        { thought: true, inlineData: { mimeType: 'image/png', data: Buffer.from(tinyPng()).toString('base64') } },
        { inlineData: { mimeType: 'image/png', data: finalBase64 } },
      ] } }],
    }), { status: 200 }));
    const result = await new GeminiImageProvider(env, { fetchImpl: fetchMock }).generate(input);

    expect(result).toMatchObject({ status: 'GENERATED', imageUrl: `data:image/png;base64,${finalBase64}` });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not present an intermediate thought image when no final edit was returned', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{
        thought: true, inlineData: { mimeType: 'image/png', data: Buffer.from(tinyPng()).toString('base64') },
      }] } }],
    }), { status: 200 }));
    const result = await new GeminiImageProvider(env, { fetchImpl: fetchMock }).generate(makeInput());

    expect(result).toMatchObject({ status: 'ERROR', errorCode: 'AI_INVALID_RESPONSE' });
    expect(result).not.toHaveProperty('imageUrl');
  });

  it('honours GEMINI_MODEL, so a retired model id is an environment change', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => imageResponse(Buffer.from(tinyPng()).toString('base64')));
    await new GeminiImageProvider({ ...env, GEMINI_MODEL: 'gemini-3.1-flash-lite-image' }, { fetchImpl: fetchMock }).generate(makeInput());

    expect(String(fetchMock.mock.calls[0][0])).toContain('/models/gemini-3.1-flash-lite-image:generateContent');
  });

  it('maps rate limits, quota exhaustion, bad keys and unknown models to safe codes', async () => {
    for (const [status, message, expected] of [
      [429, 'You exceeded your current quota', 'AI_RATE_LIMITED'],
      [403, 'API key not valid', 'AI_AUTHENTICATION'],
      [404, 'models/x is not found', 'AI_NOT_CONFIGURED'],
      [500, 'internal error', 'AI_PROVIDER_UNAVAILABLE'],
      [400, 'invalid argument', 'AI_REQUEST_REJECTED'],
    ] as const) {
      const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ error: { message } }), { status }));
      const result = await new GeminiImageProvider(env, { fetchImpl: fetchMock }).generate(makeInput());

      expect(result.status).toBe('ERROR');
      if (result.status !== 'GENERATED') expect(result.errorCode).toBe(expected);
    }
  });

  it('reports a safety block as a rejected request instead of a broken image', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }),
      { status: 200 },
    ));
    const result = await new GeminiImageProvider(env, { fetchImpl: fetchMock }).generate(makeInput());

    expect(result.status).toBe('ERROR');
    if (result.status !== 'GENERATED') expect(result.errorCode).toBe('AI_REQUEST_REJECTED');
  });

  it('never accepts a payload that is not a real image', async () => {
    const notAnImage = vi.fn<typeof fetch>(async () => imageResponse(Buffer.from('this is not an image').toString('base64')));
    const rejected = await new GeminiImageProvider(env, { fetchImpl: notAnImage }).generate(makeInput());
    expect(rejected.status).toBe('ERROR');
    if (rejected.status !== 'GENERATED') expect(rejected.errorCode).toBe('AI_INVALID_RESPONSE');

    const textOnly = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: 'I could not do that.' }] } }] }),
      { status: 200 },
    ));
    const empty = await new GeminiImageProvider(env, { fetchImpl: textOnly }).generate(makeInput());
    expect(empty.status).toBe('ERROR');
    if (empty.status !== 'GENERATED') expect(empty.errorCode).toBe('AI_INVALID_RESPONSE');
  });

  it('reports a timeout when Gemini never answers', async () => {
    const stuck = vi.fn<typeof fetch>((_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const result = await new GeminiImageProvider(env, { fetchImpl: stuck, timeoutMs: 20 }).generate(makeInput());

    expect(result.status).toBe('ERROR');
    if (result.status !== 'GENERATED') expect(result.errorCode).toBe('AI_TIMEOUT');
  });

  it('never echoes the API key in its error messages', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ error: { message: `The key ${apiKey} is invalid` } }),
      { status: 401 },
    ));
    const result = await new GeminiImageProvider(env, { fetchImpl: fetchMock }).generate(makeInput());

    expect(JSON.stringify(result)).not.toContain(apiKey);
  });
});
