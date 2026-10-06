import { describe, expect, it } from 'vitest';
import { ACCEPTED_IMAGE_TYPES, MAX_STOREFRONT_IMAGE_BYTES, validateStorefrontImage, validateStorefrontImageSignature } from './upload';

describe('storefront image validation', () => {
  it('accepts JPEG, PNG and WebP files within the 10 MB limit', () => {
    for (const type of ACCEPTED_IMAGE_TYPES) {
      expect(validateStorefrontImage({ type, size: 256_000 })).toBeNull();
    }
  });

  it('rejects SVGs and other unsupported formats', () => {
    expect(validateStorefrontImage({ type: 'image/svg+xml', size: 500 })).toBe('unsupported-type');
    expect(validateStorefrontImage({ type: 'image/gif', size: 500 })).toBe('unsupported-type');
  });

  it('rejects empty files and files over the configured limit', () => {
    expect(validateStorefrontImage({ type: 'image/jpeg', size: 0 })).toBe('empty-file');
    expect(validateStorefrontImage({ type: 'image/jpeg', size: MAX_STOREFRONT_IMAGE_BYTES + 1 })).toBe('too-large');
  });

  it('checks image magic bytes instead of trusting the declared MIME type', async () => {
    const jpeg = new File([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], 'front.jpg', { type: 'image/jpeg' });
    const spoofed = new File(['plain text'], 'front.jpg', { type: 'image/jpeg' });
    expect(await validateStorefrontImageSignature(jpeg)).toBe(true);
    expect(await validateStorefrontImageSignature(spoofed)).toBe(false);
  });
});
