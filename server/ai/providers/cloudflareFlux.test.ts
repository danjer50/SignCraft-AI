// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { SignConfiguration } from '../../../src/domain/sign.js';
import type { AIEnvironment, ServerImageEditInput } from '../types.js';
import { CloudflareFluxProvider, CLOUDFLARE_FLUX_MODEL } from './cloudflareFlux.js';

const accountId = '0123456789abcdef0123456789abcdef';
const env: AIEnvironment = { CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: 'test-only-token-never-real' };
const configuration: SignConfiguration = {
  businessName: 'Atelier Sable',
  category: 'retail',
  signType: 'threeD',
  style: 'modern',
  materials: ['acrylic', 'aluminiumComposite'],
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

function makeInput(): ServerImageEditInput {
  return {
    image: { bytes: jpegFixture(), fileName: 'storefront.jpg', mimeType: 'image/jpeg', width: 511, height: 287 },
    configuration,
    prompt: 'Preserve the facade. Exact sign text: ATELIER SABLE · حرف.',
    preserveSourceArchitecture: true,
    exactTextOverlayRequired: true,
  };
}

describe('Cloudflare FLUX.2 Klein 9B provider', () => {
  it('does not call Cloudflare when account ID or token is missing or malformed', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const provider = new CloudflareFluxProvider({ CLOUDFLARE_ACCOUNT_ID: 'not-an-account-id' }, fetchMock);
    const result = await provider.generate(makeInput());

    expect(result.status).toBe('ERROR');
    if (result.status !== 'GENERATED') expect(result.errorCode).toBe('AI_NOT_CONFIGURED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends multipart input_image_0 with the prompt and parses a valid base64 image response', async () => {
    const generatedJpeg = jpegFixture(32, 24);
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      success: true,
      result: { image: Buffer.from(generatedJpeg).toString('base64') },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const provider = new CloudflareFluxProvider(env, fetchMock);
    const result = await provider.generate(makeInput());
    const [url, init] = fetchMock.mock.calls[0];
    const form = init?.body as FormData;
    const inputImage = form.get('input_image_0') as File;

    expect(result.status).toBe('GENERATED');
    if (result.status === 'GENERATED') {
      expect(result.providerId).toBe('cloudflare-flux-2-klein-9b');
      expect(result.imageUrl).toMatch(/^data:image\/jpeg;base64,/);
    }
    expect(url).toBe(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${CLOUDFLARE_FLUX_MODEL}`);
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${env.CLOUDFLARE_API_TOKEN}`);
    expect(new Headers(init?.headers).has('content-type')).toBe(false);
    expect(form.get('prompt')).toBe(makeInput().prompt);
    expect(form.get('width')).toBe('1024');
    expect(form.get('height')).toBe('575');
    expect(inputImage.name).toBe('storefront.jpg');
    expect(inputImage.type).toBe('image/jpeg');
    expect(new Uint8Array(await inputImage.arrayBuffer())).toEqual(makeInput().image.bytes);
  });

  it('keeps output dimensions within the model range for an extreme panorama', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      success: true,
      result: { image: Buffer.from(jpegFixture(32, 24)).toString('base64') },
    }), { status: 200 }));
    const input = makeInput();
    input.image = { ...input.image, bytes: jpegFixture(511, 1), width: 511, height: 1 };

    await new CloudflareFluxProvider(env, fetchMock).generate(input);
    const form = fetchMock.mock.calls[0][1]?.body as FormData;
    expect(Number(form.get('width'))).toBeGreaterThanOrEqual(256);
    expect(Number(form.get('width'))).toBeLessThanOrEqual(1_920);
    expect(Number(form.get('height'))).toBeGreaterThanOrEqual(256);
    expect(Number(form.get('height'))).toBeLessThanOrEqual(1_920);
    expect(form.get('width')).toBe('1920');
    expect(form.get('height')).toBe('256');
  });

  it('maps Cloudflare rate limits, exhausted credits and authentication failures to safe errors', async () => {
    const rateLimitedFetch = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ success: false, errors: [{ message: 'Too many requests' }] }), { status: 429 }));
    const rateLimited = await new CloudflareFluxProvider(env, rateLimitedFetch).generate(makeInput());
    expect(rateLimited.status).toBe('ERROR');
    if (rateLimited.status !== 'GENERATED') expect(rateLimited.errorCode).toBe('AI_RATE_LIMITED');

    const creditsFetch = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ success: false, errors: [{ message: 'Insufficient credits for this request' }] }), { status: 400 }));
    const credits = await new CloudflareFluxProvider(env, creditsFetch).generate(makeInput());
    expect(credits.status).toBe('ERROR');
    if (credits.status !== 'GENERATED') expect(credits.errorCode).toBe('AI_CREDITS_EXHAUSTED');

    const authFetch = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ success: false, errors: [{ message: 'Not authorized' }] }), { status: 403 }));
    const auth = await new CloudflareFluxProvider(env, authFetch).generate(makeInput());
    expect(auth.status).toBe('ERROR');
    if (auth.status !== 'GENERATED') expect(auth.errorCode).toBe('AI_AUTHENTICATION');
  });

  it('handles provider timeout and network failure without returning an image', async () => {
    const timeoutFetch: typeof fetch = (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    });
    const timeout = await new CloudflareFluxProvider(env, timeoutFetch, 5).generate(makeInput());
    expect(timeout.status).toBe('ERROR');
    if (timeout.status !== 'GENERATED') expect(timeout.errorCode).toBe('AI_TIMEOUT');
    expect(timeout).not.toHaveProperty('imageUrl');

    const failingFetch: typeof fetch = async () => { throw new TypeError('network failure'); };
    const failure = await new CloudflareFluxProvider(env, failingFetch, 50).generate(makeInput());
    expect(failure.status).toBe('ERROR');
    if (failure.status !== 'GENERATED') expect(failure.errorCode).toBe('AI_PROVIDER_UNAVAILABLE');
    expect(failure).not.toHaveProperty('imageUrl');
  });

  it('rejects malformed base64 or non-image provider output instead of fabricating a result', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ success: true, result: { image: Buffer.from('not an image').toString('base64') } }), { status: 200 }));
    const result = await new CloudflareFluxProvider(env, fetchMock).generate(makeInput());
    expect(result.status).toBe('ERROR');
    if (result.status !== 'GENERATED') expect(result.errorCode).toBe('AI_INVALID_RESPONSE');
    expect(result).not.toHaveProperty('imageUrl');
  });
});
