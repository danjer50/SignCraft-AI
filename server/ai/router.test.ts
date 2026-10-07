// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SIGN_CONFIGURATION } from '../../src/domain/sign.js';
import { resolveProviderChain, runImageEditTask, runTextGeneration } from './router.js';
import type { AIEnvironment, ServerImageEditInput } from './types.js';

/**
 * Every test in this file mocks the provider HTTP calls. No request ever leaves the process, so
 * the suite can run as often as needed without touching a real quota.
 */

const GEMINI_KEY = 'gemini-test-only-key-never-real';
const OPENROUTER_KEY = 'openrouter-test-only-key-never-real';
const GROQ_KEY = 'groq-test-only-key-never-real';

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

function geminiImageResponse(): Response {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: Buffer.from(tinyPng()).toString('base64') } }] } }],
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

function openRouterImageResponse(): Response {
  return new Response(JSON.stringify({
    choices: [{ message: { images: [{ type: 'image_url', image_url: { url: `data:image/png;base64,${Buffer.from(tinyPng()).toString('base64')}` } }] } }],
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

/** Route each provider host to its own scripted answer, so a test can fail one and pass another. */
function scriptedFetch(scripts: Record<string, () => Response | Promise<Response>>): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>(async (input: RequestInfo | URL) => {
    const url = String(input);
    const host = url.includes('generativelanguage.googleapis.com') ? 'gemini'
      : url.includes('openrouter.ai') ? 'openrouter'
        : url.includes('api.groq.com') ? 'groq'
          : url.includes('gen.pollinations.ai') ? 'pollinations'
            : url.includes('api.cloudflare.com') ? 'cloudflare' : 'unknown';
    const script = scripts[host];
    if (!script) return new Response(JSON.stringify({ error: { message: 'unexpected host' } }), { status: 500 });
    return script();
  });
}

function failure(status: number, message: string): () => Response {
  return () => new Response(JSON.stringify({ error: { message } }), { status });
}

const geminiOnly: AIEnvironment = { GEMINI_API_KEY: GEMINI_KEY };
const allThree: AIEnvironment = { GEMINI_API_KEY: GEMINI_KEY, OPENROUTER_API_KEY: OPENROUTER_KEY, GROQ_API_KEY: GROQ_KEY };
const POLLINATIONS_KEY = 'pollinations-test-only-key-never-real';
const allFour: AIEnvironment = { ...allThree, POLLINATIONS_API_KEY: POLLINATIONS_KEY };

function pollinationsImageResponse(): Response {
  return new Response(JSON.stringify({
    created: 1_700_000_000,
    data: [{ b64_json: Buffer.from(tinyPng()).toString('base64'), media_type: 'image/png' }],
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

function cloudflareImageResponse(): Response {
  return new Response(JSON.stringify({
    success: true,
    result: { image: Buffer.from(tinyPng()).toString('base64') },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

const cloudflareOnly: AIEnvironment = {
  CLOUDFLARE_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
  CLOUDFLARE_API_TOKEN: 'test-only-token-never-real',
};

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('provider chain resolution', () => {
  it('uses the documented default order and skips providers with no credentials', () => {
    const chain = resolveProviderChain('image-edit', geminiOnly);

    expect(chain.attempts.map((step) => step.entry.id)).toEqual(['gemini']);
    expect(chain.skipped).toEqual([
      { id: 'groq', reason: 'unsupported' },
      { id: 'openrouter', reason: 'unconfigured' },
      { id: 'cloudflare-flux', reason: 'unconfigured' },
    ]);
  });

  it('reaches Cloudflare Workers AI by default, so an existing Cloudflare-only deployment works', () => {
    const chain = resolveProviderChain('image-edit', cloudflareOnly);

    expect(chain.attempts.map((step) => step.entry.id)).toEqual(['cloudflare-flux']);
    expect(chain.attempts[0].requested).toBe('default');
    expect(chain.skipped).toEqual([
      { id: 'groq', reason: 'unsupported' },
      { id: 'gemini', reason: 'unconfigured' },
      { id: 'openrouter', reason: 'unconfigured' },
    ]);
  });

  it('keeps Cloudflare last when other providers are configured, and never duplicates it', () => {
    const chain = resolveProviderChain('image-edit', { ...allThree, ...cloudflareOnly });

    expect(chain.attempts.map((step) => step.entry.id)).toEqual(['gemini', 'openrouter', 'cloudflare-flux']);
  });

  it('pins AI_PROVIDER first and keeps every other configured provider as a fallback', () => {
    const chain = resolveProviderChain('image-edit', {
      ...allThree,
      AI_PROVIDER: 'cloudflare-flux',
      CLOUDFLARE_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
      CLOUDFLARE_API_TOKEN: 'test-only-token-never-real',
    });

    expect(chain.attempts.map((step) => step.entry.id)).toEqual(['cloudflare-flux', 'gemini', 'openrouter']);
    expect(chain.pinned).toBe('cloudflare-flux');
  });

  it('honours a custom AI_PROVIDER_ORDER', () => {
    const chain = resolveProviderChain('image-edit', { ...allThree, AI_PROVIDER_ORDER: 'openrouter, gemini' });

    expect(chain.attempts.map((step) => step.entry.id)).toEqual(['openrouter', 'gemini']);
  });

  it('falls back to the default order when AI_PROVIDER_ORDER names nothing real', () => {
    const chain = resolveProviderChain('image-edit', { ...geminiOnly, AI_PROVIDER_ORDER: 'not-a-provider' });

    expect(chain.attempts.map((step) => step.entry.id)).toEqual(['gemini']);
  });

  it('never schedules Groq for an image task, because Groq has no image models', () => {
    const chain = resolveProviderChain('image-edit', allThree);

    expect(chain.attempts.map((step) => step.entry.id)).toEqual(['gemini', 'openrouter']);
    expect(chain.skipped).toContainEqual({ id: 'groq', reason: 'unsupported' });
  });

  it('schedules Groq for the text task it declares support for', () => {
    const chain = resolveProviderChain('text', allThree);

    expect(chain.attempts.map((step) => step.entry.id)).toEqual(['groq']);
  });

  it('keeps Pollinations out of the default chain entirely, even when its key is present', () => {
    const chain = resolveProviderChain('image-edit', allFour);

    expect(chain.attempts.map((step) => step.entry.id)).toEqual(['gemini', 'openrouter']);
    expect(chain.attempts.some((step) => step.entry.id === 'pollinations')).toBe(false);
    expect(chain.skipped.some((entry) => entry.id === 'pollinations')).toBe(false);
  });

  it('schedules Pollinations only when an explicit order names it', () => {
    const chain = resolveProviderChain('image-edit', { ...allFour, AI_PROVIDER_ORDER: 'pollinations,gemini' });

    expect(chain.attempts.map((step) => step.entry.id)).toEqual(['pollinations', 'gemini']);
    expect(chain.attempts[0].requested).toBe('listed');
  });

  it('honours AI_PROVIDER=pollinations as a pin, with a configured provider as fallback', () => {
    const chain = resolveProviderChain('image-edit', { ...allFour, AI_PROVIDER: 'pollinations' });

    expect(chain.attempts.map((step) => step.entry.id)).toEqual(['pollinations', 'gemini', 'openrouter']);
    expect(chain.pinned).toBe('pollinations');
  });

  it('never schedules Pollinations for the text task it has no adapter for', () => {
    const chain = resolveProviderChain('text', { ...allFour, AI_PROVIDER_ORDER: 'groq,pollinations' });

    expect(chain.attempts.map((step) => step.entry.id)).toEqual(['groq']);
    expect(chain.skipped).toContainEqual({ id: 'pollinations', reason: 'unsupported' });
  });

  it('attempts an explicitly listed provider even without credentials, so the real reason is reported', () => {
    const chain = resolveProviderChain('image-edit', { OPENROUTER_API_KEY: OPENROUTER_KEY, AI_PROVIDER_ORDER: 'gemini,openrouter' });

    // Gemini has no key, but the operator listed it, so it is attempted and reports the real reason.
    expect(chain.attempts.map((step) => step.entry.id)).toEqual(['gemini', 'openrouter']);
    // An explicit order replaces the default one, so Groq is not part of this chain at all.
    expect(chain.skipped).toEqual([]);
  });
});

describe('image-edit fallback chain', () => {
  it('returns the first provider result without calling the others', async () => {
    const fetchMock = scriptedFetch({ gemini: geminiImageResponse });
    const result = await runImageEditTask(makeInput(), geminiOnly, { fetchImpl: fetchMock });

    expect(result.status).toBe('GENERATED');
    if (result.status === 'GENERATED') expect(result.providerId).toBe('gemini');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith('[AI] gemini succeeded');
  });

  it('falls back to OpenRouter when Gemini is rate-limited', async () => {
    const fetchMock = scriptedFetch({
      gemini: failure(429, 'You exceeded your current quota'),
      openrouter: openRouterImageResponse,
    });
    const result = await runImageEditTask(makeInput(), allThree, { fetchImpl: fetchMock });

    expect(result.status).toBe('GENERATED');
    if (result.status === 'GENERATED') expect(result.providerId).toBe('openrouter');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(logSpy).toHaveBeenCalledWith('[AI] gemini failed (AI_RATE_LIMITED)');
    expect(logSpy).toHaveBeenCalledWith('[AI] falling back to openrouter');
  });

  it('falls back when the first provider is temporarily unavailable', async () => {
    const fetchMock = scriptedFetch({
      gemini: failure(503, 'The model is overloaded'),
      openrouter: openRouterImageResponse,
    });
    const result = await runImageEditTask(makeInput(), allThree, { fetchImpl: fetchMock });

    expect(result.status).toBe('GENERATED');
    if (result.status === 'GENERATED') expect(result.providerId).toBe('openrouter');
  });

  it('falls back when the first provider returns an unusable payload', async () => {
    const fetchMock = scriptedFetch({
      gemini: () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'no image here' }] } }] }), { status: 200 }),
      openrouter: openRouterImageResponse,
    });
    const result = await runImageEditTask(makeInput(), allThree, { fetchImpl: fetchMock });

    expect(result.status).toBe('GENERATED');
    if (result.status === 'GENERATED') expect(result.providerId).toBe('openrouter');
    expect(logSpy).toHaveBeenCalledWith('[AI] gemini failed (AI_INVALID_RESPONSE)');
  });

  it('falls back when the first provider authentication fails', async () => {
    const fetchMock = scriptedFetch({
      gemini: failure(403, 'API key not valid'),
      openrouter: openRouterImageResponse,
    });
    const result = await runImageEditTask(makeInput(), allThree, { fetchImpl: fetchMock });

    expect(result.status).toBe('GENERATED');
    expect(logSpy).toHaveBeenCalledWith('[AI] gemini failed (AI_AUTHENTICATION)');
  });

  it('keeps the pinned provider first and falls back to Gemini when Cloudflare fails', async () => {
    const fetchMock = scriptedFetch({
      cloudflare: failure(500, 'Workers AI is temporarily unavailable'),
      gemini: geminiImageResponse,
    });
    const result = await runImageEditTask(makeInput(), {
      ...allThree,
      AI_PROVIDER: 'cloudflare-flux',
      CLOUDFLARE_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
      CLOUDFLARE_API_TOKEN: 'test-only-token-never-real',
    }, { fetchImpl: fetchMock });

    expect(result.status).toBe('GENERATED');
    if (result.status === 'GENERATED') expect(result.providerId).toBe('gemini');
    expect(fetchMock.mock.calls[0][0]).toContain('api.cloudflare.com');
  });

  it('generates through Cloudflare Workers AI for a Cloudflare-only deployment, with no extra variables', async () => {
    const fetchMock = scriptedFetch({ cloudflare: cloudflareImageResponse });
    const result = await runImageEditTask(makeInput(), cloudflareOnly, { fetchImpl: fetchMock });

    expect(result.status).toBe('GENERATED');
    // The adapter reports its own model-scoped id; the chain step is `cloudflare-flux`.
    if (result.status === 'GENERATED') expect(result.providerId).toBe('cloudflare-flux-2-klein-9b');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('api.cloudflare.com');
  });

  it('does not call any provider when only a text-only provider is configured', async () => {
    const fetchMock = scriptedFetch({});
    const result = await runImageEditTask(makeInput(), { GROQ_API_KEY: GROQ_KEY }, { fetchImpl: fetchMock });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.status).toBe('UNAVAILABLE');
    if (result.status !== 'GENERATED') {
      expect(result.errorCode).toBe('AI_NOT_CONFIGURED');
      expect(result.message).toMatch(/has not been edited/i);
      expect(result.message).toMatch(/groq/i);
    }
  });

  it('returns a clean, actionable error when every provider fails, and skips no provider silently', async () => {
    const fetchMock = scriptedFetch({
      gemini: failure(429, 'rate limited'),
      openrouter: failure(402, 'insufficient credits'),
    });
    const result = await runImageEditTask(makeInput(), allThree, { fetchImpl: fetchMock });

    expect(result.status).toBe('ERROR');
    if (result.status !== 'GENERATED') {
      // Quota problems are the most actionable failure, so they are surfaced for the retry message.
      expect(result.errorCode).toBe('AI_RATE_LIMITED');
      expect(result.providerId).toBe('ai-router');
      expect(result.message).toContain('gemini: rate limited');
      expect(result.message).toContain('openrouter: quota exhausted');
      expect(result.message).toMatch(/has not been edited/i);
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never leaks API keys into a returned error message', async () => {
    const fetchMock = scriptedFetch({
      gemini: failure(401, `invalid key ${GEMINI_KEY}`),
      openrouter: failure(500, `upstream failure with ${OPENROUTER_KEY}`),
    });
    const result = await runImageEditTask(makeInput(), allThree, { fetchImpl: fetchMock });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(GEMINI_KEY);
    expect(serialized).not.toContain(OPENROUTER_KEY);
    expect(serialized).not.toContain(GROQ_KEY);
  });

  it('preserves the legacy single-provider behaviour when nothing is configured', async () => {
    const fetchMock = scriptedFetch({});
    const result = await runImageEditTask(makeInput(), { AI_PROVIDER: 'demo' }, { fetchImpl: fetchMock });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.status).toBe('UNAVAILABLE');
    if (result.status !== 'GENERATED') {
      expect(result.errorCode).toBe('AI_NOT_CONFIGURED');
      expect(result.message).toMatch(/has not been edited/i);
    }
  });

  it('keeps the legacy message for a provider name that has no adapter', async () => {
    const fetchMock = scriptedFetch({});
    const result = await runImageEditTask(makeInput(), { AI_PROVIDER: 'acme-vision' }, { fetchImpl: fetchMock });

    expect(fetchMock).not.toHaveBeenCalled();
    if (result.status !== 'GENERATED') expect(result.message).toContain('“acme-vision” has no server adapter installed yet');
  });

  it('reports the pinned provider own error when it is configured but its credentials are missing', async () => {
    const fetchMock = scriptedFetch({});
    const result = await runImageEditTask(makeInput(), { AI_PROVIDER: 'cloudflare-flux' }, { fetchImpl: fetchMock });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.status).toBe('ERROR');
    if (result.status !== 'GENERATED') {
      expect(result.errorCode).toBe('AI_NOT_CONFIGURED');
      expect(result.message).toContain('Cloudflare Workers AI is not configured');
    }
  });

  it('stops the chain instead of starting an attempt that cannot fit in the budget', async () => {
    const fetchMock = scriptedFetch({
      gemini: () => new Promise<Response>((_resolve, reject) => {
        // Simulate a provider that never answers: the per-attempt timeout aborts it.
        setTimeout(() => reject(new DOMException('aborted', 'AbortError')), 1_000);
      }),
      openrouter: openRouterImageResponse,
    });
    const result = await runImageEditTask(makeInput(), allThree, {
      fetchImpl: fetchMock,
      providerTimeoutMs: 1_000,
      totalTimeoutMs: 1_200,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('ERROR');
    if (result.status !== 'GENERATED') expect(result.errorCode).toBe('AI_TIMEOUT');
    expect(logSpy).toHaveBeenCalledWith('[AI] skipping provider: openrouter (request budget exhausted)');
  });
});

describe('text task (no screen calls this yet)', () => {
  it('uses the configured Groq adapter', async () => {
    const fetchMock = scriptedFetch({
      groq: () => new Response(JSON.stringify({ choices: [{ message: { content: 'Hello from Groq' } }] }), { status: 200 }),
    });
    const result = await runTextGeneration({ prompt: 'Say hello', systemPrompt: 'Be brief.' }, { GROQ_API_KEY: GROQ_KEY }, { fetchImpl: fetchMock });

    expect(result.status).toBe('GENERATED');
    if (result.status === 'GENERATED') {
      expect(result.providerId).toBe('groq');
      expect(result.text).toBe('Hello from Groq');
      expect(result.model).toBe('openai/gpt-oss-120b');
    }
  });

  it('reports a clean error when no text provider is configured', async () => {
    const fetchMock = scriptedFetch({});
    const result = await runTextGeneration({ prompt: 'Say hello' }, geminiOnly, { fetchImpl: fetchMock });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.status).toBe('ERROR');
    if (result.status === 'ERROR') expect(result.errorCode).toBe('AI_NOT_CONFIGURED');
  });

  it('does not leak a key when Groq rate-limits the request', async () => {
    const fetchMock = scriptedFetch({ groq: failure(429, `slow down ${GROQ_KEY}`) });
    const result = await runTextGeneration({ prompt: 'Say hello' }, { GROQ_API_KEY: GROQ_KEY }, { fetchImpl: fetchMock });

    expect(result.status).toBe('ERROR');
    if (result.status === 'ERROR') expect(result.errorCode).toBe('AI_RATE_LIMITED');
    expect(JSON.stringify(result)).not.toContain(GROQ_KEY);
  });
});

describe('Pollinations as a fallback image provider', () => {
  it('falls back to Gemini when Pollinations is rate-limited, without parallel calls', async () => {
    const fetchMock = scriptedFetch({
      pollinations: failure(429, 'Too many requests'),
      gemini: geminiImageResponse,
    });
    const result = await runImageEditTask(makeInput(), { ...allFour, AI_PROVIDER_ORDER: 'pollinations,gemini' }, { fetchImpl: fetchMock });

    expect(result.status).toBe('GENERATED');
    if (result.status === 'GENERATED') expect(result.providerId).toBe('gemini');
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://gen.pollinations.ai/v1/images/edits');
    expect(String(fetchMock.mock.calls[1][0])).toContain('generativelanguage.googleapis.com');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(logSpy).toHaveBeenCalledWith('[AI] pollinations failed (AI_RATE_LIMITED)');
    expect(logSpy).toHaveBeenCalledWith('[AI] falling back to gemini');
  });

  it('serves the request from Pollinations when it is first and succeeds', async () => {
    const fetchMock = scriptedFetch({ pollinations: pollinationsImageResponse });
    const result = await runImageEditTask(makeInput(), { ...allFour, AI_PROVIDER_ORDER: 'pollinations,gemini' }, { fetchImpl: fetchMock });

    expect(result.status).toBe('GENERATED');
    if (result.status === 'GENERATED') expect(result.providerId).toBe('pollinations');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('makes no network call at all when a listed Pollinations key is missing', async () => {
    const fetchMock = scriptedFetch({ gemini: geminiImageResponse });
    const result = await runImageEditTask(makeInput(), {
      AI_PROVIDER_ORDER: 'pollinations,gemini',
      GEMINI_API_KEY: GEMINI_KEY,
      OPENROUTER_API_KEY: OPENROUTER_KEY,
    }, { fetchImpl: fetchMock });

    // Pollinations is reported as unconfigured and skipped; Gemini then serves the request.
    expect(result.status).toBe('GENERATED');
    if (result.status === 'GENERATED') expect(result.providerId).toBe('gemini');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('generativelanguage.googleapis.com');
    expect(logSpy).toHaveBeenCalledWith('[AI] pollinations failed (AI_NOT_CONFIGURED)');
  });

  it('ignores a Pollinations key when no order or pin activates it', async () => {
    const fetchMock = scriptedFetch({ gemini: geminiImageResponse });
    const result = await runImageEditTask(makeInput(), allFour, { fetchImpl: fetchMock });

    expect(result.status).toBe('GENERATED');
    if (result.status === 'GENERATED') expect(result.providerId).toBe('gemini');
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('pollinations'))).toBe(false);
  });
});
