import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SIGN_CONFIGURATION } from '../../domain/sign';

// Force the API path and skip real canvas resizing: this suite covers failure recovery.
vi.mock('../config', () => ({
  clientConfig: { aiMode: 'api', quoteMode: 'local', siteUrl: '', whatsappNumber: '' },
}));

vi.mock('./imagePreparation', () => ({
  prepareCloudflareReferenceImage: vi.fn(async () => new File(['prepared'], 'storefront.jpg', { type: 'image/jpeg' })),
}));

import { AI_REQUEST_TIMEOUT_MS, generateStorefrontConcept } from './client';
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
