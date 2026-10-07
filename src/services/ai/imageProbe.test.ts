import { describe, expect, it, vi } from 'vitest';
import {
  HEADER_PROBE_BYTES,
  orientedImageSize,
  parseImageHeader,
  readImageHeader,
} from './imageProbe';
import {
  jpegBytes,
  jpegBytesWithBigEndianExif,
  jpegBytesWithoutFrameHeader,
  jpegFile,
  pngBytes,
  webpVp8Bytes,
  webpVp8lBytes,
  webpVp8xBytes,
} from '../../test/imageBytes';

describe('image header probe', () => {
  describe('JPEG', () => {
    it('reads the stored dimensions from the SOF frame header', () => {
      expect(parseImageHeader(jpegBytes(4032, 3024))).toEqual({ format: 'jpeg', width: 4032, height: 3024, orientation: 1 });
    });

    it('reads the EXIF orientation from a little-endian APP1 block', () => {
      const header = parseImageHeader(jpegBytes(4032, 3024, 6));
      expect(header).toMatchObject({ format: 'jpeg', width: 4032, height: 3024, orientation: 6 });
    });

    it('reads the EXIF orientation from a big-endian APP1 block', () => {
      const header = parseImageHeader(jpegBytesWithBigEndianExif(3000, 2000, 8));
      expect(header).toMatchObject({ width: 3000, height: 2000, orientation: 8 });
    });

    it('falls back to orientation 1 when the EXIF orientation value is out of range', () => {
      expect(parseImageHeader(jpegBytes(800, 600, 1))?.orientation).toBe(1);
      expect(parseImageHeader(jpegBytesWithBigEndianExif(800, 600, 12))?.orientation).toBe(1);
    });

    it('returns null when no SOF frame header is present', () => {
      expect(parseImageHeader(jpegBytesWithoutFrameHeader())).toBeNull();
    });
  });

  describe('PNG', () => {
    it('reads the IHDR dimensions', () => {
      expect(parseImageHeader(pngBytes(1200, 900))).toEqual({ format: 'png', width: 1200, height: 900, orientation: 1 });
    });

    it('rejects a file whose IHDR chunk is not where it must be', () => {
      const corrupted = pngBytes(1200, 900);
      corrupted[12] = 0x00;
      expect(parseImageHeader(corrupted)).toBeNull();
    });
  });

  describe('WebP', () => {
    it('reads VP8X (extended) dimensions', () => {
      expect(parseImageHeader(webpVp8xBytes(1600, 1200))).toEqual({ format: 'webp', width: 1600, height: 1200, orientation: 1 });
    });

    it('reads VP8 (lossy) dimensions', () => {
      expect(parseImageHeader(webpVp8Bytes(1024, 768))).toEqual({ format: 'webp', width: 1024, height: 768, orientation: 1 });
    });

    it('reads VP8L (lossless) dimensions', () => {
      expect(parseImageHeader(webpVp8lBytes(640, 480))).toEqual({ format: 'webp', width: 640, height: 480, orientation: 1 });
    });

    it('rejects a RIFF file that is not WebP', () => {
      const bytes = new Uint8Array(32);
      bytes.set([0x52, 0x49, 0x46, 0x46], 0);
      bytes.set([0x57, 0x41, 0x56, 0x45], 8);
      expect(parseImageHeader(bytes)).toBeNull();
    });
  });

  describe('resilience', () => {
    it('never throws on unsupported, truncated or empty input', () => {
      expect(parseImageHeader(new Uint8Array(0))).toBeNull();
      expect(parseImageHeader(new TextEncoder().encode('this is not an image at all'))).toBeNull();
      expect(parseImageHeader(jpegBytes(100, 100).subarray(0, 5))).toBeNull();
      expect(parseImageHeader(pngBytes(100, 100).subarray(0, 20))).toBeNull();
      expect(parseImageHeader(webpVp8xBytes(100, 100).subarray(0, 20))).toBeNull();
    });

    it('reads a header from a File without decoding pixels', async () => {
      expect(await readImageHeader(jpegFile(2048, 1536))).toMatchObject({ format: 'jpeg', width: 2048, height: 1536 });
    });

    it('resolves null instead of throwing when the file cannot be read', async () => {
      const broken = { slice: () => { throw new Error('read error'); } } as unknown as File;
      expect(await readImageHeader(broken)).toBeNull();

      const rejected = {
        slice: () => ({ arrayBuffer: () => Promise.reject(new Error('io error')), size: 10 }),
      } as unknown as File;
      expect(await readImageHeader(rejected)).toBeNull();
    });

    it('probes only a bounded slice of the file', async () => {
      const source = jpegFile(4000, 3000);
      const slice = vi.spyOn(source, 'slice');
      await readImageHeader(source);
      expect(slice).toHaveBeenCalledWith(0, HEADER_PROBE_BYTES);
      expect(HEADER_PROBE_BYTES).toBe(64 * 1024);
    });

    it('returns null when the frame header sits beyond the probe window', async () => {
      const padding = new Uint8Array(HEADER_PROBE_BYTES);
      padding.set([0xff, 0xd8], 0);
      padding.set([0xff, 0xe0, 0xff, 0xff], 2);
      const beyond = new File([padding as BlobPart, jpegBytes(4000, 3000) as BlobPart], 'late.jpg', { type: 'image/jpeg' });
      expect(await readImageHeader(beyond)).toBeNull();
    });
  });

  describe('orientedImageSize', () => {
    it('keeps stored dimensions for orientations that do not rotate', () => {
      expect(orientedImageSize({ format: 'jpeg', width: 4032, height: 3024, orientation: 1 })).toEqual({ width: 4032, height: 3024 });
      expect(orientedImageSize({ format: 'jpeg', width: 4032, height: 3024, orientation: 3 })).toEqual({ width: 4032, height: 3024 });
    });

    it('swaps width and height for the rotated orientations 5-8', () => {
      expect(orientedImageSize({ format: 'jpeg', width: 4032, height: 3024, orientation: 6 })).toEqual({ width: 3024, height: 4032 });
      expect(orientedImageSize({ format: 'jpeg', width: 4032, height: 3024, orientation: 8 })).toEqual({ width: 3024, height: 4032 });
    });
  });
});
