// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readImageDimensions } from './imageDimensions';

function jpegFixture(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
  ]);
}

function webpExtendedFixture(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set(new TextEncoder().encode('RIFF'), 0);
  bytes.set(new TextEncoder().encode('WEBP'), 8);
  bytes.set(new TextEncoder().encode('VP8X'), 12);
  const widthMinusOne = width - 1;
  const heightMinusOne = height - 1;
  bytes[24] = widthMinusOne & 0xff;
  bytes[25] = (widthMinusOne >> 8) & 0xff;
  bytes[26] = (widthMinusOne >> 16) & 0xff;
  bytes[27] = heightMinusOne & 0xff;
  bytes[28] = (heightMinusOne >> 8) & 0xff;
  bytes[29] = (heightMinusOne >> 16) & 0xff;
  return bytes;
}

describe('image header dimension validation', () => {
  it('reads dimensions from PNG, JPEG and WebP headers without decoding image data', () => {
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x01, 0xff, 0x00, 0x00, 0x00, 0xff,
    ]);
    expect(readImageDimensions('image/png', png)).toEqual({ width: 511, height: 255 });
    expect(readImageDimensions('image/jpeg', jpegFixture(511, 255))).toEqual({ width: 511, height: 255 });
    expect(readImageDimensions('image/webp', webpExtendedFixture(511, 255))).toEqual({ width: 511, height: 255 });
  });

  it('returns null for malformed or unsupported dimension headers', () => {
    expect(readImageDimensions('image/png', new Uint8Array(24))).toBeNull();
    expect(readImageDimensions('image/jpeg', new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull();
    expect(readImageDimensions('image/webp', new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBeNull();
  });
});
