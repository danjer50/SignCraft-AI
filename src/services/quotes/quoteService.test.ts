import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuoteRequest } from '../../domain/sign';
import { getLocalQuoteRequests, saveLocalQuoteRequest, submitQuoteRequest, updateLocalQuoteStatus } from './quoteService';

const sampleRequest: QuoteRequest = {
  id: 'quote-test-01',
  createdAt: '2026-10-06T12:00:00.000Z',
  status: 'NEW',
  deliveryState: 'LOCAL_DRAFT',
  customer: { name: 'Sami Ben Ali', email: 'sami@example.com', phone: '+216 20 000 000' },
  business: { name: 'Atelier Sable', category: 'retail' },
  signConfiguration: {
    businessName: 'Atelier Sable',
    category: 'retail',
    signType: 'threeD',
    style: 'modern',
    materials: ['stainlessSteel', 'ledModules'],
    color: '#24463f',
    lighting: 'halo',
    exactText: 'ATELIER SABLE',
    widthCm: '120',
    heightCm: '60',
    notes: 'Keep the stone facade unchanged.',
    signArea: null,
    replaceExistingSurface: false,
  },
  imageReference: { fileName: 'facade.jpg', mimeType: 'image/jpeg', sizeBytes: 1024, transferState: 'LOCAL_ONLY' },
  conceptReference: { status: 'UNAVAILABLE', providerId: 'demo-unconfigured', message: 'No provider configured.' },
};

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('quote request demo flow', () => {
  it('stores an explicit local draft with customer, business, sign, image and concept data', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await submitQuoteRequest(sampleRequest, null, 'local');

    expect(result).toEqual({ state: 'LOCAL_DRAFT', requestId: sampleRequest.id, reason: 'LOCAL_DEMO' });
    expect(fetchSpy).not.toHaveBeenCalled();
    const stored = getLocalQuoteRequests()[0];
    expect(stored.customer.email).toBe('sami@example.com');
    expect(stored.business.name).toBe('Atelier Sable');
    expect(stored.signConfiguration.exactText).toBe('ATELIER SABLE');
    expect(stored.imageReference?.fileName).toBe('facade.jpg');
    expect(stored.conceptReference.status).toBe('UNAVAILABLE');
    expect(stored.deliveryState).toBe('LOCAL_DRAFT');
  });

  it('updates the demo admin status without claiming the request was sent', () => {
    expect(saveLocalQuoteRequest(sampleRequest)).toBe(true);
    expect(updateLocalQuoteStatus(sampleRequest.id, 'QUOTED')).toBe(true);
    const stored = getLocalQuoteRequests()[0];
    expect(stored.status).toBe('QUOTED');
    expect(stored.deliveryState).toBe('LOCAL_DRAFT');
  });

  it('falls back to a local draft when an API does not confirm delivery', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      status: 'UNAVAILABLE',
      code: 'QUOTE_DELIVERY_NOT_CONFIGURED',
    }), { status: 503, headers: { 'content-type': 'application/json' } }));

    const result = await submitQuoteRequest(sampleRequest, null, 'api');
    expect(result.state).toBe('LOCAL_DRAFT');
    if (result.state === 'LOCAL_DRAFT') expect(result.reason).toBe('DELIVERY_UNAVAILABLE');
    expect(getLocalQuoteRequests()[0].deliveryState).toBe('LOCAL_DRAFT');
  });
});
