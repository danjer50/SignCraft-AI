// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DEFAULT_SIGN_CONFIGURATION, type QuoteRequest } from '../../src/domain/sign';
import { handleAiGeneration } from './ai';
import { handleQuoteSubmission } from './quotes';

function makeAiRequest(file: File): Request {
  const form = new FormData();
  form.append('storefrontImage', file, file.name);
  form.append('configuration', JSON.stringify({
    ...DEFAULT_SIGN_CONFIGURATION,
    businessName: 'Atelier Sable',
    exactText: 'ATELIER SABLE',
  }));
  return new Request('https://signcraft.example/api/ai/generate', { method: 'POST', body: form });
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

describe('server API safety defaults', () => {
  it('validates and accepts the request shape but reports AI unavailable without a real provider', async () => {
    const image = new File([new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])], 'front.webp', { type: 'image/webp' });
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
