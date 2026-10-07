/**
 * Minimal, dependency-free image header probe (JPEG / PNG / WebP).
 *
 * SignCraft needs two things before it decodes a storefront photo:
 *
 * 1. The real pixel dimensions, so a resize cap can be applied to the *longest* side. `resizeWidth`
 *    alone under-caps portrait photos, which are the majority of phone photos.
 * 2. The EXIF orientation, so the cap is applied to the side that is actually longest once the
 *    browser has rotated the photo for display.
 *
 * Reading a few header bytes is essentially free (a slice of the file, no pixel decode), so it can
 * never fail preparation on its own: every function here is total and returns `null` rather than
 * throwing. The probe is a *hint* only — image preparation always has a path that works without it.
 */

export type ImageFormat = 'jpeg' | 'png' | 'webp';

export interface ImageHeader {
  format: ImageFormat;
  /** Stored (pre-orientation) pixel dimensions. */
  width: number;
  height: number;
  /** EXIF orientation 1-8; 1 when absent, unreadable or not applicable. */
  orientation: number;
}

/** Enough for every marker and EXIF block that matters, while staying a trivial slice. */
export const HEADER_PROBE_BYTES = 64 * 1024;

const EXIF_ORIENTATIONS = new Set([1, 2, 3, 4, 5, 6, 7, 8]);

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= 65_535;
}

function u16be(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function u32be(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function u16le(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function u32le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

/**
 * Locate the EXIF orientation tag (TIFF IFD0 entry 0x0112). Walks the JPEG marker chain for the
 * APP1/"Exif" segment, then reads IFD0 with the declared byte order. Returns 1 when anything is
 * missing or malformed.
 */
function readExifOrientation(bytes: Uint8Array): number {
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break;
    const length = u16be(bytes, offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) break;
    const dataStart = offset + 4;
    if (marker === 0xe1 && startsWith(bytes, [0x45, 0x78, 0x69, 0x66, 0x00, 0x00], dataStart)) {
      const tiff = dataStart + 6;
      if (tiff + 8 > bytes.length) return 1;
      const littleEndian = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
      const bigEndian = bytes[tiff] === 0x4d && bytes[tiff + 1] === 0x4d;
      if (!littleEndian && !bigEndian) return 1;
      const readU16 = (at: number) => (littleEndian ? u16le(bytes, at) : u16be(bytes, at));
      const readU32 = (at: number) => (littleEndian ? u32le(bytes, at) : u32be(bytes, at));
      const ifdOffset = readU32(tiff + 4);
      const ifd = tiff + ifdOffset;
      if (ifd + 2 > bytes.length) return 1;
      const entries = readU16(ifd);
      for (let index = 0; index < entries; index += 1) {
        const entry = ifd + 2 + index * 12;
        if (entry + 12 > bytes.length) break;
        if (readU16(entry) !== 0x0112) continue;
        const value = readU16(entry + 8);
        return EXIF_ORIENTATIONS.has(value) ? value : 1;
      }
      return 1;
    }
    offset += 2 + length;
  }
  return 1;
}

function parseJpeg(bytes: Uint8Array): ImageHeader | null {
  if (!startsWith(bytes, [0xff, 0xd8])) return null;
  let offset = 2;
  while (offset + 9 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break;
    const length = u16be(bytes, offset + 2);
    if (length < 2) break;
    // SOF0-SOF15 carry the frame size; DHT (0xC4), JPG (0xC8) and DAC (0xCC) do not.
    const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isStartOfFrame) {
      const height = u16be(bytes, offset + 5);
      const width = u16be(bytes, offset + 7);
      if (!isPositiveInteger(width) || !isPositiveInteger(height)) return null;
      return { format: 'jpeg', width, height, orientation: readExifOrientation(bytes) };
    }
    offset += 2 + length;
  }
  return null;
}

function parsePng(bytes: Uint8Array): ImageHeader | null {
  if (!startsWith(bytes, PNG_SIGNATURE) || bytes.length < 24) return null;
  if (!startsWith(bytes, [0x49, 0x48, 0x44, 0x52], 12)) return null;
  const width = u32be(bytes, 16);
  const height = u32be(bytes, 20);
  if (!isPositiveInteger(width) || !isPositiveInteger(height)) return null;
  // PNG has no orientation tag in its base spec; the browser renders it as stored.
  return { format: 'png', width, height, orientation: 1 };
}

function parseWebp(bytes: Uint8Array): ImageHeader | null {
  if (!startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) || !startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return null;
  const chunk = String.fromCharCode(...bytes.subarray(12, 16));
  if (chunk === 'VP8X') {
    if (bytes.length < 30) return null;
    const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
    const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
    return isPositiveInteger(width) && isPositiveInteger(height)
      ? { format: 'webp', width, height, orientation: 1 }
      : null;
  }
  if (chunk === 'VP8 ') {
    // Lossy: 3-byte frame tag, 3-byte sync code, then two 14-bit little-endian dimensions.
    if (bytes.length < 30 || !startsWith(bytes, [0x9d, 0x01, 0x2a], 23)) return null;
    const width = u16le(bytes, 26) & 0x3fff;
    const height = u16le(bytes, 28) & 0x3fff;
    return isPositiveInteger(width) && isPositiveInteger(height)
      ? { format: 'webp', width, height, orientation: 1 }
      : null;
  }
  if (chunk === 'VP8L') {
    // Lossless: 0x2F signature, then 14-bit width-1 and height-1 packed little-endian.
    if (bytes.length < 25 || bytes[20] !== 0x2f) return null;
    const bits = u32le(bytes, 21);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >>> 14) & 0x3fff) + 1;
    return isPositiveInteger(width) && isPositiveInteger(height)
      ? { format: 'webp', width, height, orientation: 1 }
      : null;
  }
  return null;
}

/** Parse the stored dimensions and EXIF orientation from an image header. Never throws. */
export function parseImageHeader(bytes: Uint8Array): ImageHeader | null {
  if (!bytes || bytes.length < 16) return null;
  try {
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return parseJpeg(bytes);
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return parsePng(bytes);
    if (bytes[0] === 0x52 && bytes[1] === 0x49) return parseWebp(bytes);
    return null;
  } catch {
    return null;
  }
}

/**
 * The dimensions the photo is *displayed* at, i.e. after the browser applies EXIF rotation.
 * Orientations 5-8 rotate by 90°, so width and height swap.
 */
export function orientedImageSize(header: ImageHeader): { width: number; height: number } {
  const rotated = header.orientation >= 5 && header.orientation <= 8;
  return rotated
    ? { width: header.height, height: header.width }
    : { width: header.width, height: header.height };
}

async function readBytes(blob: Blob): Promise<Uint8Array | null> {
  try {
    if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer());
    return await new Promise<Uint8Array | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result instanceof ArrayBuffer ? new Uint8Array(reader.result) : null);
      reader.onerror = () => resolve(null);
      reader.readAsArrayBuffer(blob);
    });
  } catch {
    return null;
  }
}

/** Read the header of a file without decoding its pixels. Resolves `null` on any problem. */
export async function readImageHeader(file: Blob): Promise<ImageHeader | null> {
  try {
    const slice = typeof file.slice === 'function' ? file.slice(0, HEADER_PROBE_BYTES) : file;
    const bytes = await readBytes(slice);
    return bytes ? parseImageHeader(bytes) : null;
  } catch {
    return null;
  }
}
