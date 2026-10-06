// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SIGN_CONFIGURATION, type QuoteRequest, type SignConfiguration } from '../../src/domain/sign';
import { handleAiGeneration } from './ai';
import { handleQuoteSubmission } from './quotes';

function jpegFixture(width = 32, height = 24): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    0xff, 0xd9,
  ]);
}

function makeAiRequest(file: File, configurationOverrides: Partial<SignConfiguration> = {}): Request {
  const form = new FormData();
  form.append('storefrontImage', file, file.name);
  form.append('configuration', JSON.stringify({
    ...DEFAULT_SIGN_CONFIGURATION,
    businessName: 'Atelier Sable',
    exactText: '  ATELIER SABLE · حرف  ',
    notes: 'Keep the stone arch untouched.',
    ...configurationOverrides,
  }));
  return new Request('https://signcraft.example/api/ai/generate-sign', { method: 'POST', body: form });
}

const validQuote: QuoteRequest = {
  id: 'q-server-test',
  createdAt: new Date().toISOString(),
  status: 'NEW',
  deliveryState: 'LOCAL_DRAFT',
  customer: { name: 'Sami Ben Ali', email: 'sami@example.com', phone: '+216 20 000 000' },
  business: { name: 'Atelier Sable', category: 'retail' },
  signConfiguration: { ...DEFAULT_SIGN_CONFIGURATION, businessName: 'Atelier Sable', exactText: 'ATELIER SABLE' },
  imageReference: null,
  conceptReference: { status: 'NOT_GENERATED', providerId: 'none' },
};

const tinyPng = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x10,
]);

describe('server API safety defaults', () => {
  it('keeps demo mode unavailable and never fabricates an image', async () => {
    const image = new File([jpegFixture()], 'front.jpg', { type: 'image/jpeg' });
    const response = await handleAiGeneration(makeAiRequest(image), { AI_PROVIDER: 'demo' });
    const body = await response.json() as { status: string; message: string; imageUrl?: string };

    expect(response.status).toBe(503);
    expect(body.status).toBe('UNAVAILABLE');
    expect(body.message).toMatch(/has not been edited/i);
    expect(body).not.toHaveProperty('imageUrl');
  });

  it('rejects unsupported image formats on the server as well as in the browser', async () => {
    const image = new File(['svg'], 'front.svg', { type: 'image/svg+xml' });
    const response = await handleAiGeneration(makeAiRequest(image));
    expect(response.status).toBe(415);
    expect((await response.json()).code).toBe('UNSUPPORTED_IMAGE');
  });

  it('rejects an image whose declared MIME type does not match its bytes', async () => {
    const image = new File(['not really a jpeg'], 'front.jpg', { type: 'image/jpeg' });
    const response = await handleAiGeneration(makeAiRequest(image), { AI_PROVIDER: 'demo' });
    expect(response.status).toBe(415);
    expect((await response.json()).code).toBe('INVALID_IMAGE_CONTENT');
  });

  it('rejects oversized and above-model-limit image dimensions before provider use', async () => {
    const oversized = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.jpg', { type: 'image/jpeg' });
    const sizeResponse = await handleAiGeneration(makeAiRequest(oversized));
    expect(sizeResponse.status).toBe(413);
    expect((await sizeResponse.json()).code).toBe('IMAGE_SIZE');

    const tooWide = new File([jpegFixture(512, 300)], 'too-wide.jpg', { type: 'image/jpeg' });
    const dimensionResponse = await handleAiGeneration(makeAiRequest(tooWide));
    expect(dimensionResponse.status).toBe(413);
    expect((await dimensionResponse.json()).code).toBe('IMAGE_DIMENSIONS');
  });

  it('rejects invalid optional dimensions before contacting a provider', async () => {
    const image = new File([jpegFixture()], 'front.jpg', { type: 'image/jpeg' });
    const response = await handleAiGeneration(makeAiRequest(image, { widthCm: '0' }), { AI_PROVIDER: 'cloudflare-flux' });

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('INVALID_CONFIGURATION');
  });

  it('reports missing Cloudflare credentials without attempting an upstream request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    try {
      const image = new File([jpegFixture()], 'front.jpg', { type: 'image/jpeg' });
      const response = await handleAiGeneration(makeAiRequest(image), { AI_PROVIDER: 'cloudflare-flux' });
      const body = await response.json() as { status: string; code: string };
      expect(response.status).toBe(503);
      expect(body.status).toBe('ERROR');
      expect(body.code).toBe('AI_NOT_CONFIGURED');
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('parses a mocked Cloudflare image response and preserves exact text as structured prompt data', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ success: true, result: { image: Buffer.from(tinyPng).toString('base64') } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const image = new File([jpegFixture(511, 287)], 'front.jpg', { type: 'image/jpeg' });
      const response = await handleAiGeneration(makeAiRequest(image), {
        AI_PROVIDER: 'cloudflare-flux',
        CLOUDFLARE_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
        CLOUDFLARE_API_TOKEN: 'test-only-token-never-real',
      });
      const body = await response.json() as { status: string; providerId: string; imageUrl: string; promptVersion: string };
      const [url, init] = fetchMock.mock.calls[0];
      const upstreamForm = init?.body as FormData;
      const prompt = upstreamForm.get('prompt');

      expect(response.status).toBe(200);
      expect(body.status).toBe('GENERATED');
      expect(body.providerId).toBe('cloudflare-flux-2-klein-9b');
      expect(body.imageUrl).toMatch(/^data:image\/png;base64,/);
      expect(body.promptVersion).toBe('storefront-inpaint-v2');
      expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/0123456789abcdef0123456789abcdef/ai/run/@cf/black-forest-labs/flux-2-klein-9b');
      expect(prompt).toContain('ATELIER SABLE · حرف');
      expect(prompt).toContain('Keep the stone arch untouched.');
      expect(upstreamForm.get('input_image_0')).toBeInstanceOf(Blob);
      expect(upstreamForm.get('width')).toBe('1024');
      expect(upstreamForm.get('height')).toBe('575');
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-only-token-never-real');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects a spoofed MIME type for an attached quote image', async () => {
    const form = new FormData();
    form.append('quote', JSON.stringify(validQuote));
    form.append('storefrontImage', new File(['not really a jpeg'], 'front.jpg', { type: 'image/jpeg' }));
    const response = await handleQuoteSubmission(new Request('https://signcraft.example/api/quotes', { method: 'POST', body: form }));
    expect(response.status).toBe(415);
    expect((await response.json()).code).toBe('INVALID_IMAGE_CONTENT');
  });

  it('does not claim a quote was delivered when no secure repository exists', async () => {
    const form = new FormData();
    form.append('quote', JSON.stringify(validQuote));
    const response = await handleQuoteSubmission(new Request('https://signcraft.example/api/quotes', { method: 'POST', body: form }));
    const body = await response.json() as { status: string; code: string; message: string };

    expect(response.status).toBe(503);
    expect(body.status).toBe('UNAVAILABLE');
    expect(body.code).toBe('QUOTE_DELIVERY_NOT_CONFIGURED');
    expect(body.message).toMatch(/was not sent/i);
  });
});
