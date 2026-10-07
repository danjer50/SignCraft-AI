import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SIGN_CONFIGURATION } from '../../domain/sign';

// Force the API path and skip real canvas resizing: this suite covers failure recovery.
vi.mock('../config', () => ({
  clientConfig: { aiMode: 'api', quoteMode: 'local', siteUrl: '', whatsappNumber: '' },
}));

vi.mock('./imagePreparation', () => ({
  prepareCloudflareReferenceImage: vi.fn(async () => new File(['prepared'], 'storefront.jpg', { type: 'image/jpeg' })),
}));

vi.mock('./renderComparison', () => ({ isUnchangedRender: vi.fn(async () => false) }));

import { AI_REQUEST_TIMEOUT_MS, generateStorefrontConcept } from './client';
import { isUnchangedRender } from './renderComparison';
import { prepareCloudflareReferenceImage } from './imagePreparation';

const configuration = {
  ...DEFAULT_SIGN_CONFIGURATION,
  businessName: 'Atelier Sable',
  exactText: 'ATELIER SABLE',
  materials: ['acrylic', 'ledModules'] as typeof DEFAULT_SIGN_CONFIGURATION.materials,
};
const sourceImage = new File(['facade'], 'facade.jpg', { type: 'image/jpeg' });

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function mockFetch(implementation: typeof fetch) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(implementation);
}

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('AI client failure recovery in API mode', () => {
  it('accepts only a provider-confirmed data URL as a generated concept', async () => {
    const fetchMock = mockFetch(async () => jsonResponse({
      status: 'GENERATED',
      providerId: 'cloudflare-flux-2-klein-9b',
      imageUrl: 'data:image/png;base64,iVBORw0KGgo=',
      promptVersion: 'storefront-inpaint-v3',
    }));

    const result = await generateStorefrontConcept({ sourceImage, configuration });

    expect(result.status).toBe('GENERATED');
    if (result.status === 'GENERATED') {
      expect(result.imageUrl).toBe('data:image/png;base64,iVBORw0KGgo=');
      expect(result.sourceImageTransfer).toBe('SENT_TO_SERVER');
    }
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/ai/generate-sign');
    expect((init?.body as FormData).get('configuration')).toContain('"materials":["acrylic","ledModules"]');
  });

  it('turns a visually unchanged response into an honest failure before storing GENERATED', async () => {
    const imageUrl = 'data:image/png;base64,iVBORw0KGgo=';
    const fetchMock = mockFetch(async () => jsonResponse({ status: 'GENERATED', providerId: 'gemini', imageUrl }));
    vi.mocked(isUnchangedRender).mockResolvedValueOnce(true);

    const result = await generateStorefrontConcept({ sourceImage, configuration });

    expect(result).toMatchObject({ status: 'ERROR', errorCode: 'AI_UNCHANGED_IMAGE', providerId: 'gemini', sourceImageTransfer: 'SENT_TO_SERVER' });
    expect(result).not.toHaveProperty('imageUrl');
    expect(isUnchangedRender).toHaveBeenCalledWith(await vi.mocked(prepareCloudflareReferenceImage).mock.results[0].value, imageUrl);
    // Do not spend another generation request on a browser-side rejection.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('preserves the server unchanged-image error and never invents a render', async () => {
    mockFetch(async () => jsonResponse({
      status: 'ERROR', code: 'AI_UNCHANGED_IMAGE', providerId: 'gemini',
      message: 'Gemini returned the source photo unchanged. No concept was created.',
    }, 502));
    const result = await generateStorefrontConcept({ sourceImage, configuration });

    expect(result).toMatchObject({ status: 'ERROR', errorCode: 'AI_UNCHANGED_IMAGE', sourceImageTransfer: 'SENT_TO_SERVER' });
    expect(result).not.toHaveProperty('imageUrl');
    expect(isUnchangedRender).not.toHaveBeenCalled();
  });

  it('refuses a generated status that carries an unsafe image reference', async () => {
    mockFetch(async () => jsonResponse({
      status: 'GENERATED',
      providerId: 'server-ai',
      imageUrl: 'https://evil.example/render.png',
    }));

    const result = await generateStorefrontConcept({ sourceImage, configuration });

    expect(result.status).toBe('ERROR');
    if (result.status === 'ERROR') {
      expect(result.errorCode).toBe('AI_REQUEST_REJECTED');
      expect(result).not.toHaveProperty('imageUrl');
    }
    expect(isUnchangedRender).not.toHaveBeenCalled();
  });

  it('maps a server error code onto a localized, retryable failure', async () => {
    mockFetch(async () => jsonResponse({
      status: 'ERROR',
      code: 'AI_CREDITS_EXHAUSTED',
      providerId: 'cloudflare-flux-2-klein-9b',
      message: 'Cloudflare Workers AI cannot process this request right now.',
    }, 503));

    const result = await generateStorefrontConcept({ sourceImage, configuration });

    expect(result.status).toBe('ERROR');
    if (result.status === 'ERROR') {
      expect(result.errorCode).toBe('AI_CREDITS_EXHAUSTED');
      expect(result.sourceImageTransfer).toBe('SENT_TO_SERVER');
    }
  });

  it('reports an unconfigured server plainly, instead of blaming demo mode', async () => {
    mockFetch(async () => jsonResponse({
      status: 'UNAVAILABLE',
      code: 'AI_NOT_CONFIGURED',
      providerId: 'demo-unconfigured',
      message: 'No secure image-editing provider is configured. The source storefront has not been edited.',
    }, 503));

    const result = await generateStorefrontConcept({ sourceImage, configuration });

    expect(result.status).toBe('ERROR');
    if (result.status === 'ERROR') {
      expect(result.errorCode).toBe('AI_NOT_CONFIGURED');
      // The photo did reach the server, so the transfer is reported as such — and the result page
      // shows the provider-neutral "no AI provider is configured on the server" message.
      expect(result.sourceImageTransfer).toBe('SENT_TO_SERVER');
    }
  });

  it('reports a timeout as unconfirmed instead of hanging the loading state forever', async () => {
    expect(AI_REQUEST_TIMEOUT_MS).toBeGreaterThan(0);
    mockFetch(async () => {
      throw new DOMException('The operation was aborted.', 'AbortError');
    });

    const result = await generateStorefrontConcept({ sourceImage, configuration });

    expect(result.status).toBe('ERROR');
    if (result.status === 'ERROR') {
      expect(result.errorCode).toBe('AI_TIMEOUT');
      expect(result.sourceImageTransfer).toBe('UNKNOWN');
    }
  });

  it('treats a dropped connection as unconfirmed, never as a successful render', async () => {
    mockFetch(async () => {
      throw new TypeError('Failed to fetch');
    });

    const result = await generateStorefrontConcept({ sourceImage, configuration });

    expect(result.status).toBe('ERROR');
    if (result.status === 'ERROR') {
      expect(result.errorCode).toBe('AI_NETWORK_ERROR');
      expect(result.sourceImageTransfer).toBe('UNKNOWN');
    }
  });

  it('keeps the photo local when the resized copy cannot be prepared', async () => {
    const fetchMock = mockFetch(async () => jsonResponse({ status: 'GENERATED' }));
    vi.mocked(prepareCloudflareReferenceImage).mockRejectedValueOnce(new Error('canvas unavailable'));

    const result = await generateStorefrontConcept({ sourceImage, configuration });

    expect(result.status).toBe('ERROR');
    if (result.status === 'ERROR') {
      expect(result.errorCode).toBe('AI_IMAGE_PREPARATION');
      expect(result.sourceImageTransfer).toBe('LOCAL_ONLY');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
