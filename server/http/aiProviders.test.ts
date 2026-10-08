// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SIGN_CONFIGURATION, type SignConfiguration } from '../../src/domain/sign.js';
import { handleAiGeneration } from './ai.js';
import type { AIEnvironment } from '../ai/types.js';

/**
 * End-to-end tests for the multi-provider chain through the real HTTP handler. Every provider call
 * is mocked, so no quota is consumed.
 */

const GEMINI_KEY = 'gemini-test-only-key-never-real';
const OPENROUTER_KEY = 'openrouter-test-only-key-never-real';
const CLOUDFLARE_TOKEN = 'cloudflare-test-only-token-never-real';
const CLOUDFLARE_ACCOUNT = '0123456789abcdef0123456789abcdef';

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

function makeRequest(configurationOverrides: Partial<Record<keyof SignConfiguration, unknown>> = {}): Request {
  const image = new File([jpegFixture()], 'front.jpg', { type: 'image/jpeg' });
  const form = new FormData();
  form.append('storefrontImage', image, image.name);
  form.append('configuration', JSON.stringify({
    ...DEFAULT_SIGN_CONFIGURATION,
    businessName: 'Atelier Sable',
    exactText: 'ATELIER SABLE · حرف',
    ...configurationOverrides,
  }));
  return new Request('https://signcraft.example/api/ai/generate-sign', { method: 'POST', body: form });
}

const pngBase64 = () => Buffer.from(tinyPng()).toString('base64');

/** Script one answer per provider host, so a test can fail one provider and pass the next. */
function scriptedFetch(scripts: Record<string, () => Response>): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>(async (input: RequestInfo | URL) => {
    const url = String(input);
    const host = url.includes('generativelanguage.googleapis.com') ? 'gemini'
      : url.includes('openrouter.ai') ? 'openrouter'
        : url.includes('api.cloudflare.com') ? 'cloudflare' : 'unknown';
    const script = scripts[host];
    if (!script) return new Response(JSON.stringify({ error: { message: 'host not scripted' } }), { status: 500 });
    return script();
  });
}

const geminiOk = () => new Response(JSON.stringify({
  candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: pngBase64() } }] } }],
}), { status: 200 });

const openRouterOk = () => new Response(JSON.stringify({
  choices: [{ message: { images: [{ image_url: { url: `data:image/png;base64,${pngBase64()}` } }] } }],
}), { status: 200 });

const failure = (status: number, message: string) => () => new Response(JSON.stringify({ error: { message } }), { status });

