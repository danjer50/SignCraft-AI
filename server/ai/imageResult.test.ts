// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { bytesToBase64, decodeProviderBase64Image, decodeProviderDataUrlImage, isUnchangedSource } from './imageResult.js';

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0x01, 0x02]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x01, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);

describe('provider image honesty and validation', () => {
  it.each([['JPEG', jpeg], ['PNG', png], ['WebP', webp]] as const)('recognizes an exact %s source echo after base64 decoding', (_name, source) => {
    const base64 = bytesToBase64(source);
    // Different padding/whitespace must not disguise the same bytes as an edit.
    const decoded = decodeProviderBase64Image(`  ${base64.replace(/=+$/, '')}  `);
    expect(decoded).not.toBeNull();
    expect(isUnchangedSource(decoded!, source)).toBe(true);
  });

  it('compares only the source view actually uploaded, not its surrounding ArrayBuffer', () => {
    const backing = new Uint8Array([0x00, ...jpeg, 0x00]);
    const source = backing.subarray(1, backing.length - 1);
    const decoded = decodeProviderBase64Image(bytesToBase64(jpeg))!;
    expect(isUnchangedSource(decoded, source)).toBe(true);
    expect(isUnchangedSource(decoded, backing)).toBe(false);
  });

  it('allows different bytes and leaves re-encoded copies to the browser guard', () => {
    const changed = jpeg.slice();
    changed[changed.length - 1] = 0x03;
    const decoded = decodeProviderBase64Image(bytesToBase64(changed))!;
    expect(isUnchangedSource(decoded, jpeg)).toBe(false);
    expect(isUnchangedSource(decoded, jpeg.subarray(0, jpeg.length - 1))).toBe(false);
  });

  it('still rejects malformed, non-image, mislabeled and oversized provider output', () => {
    for (const base64 of ['', 'A', '%%%not-base64%%%', btoa('not an image')]) {
      expect(decodeProviderBase64Image(base64)).toBeNull();
    }
    expect(decodeProviderBase64Image('A'.repeat(16 * 1024 * 1024 + 12))).toBeNull();
    expect(decodeProviderDataUrlImage(`data:image/png;base64,${bytesToBase64(jpeg)}`)).toBeNull();
    expect(decodeProviderDataUrlImage('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toBeNull();
    expect(decodeProviderDataUrlImage('https://example.invalid/render.png')).toBeNull();
  });
});
