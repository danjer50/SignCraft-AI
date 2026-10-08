// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { AIEnvironment, ServerImageEditInput } from '../types.js';
import { DEFAULT_SIGN_CONFIGURATION } from '../../../src/domain/sign.js';
import { OPENROUTER_DEFAULT_MODEL, OpenRouterImageProvider } from './openRouter.js';

const apiKey = 'openrouter-test-only-key-never-real';
const env: AIEnvironment = { OPENROUTER_API_KEY: apiKey };

function tinyPng(): Uint8Array {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x10,
  ]);
}

function makeInput(): ServerImageEditInput {
  return {
    image: { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0x01, 0x02]), fileName: 'storefront.jpg', mimeType: 'image/jpeg', width: 32, height: 24 },
    configuration: { ...DEFAULT_SIGN_CONFIGURATION, businessName: 'Atelier Sable', exactText: 'ATELIER SABLE' },
    prompt: 'Preserve the facade. Exact sign text: ATELIER SABLE.',
    preserveSourceArchitecture: true,
    exactTextOverlayRequired: true,
  };
}

function imagesResponse(dataUrl: string): Response {
  return new Response(JSON.stringify({
    choices: [{ message: { content: 'Here you go', images: [{ type: 'image_url', image_url: { url: dataUrl } }] } }],
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('OpenRouter image provider', () => {
  it('does not call OpenRouter when the API key is missing', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const result = await new OpenRouterImageProvider({}, { fetchImpl: fetchMock }).generate(makeInput());

    expect(result.status).toBe('ERROR');
    if (result.status !== 'GENERATED') expect(result.errorCode).toBe('AI_NOT_CONFIGURED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the source photo as a base64 data URL and parses the returned image', async () => {
    const pngDataUrl = `data:image/png;base64,${Buffer.from(tinyPng()).toString('base64')}`;
    const fetchMock = vi.fn<typeof fetch>(async () => imagesResponse(pngDataUrl));
    const input = makeInput();
    input.mask = tinyPng();
    const result = await new OpenRouterImageProvider(env, { fetchImpl: fetchMock }).generate(input);
    const [url, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init?.body)) as {
      model: string;
      modalities: string[];
      messages: Array<{ content: Array<{ type: string; text?: string; image_url?: { url?: string } }> }>;
    };

    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${apiKey}`);
    expect(new Headers(init?.headers).get('x-title')).toBe('SignCraft AI');
    expect(body.model).toBe(OPENROUTER_DEFAULT_MODEL);
    expect(body.modalities).toEqual(['text', 'image']);
    expect(body.messages[0].content).toHaveLength(2);
    expect(body.messages[0].content[0].text).toBe(input.prompt);
    expect(body.messages[0].content[1].type).toBe('image_url');
    expect(body.messages[0].content[1].image_url?.url)
      .toBe(`data:image/jpeg;base64,${Buffer.from(makeInput().image.bytes).toString('base64')}`);
    expect(result.status).toBe('GENERATED');
    if (result.status === 'GENERATED') expect(result.imageUrl).toBe(pngDataUrl);
  });

  it('rejects an echoed source photo instead of returning a fake concept', async () => {
    const input = makeInput();
    const echo = `data:image/jpeg;base64,${Buffer.from(input.image.bytes).toString('base64')}`;
    const fetchMock = vi.fn<typeof fetch>(async () => imagesResponse(echo));
    const result = await new OpenRouterImageProvider(env, { fetchImpl: fetchMock }).generate(input);

    expect(result).toMatchObject({ status: 'ERROR', errorCode: 'AI_UNCHANGED_IMAGE' });
    expect(result).not.toHaveProperty('imageUrl');
    expect(JSON.stringify(result)).not.toContain(apiKey);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('skips an echo when a later image contains the edit', async () => {
    const input = makeInput();
    const echo = `data:image/jpeg;base64,${Buffer.from(input.image.bytes).toString('base64')}`;
    const edit = `data:image/png;base64,${Buffer.from(tinyPng()).toString('base64')}`;
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      choices: [{ message: { images: [
        { image_url: { url: echo } }, { image_url: { url: edit } },
      ] } }],
    }), { status: 200 }));
    const result = await new OpenRouterImageProvider(env, { fetchImpl: fetchMock }).generate(input);

    expect(result).toMatchObject({ status: 'GENERATED', imageUrl: edit });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('honours OPENROUTER_MODEL', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => imagesResponse(`data:image/png;base64,${Buffer.from(tinyPng()).toString('base64')}`));
    await new OpenRouterImageProvider({ ...env, OPENROUTER_MODEL: 'google/gemini-3-pro-image' }, { fetchImpl: fetchMock }).generate(makeInput());

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).model).toBe('google/gemini-3-pro-image');
  });

  it('maps key, credit, rate-limit and availability failures to safe codes', async () => {
    for (const [status, message, expected] of [
      [401, 'No auth credentials found', 'AI_AUTHENTICATION'],
      [402, 'Insufficient credits', 'AI_CREDITS_EXHAUSTED'],
      [429, 'Rate limit exceeded', 'AI_RATE_LIMITED'],
      [503, 'No available provider', 'AI_PROVIDER_UNAVAILABLE'],
      [400, 'Invalid request', 'AI_REQUEST_REJECTED'],
    ] as const) {
      const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ error: { message } }), { status }));
      const result = await new OpenRouterImageProvider(env, { fetchImpl: fetchMock }).generate(makeInput());

      expect(result.status).toBe('ERROR');
      if (result.status !== 'GENERATED') {
        expect(result.errorCode).toBe(expected);
        if (status === 400) {
          expect(result.providerHttpStatus).toBe(400);
          expect(result.providerErrorMessage).toBe('Invalid request');
        }
      }
    }
  });

  it('treats a quota error delivered inside an HTTP 200 envelope as a failure', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ error: { message: 'Insufficient credits for this request', code: 402 } }),
      { status: 200 },
    ));
    const result = await new OpenRouterImageProvider(env, { fetchImpl: fetchMock }).generate(makeInput());

    expect(result.status).toBe('ERROR');
    if (result.status !== 'GENERATED') expect(result.errorCode).toBe('AI_CREDITS_EXHAUSTED');
  });

  it('rejects a non-image or missing result', async () => {
    const textOnly = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ choices: [{ message: { content: 'I cannot edit images' } }] }),
      { status: 200 },
    ));
    const missing = await new OpenRouterImageProvider(env, { fetchImpl: textOnly }).generate(makeInput());
    expect(missing.status).toBe('ERROR');
    if (missing.status !== 'GENERATED') expect(missing.errorCode).toBe('AI_INVALID_RESPONSE');

    const wrongType = vi.fn<typeof fetch>(async () => imagesResponse('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='));
    const rejected = await new OpenRouterImageProvider(env, { fetchImpl: wrongType }).generate(makeInput());
    expect(rejected.status).toBe('ERROR');
    if (rejected.status !== 'GENERATED') expect(rejected.errorCode).toBe('AI_INVALID_RESPONSE');
  });

  it('never echoes the API key in its error messages', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ error: { message: `bad key ${apiKey}` } }),
      { status: 401 },
    ));
    const result = await new OpenRouterImageProvider(env, { fetchImpl: fetchMock }).generate(makeInput());

    expect(JSON.stringify(result)).not.toContain(apiKey);
  });
});