describe('multi-provider AI generation through the API handler', () => {
  it('records request validation failures before selecting a provider without logging request content', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const requestBody = 'PRIVATE_REQUEST_BODY_MUST_NOT_BE_LOGGED';
    const request = new Request('https://signcraft.example/api/ai/generate-sign', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: requestBody,
    });
    try {
      const response = await handleAiGeneration(request, { GEMINI_API_KEY: GEMINI_KEY });
      const records = (info.mock.calls as unknown[][])
        .map((call) => typeof call[0] === 'string' ? call[0] : '')
        .filter((message) => message.startsWith('[AI_DIAGNOSTIC] '))
        .map((message) => JSON.parse(message.slice('[AI_DIAGNOSTIC] '.length)) as Record<string, unknown>);

      expect(response.status).toBe(415);
      expect(records.map((record) => record.stage)).toEqual(['pre-provider', 'error']);
      expect(records[1]).toMatchObject({
        provider: 'none',
        requestId: expect.any(String),
        providerReached: false,
        providerAdapterInvoked: false,
        providerRequestAttempted: false,
        providerResponseReceived: false,
        appHttpStatus: 415,
        responseCode: 'INVALID_CONTENT_TYPE',
        internalErrorCode: 'INVALID_CONTENT_TYPE',
        failedBeforeProviderInvocation: true,
        imageValidation: { state: 'not-run', failureCode: null },
        configurationValidation: { state: 'not-run', failureCode: null },
        validatedImageDataReturned: false,
      });
      expect(JSON.stringify(records)).not.toContain(requestBody);
    } finally {
      info.mockRestore();
    }
  });

  it('reports image and brief validation outcomes without logging their values', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      const invalidImage = new File(['svg'], 'front.svg', { type: 'image/svg+xml' });
      const imageForm = new FormData();
      imageForm.append('storefrontImage', invalidImage, invalidImage.name);
      imageForm.append('configuration', JSON.stringify({
        ...DEFAULT_SIGN_CONFIGURATION,
        businessName: 'Private Studio Name',
      }));
      const imageResponse = await handleAiGeneration(new Request('https://signcraft.example/api/ai/generate-sign', {
        method: 'POST', body: imageForm,
      }));
      const afterImageRecords = (info.mock.calls as unknown[][])
        .map((call) => typeof call[0] === 'string' ? call[0] : '')
        .filter((line) => line.startsWith('[AI_DIAGNOSTIC] '))
        .map((line) => JSON.parse(line.slice('[AI_DIAGNOSTIC] '.length)) as Record<string, unknown>);
      const imageError = afterImageRecords.find((record) => record.stage === 'error');

      expect(imageResponse.status).toBe(415);
      expect(imageError).toMatchObject({
        responseCode: 'UNSUPPORTED_IMAGE',
        imageValidation: { state: 'failed', failureCode: 'UNSUPPORTED_IMAGE' },
        configurationValidation: { state: 'not-run', failureCode: null },
        providerRequestAttempted: false,
        failedBeforeProviderInvocation: true,
      });

      info.mockClear();
      const briefResponse = await handleAiGeneration(makeRequest({ businessName: 'Private Studio Name', widthCm: '0' }));
      const briefRecords = (info.mock.calls as unknown[][])
        .map((call) => typeof call[0] === 'string' ? call[0] : '')
        .filter((line) => line.startsWith('[AI_DIAGNOSTIC] '))
        .map((line) => JSON.parse(line.slice('[AI_DIAGNOSTIC] '.length)) as Record<string, unknown>);
      const briefError = briefRecords.find((record) => record.stage === 'error');

      expect(briefResponse.status).toBe(400);
      expect(briefError).toMatchObject({
        responseCode: 'INVALID_CONFIGURATION',
        imageValidation: { state: 'incomplete', failureCode: null },
        configurationValidation: { state: 'failed', failureCode: 'INVALID_CONFIGURATION' },
        providerRequestAttempted: false,
        failedBeforeProviderInvocation: true,
      });
      expect(JSON.stringify([...afterImageRecords, ...briefRecords])).not.toContain('Private Studio Name');
    } finally {
      info.mockRestore();
    }
  });

  it('serves the request from Gemini when only Gemini is configured', async () => {
    const fetchMock = scriptedFetch({ gemini: geminiOk });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const response = await handleAiGeneration(makeRequest(), { GEMINI_API_KEY: GEMINI_KEY });
      const body = await response.json() as { status: string; providerId: string; imageUrl: string; promptVersion: string };

      expect(response.status).toBe(200);
      expect(body.status).toBe('GENERATED');
      expect(body.providerId).toBe('gemini');
      expect(body.imageUrl).toMatch(/^data:image\/png;base64,/);
      expect(body.promptVersion).toBe('storefront-inpaint-v7');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('returns HTTP 502 and the honest error code when the only provider echoes the photo', async () => {
    const sourceBase64 = Buffer.from(jpegFixture()).toString('base64');
    vi.stubGlobal('fetch', scriptedFetch({ gemini: () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/jpeg', data: sourceBase64 } }] } }],
    }), { status: 200 }) }));
    try {
      const response = await handleAiGeneration(makeRequest(), { GEMINI_API_KEY: GEMINI_KEY });
      const body = await response.json();
      expect(response.status).toBe(502);
      expect(body).toMatchObject({ status: 'ERROR', code: 'AI_UNCHANGED_IMAGE', providerId: 'gemini' });
      expect(body).not.toHaveProperty('imageUrl');
      expect(JSON.stringify(body)).not.toContain(GEMINI_KEY);
      expect(JSON.stringify(body)).not.toContain(sourceBase64);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('returns a real fallback edit through the HTTP handler after Gemini echoes the source', async () => {
    const fetchMock = scriptedFetch({
      gemini: () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{
        inlineData: { mimeType: 'image/jpeg', data: Buffer.from(jpegFixture()).toString('base64') },
      }] } }] }), { status: 200 }),
      openrouter: openRouterOk,
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const response = await handleAiGeneration(makeRequest(), { GEMINI_API_KEY: GEMINI_KEY, OPENROUTER_API_KEY: OPENROUTER_KEY });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ status: 'GENERATED', providerId: 'openrouter', promptVersion: 'storefront-inpaint-v7' });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps the upstream error code in diagnostics without adding it to the public response', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.stubGlobal('fetch', scriptedFetch({
      openrouter: () => new Response(JSON.stringify({
        error: { code: 'invalid_model', message: 'The requested model is unavailable.' },
      }), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } }),
    }));
    try {
      const response = await handleAiGeneration(makeRequest(), {
        OPENROUTER_API_KEY: OPENROUTER_KEY,
        AI_PROVIDER_ORDER: 'openrouter',
      });
      const body = await response.json() as Record<string, unknown>;
      const diagnosticLines = (info.mock.calls as unknown[][])
        .map((call) => typeof call[0] === 'string' ? call[0] : '')
        .filter((line) => line.startsWith('[AI_DIAGNOSTIC] '));
      const records = diagnosticLines
        .map((line) => JSON.parse(line.slice('[AI_DIAGNOSTIC] '.length)) as Record<string, unknown>);
      const errorRecord = records.find((record) => record.stage === 'error');
      const summaryRecord = records.find((record) => record.stage === 'request-summary');

      expect(response.status).toBe(422);
      expect(body).not.toHaveProperty('providerErrorCode');
      expect(errorRecord).toMatchObject({
        providerErrorCode: 'invalid_model',
        providerErrorMessage: 'The requested model is unavailable.',
        providerHttpStatus: 200,
        responseContentType: 'application/json',
        internalErrorCode: 'AI_REQUEST_REJECTED',
      });
      expect(summaryRecord).toMatchObject({
        stage: 'request-summary',
        appHttpStatus: 422,
        responseCode: 'AI_REQUEST_REJECTED',
        internalErrorCode: 'AI_REQUEST_REJECTED',
        provider: 'openrouter',
        model: 'google/gemini-3.1-flash-image',
        providerAdapterInvoked: true,
        providerRequestAttempted: true,
        providerResponseReceived: true,
        providerHttpStatus: 200,
        providerErrorCode: 'invalid_model',
        failedBeforeProviderInvocation: false,
        imageValidation: { state: 'passed', failureCode: null },
        configurationValidation: { state: 'passed', failureCode: null },
        providerFailures: [expect.objectContaining({
          providerId: 'openrouter',
          model: 'google/gemini-3.1-flash-image',
          adapterInvoked: true,
          requestAttempted: true,
          responseReceived: true,
          providerHttpStatus: 200,
          internalErrorCode: 'AI_REQUEST_REJECTED',
          providerErrorCode: 'invalid_model',
        })],
      });
      expect(response.headers.get('x-ai-diagnostic-id')).toBe(summaryRecord?.requestId);
    } finally {
      vi.unstubAllGlobals();
      info.mockRestore();
    }
  });

  it('redacts brief text and contact details from correlated provider diagnostics', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const businessName = 'Atelier Confidentiel';
    const exactText = 'ENSEIGNE PRIVÉE';
    const notes = 'Contact client@example.test';
    const providerMessage = `Input text "${businessName}" / "${exactText}"; notes ${notes}`;
    vi.stubGlobal('fetch', scriptedFetch({
      openrouter: failure(400, providerMessage),
    }));
    try {
      const response = await handleAiGeneration(makeRequest({ businessName, exactText, notes }), {
        OPENROUTER_API_KEY: OPENROUTER_KEY,
        AI_PROVIDER_ORDER: 'openrouter',
      });
      const diagnosticLines = (info.mock.calls as unknown[][])
        .map((call) => typeof call[0] === 'string' ? call[0] : '')
        .filter((line) => line.startsWith('[AI_DIAGNOSTIC] '));
      const serialized = diagnosticLines.join('\n');
      const summary = diagnosticLines
        .map((line) => JSON.parse(line.slice('[AI_DIAGNOSTIC] '.length)) as Record<string, unknown>)
        .find((record) => record.stage === 'request-summary');

      expect(response.status).toBe(422);
      expect(serialized).not.toContain(businessName);
      expect(serialized).not.toContain(exactText);
      expect(serialized).not.toContain(notes);
      expect(serialized).not.toContain('client@example.test');
      expect(summary).toMatchObject({
        providerErrorMessage: expect.stringContaining('[redacted user input]'),
      });
    } finally {
      vi.unstubAllGlobals();
      info.mockRestore();
    }
  });

  it('serves the request from OpenRouter when only OpenRouter is configured', async () => {
    const fetchMock = scriptedFetch({ openrouter: openRouterOk });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const response = await handleAiGeneration(makeRequest(), { OPENROUTER_API_KEY: OPENROUTER_KEY });
      const body = await response.json() as { status: string; providerId: string };

      expect(response.status).toBe(200);
      expect(body.providerId).toBe('openrouter');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps Cloudflare FLUX first when it is the configured provider, and falls back to Gemini on a rate limit', async () => {
    const fetchMock = scriptedFetch({
      cloudflare: failure(429, 'Too many requests'),
      gemini: geminiOk,
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const environment: AIEnvironment = {
        AI_PROVIDER: 'cloudflare-flux',
        CLOUDFLARE_ACCOUNT_ID: CLOUDFLARE_ACCOUNT,
        CLOUDFLARE_API_TOKEN: CLOUDFLARE_TOKEN,
        GEMINI_API_KEY: GEMINI_KEY,
      };
      const response = await handleAiGeneration(makeRequest(), environment);
      const body = await response.json() as { status: string; providerId: string };

      expect(response.status).toBe(200);
      expect(body.providerId).toBe('gemini');
      expect(String(fetchMock.mock.calls[0][0])).toContain('api.cloudflare.com');
      expect(String(fetchMock.mock.calls[1][0])).toContain('generativelanguage.googleapis.com');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('sends the same SignCraft prompt to the fallback provider, exact text included', async () => {
    const fetchMock = scriptedFetch({ gemini: geminiOk });
    vi.stubGlobal('fetch', fetchMock);
    try {
      await handleAiGeneration(makeRequest({ materials: ['acrylic', 'ledModules'] }), { GEMINI_API_KEY: GEMINI_KEY });
      const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as { contents: Array<{ parts: Array<{ text?: string }> }> };
      const prompt = body.contents[0].parts[0].text ?? '';

      expect(prompt).toContain('ATELIER SABLE · حرف');
      expect(prompt).toContain('polished cast acrylic');
      expect(prompt).toContain('integrated LED modules');
      expect(prompt).toContain('Preserve the original building');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('returns one clean, retryable error when every configured provider fails', async () => {
    const fetchMock = scriptedFetch({
      gemini: failure(429, `quota exceeded for ${GEMINI_KEY}`),
      openrouter: failure(402, `no credits on ${OPENROUTER_KEY}`),
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const response = await handleAiGeneration(makeRequest(), {
        GEMINI_API_KEY: GEMINI_KEY,
        OPENROUTER_API_KEY: OPENROUTER_KEY,
      });
      const body = await response.json() as {
        status: string;
        code: string;
        providerId: string;
        message: string;
        imageUrl?: string;
        providerFailures?: Array<{ providerId: string; providerHttpStatus?: number; providerErrorMessage?: string }>;
      };
      const serialized = JSON.stringify(body);

      expect(response.status).toBe(429);
      expect(body.status).toBe('ERROR');
      expect(body.code).toBe('AI_RATE_LIMITED');
      expect(body.providerId).toBe('ai-router');
      expect(body).not.toHaveProperty('imageUrl');
      expect(body.providerFailures).toMatchObject([
        { providerId: 'gemini', providerHttpStatus: 429, providerErrorMessage: 'quota exceeded for [redacted]' },
        { providerId: 'openrouter', providerHttpStatus: 402, providerErrorMessage: 'no credits on [redacted]' },
      ]);
      for (const secret of [GEMINI_KEY, OPENROUTER_KEY, CLOUDFLARE_TOKEN]) {
        expect(serialized).not.toContain(secret);
      }
      expect(serialized).not.toMatch(/stack|at .*\.ts:/i);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('never calls a provider when no provider is configured', async () => {
    const fetchMock = scriptedFetch({});
    vi.stubGlobal('fetch', fetchMock);
    try {
      const response = await handleAiGeneration(makeRequest(), {});

      expect(response.status).toBe(503);
      expect((await response.json()).status).toBe('UNAVAILABLE');
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('skips a provider whose key is missing and still succeeds on the next one', async () => {
    const fetchMock = scriptedFetch({ openrouter: openRouterOk });
    vi.stubGlobal('fetch', fetchMock);
    try {
      // Gemini is listed but has no key: it is skipped without a wasted call, OpenRouter serves it.
      const response = await handleAiGeneration(makeRequest(), {
        AI_PROVIDER_ORDER: 'gemini,openrouter',
        OPENROUTER_API_KEY: OPENROUTER_KEY,
      });
      const body = await response.json() as { status: string; providerId: string };

      expect(response.status).toBe(200);
      expect(body.providerId).toBe('openrouter');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('never exposes a provider key in a successful response either', async () => {
    const fetchMock = scriptedFetch({ gemini: geminiOk });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const response = await handleAiGeneration(makeRequest(), { GEMINI_API_KEY: GEMINI_KEY });
      const serialized = JSON.stringify(await response.json());

      expect(serialized).not.toContain(GEMINI_KEY);
      expect(serialized).not.toContain('API_KEY');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
