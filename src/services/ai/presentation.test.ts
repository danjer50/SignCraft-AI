import { describe, expect, it } from 'vitest';
import { photoPrivacyMessageKey } from './presentation';
import type { AIConceptResult } from '../../domain/sign';

const generated: AIConceptResult = {
  status: 'GENERATED',
  providerId: 'cloudflare-flux-2-klein-9b',
  imageUrl: 'data:image/png;base64,AA==',
  createdAt: new Date().toISOString(),
  promptVersion: 'storefront-inpaint-v2',
  sourceImageTransfer: 'SENT_TO_SERVER',
};

describe('photo privacy messaging state', () => {
  it('distinguishes local, submitted, processed and unconfirmed photos', () => {
    expect(photoPrivacyMessageKey(null, 'demo', 'local')).toBe('studio.photoLocalNotice');
    expect(photoPrivacyMessageKey(generated, 'api', 'local')).toBe('studio.photoProcessedNotice');
    expect(photoPrivacyMessageKey({
      status: 'ERROR', providerId: 'api', errorCode: 'AI_PROVIDER_UNAVAILABLE', message: 'failed',
      createdAt: new Date().toISOString(), sourceImageTransfer: 'SENT_TO_SERVER',
    }, 'api', 'local')).toBe('studio.photoSentNotice');
    expect(photoPrivacyMessageKey({
      status: 'ERROR', providerId: 'api', errorCode: 'AI_NOT_CONFIGURED', message: 'not configured',
      createdAt: new Date().toISOString(), sourceImageTransfer: 'SENT_TO_SERVER',
    }, 'api', 'local')).toBe('studio.photoNotForwardedNotice');
    expect(photoPrivacyMessageKey({
      status: 'ERROR', providerId: 'api', errorCode: 'AI_NETWORK_ERROR', message: 'unknown',
      createdAt: new Date().toISOString(), sourceImageTransfer: 'UNKNOWN',
    }, 'api', 'local')).toBe('studio.photoUnknownNotice');
  });

  it('explains quote-only and combined API transfer modes before submission', () => {
    expect(photoPrivacyMessageKey(null, 'demo', 'api')).toBe('studio.photoQuoteApiNotice');
    expect(photoPrivacyMessageKey(null, 'api', 'api')).toBe('studio.photoBothApiNotice');
    expect(photoPrivacyMessageKey({
      status: 'ERROR', providerId: 'client', errorCode: 'AI_IMAGE_PREPARATION', message: 'local',
      createdAt: new Date().toISOString(), sourceImageTransfer: 'LOCAL_ONLY',
    }, 'api', 'local')).toBe('studio.photoPreparationLocalNotice');
  });
});
