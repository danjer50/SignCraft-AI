// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DEFAULT_SIGN_CONFIGURATION } from '../../src/domain/sign';
import type { AIEnvironment } from '../ai/types';
import { onRequest } from '../../functions/api/ai/generate-sign';

function jpegFixture(): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08,
    0x00, 0x18, 0x00, 0x20, 0x03,
    0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    0xff, 0xd9,
  ]);
}

function request(): Request {
  const form = new FormData();
  form.append('storefrontImage', new File([jpegFixture()], 'storefront.jpg', { type: 'image/jpeg' }));
  form.append('configuration', JSON.stringify({
    ...DEFAULT_SIGN_CONFIGURATION,
    businessName: 'Atelier Sable',
    exactText: 'ATELIER SABLE',
  }));
  return new Request('https://signcraft.example/api/ai/generate-sign', { method: 'POST', body: form });
}

describe('Cloudflare Pages /api/ai/generate-sign route', () => {
  it('uses the shared handler and returns a clear missing-provider-configuration response', async () => {
    const env: AIEnvironment = { AI_PROVIDER: 'cloudflare-flux' };
    const response = await onRequest({ request: request(), env });
    const body = await response.json() as { status: string; code: string };
    expect(response.status).toBe(503);
    expect(body.status).toBe('ERROR');
    expect(body.code).toBe('AI_NOT_CONFIGURED');
  });

  it('rejects non-POST calls at the route boundary', async () => {
    const response = await onRequest({ request: new Request('https://signcraft.example/api/ai/generate-sign'), env: {} });
    expect(response.status).toBe(405);
  });
});
