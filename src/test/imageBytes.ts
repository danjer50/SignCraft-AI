/**
 * Byte-level image fixtures for the image-preparation and header-probe tests.
 *
 * These are *real* headers with correct magic bytes, SOF/IHDR/VP8 dimensions and EXIF orientation
 * blocks — no pixel data is needed by either module, but the bytes have to satisfy the same
 * signature checks the server applies, otherwise a test can pass against a file the providers would
 * reject. Nothing here is imported by application code.
 */

function u16be(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff];
}

function u32be(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function u32le(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

/** 'Exif\0\0' + TIFF header + IFD0 holding only the orientation tag (little-endian). */
function exifPayload(orientation: number, littleEndian = true): number[] {
  const tiff = littleEndian
    ? [
      0x49, 0x49, 0x2a, 0x00,
      0x08, 0x00, 0x00, 0x00,
      0x01, 0x00,
      0x12, 0x01,
      0x03, 0x00,
      0x01, 0x00, 0x00, 0x00,
      orientation & 0xff, (orientation >> 8) & 0xff, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
    ]
    : [
      0x4d, 0x4d, 0x00, 0x2a,
      0x00, 0x00, 0x00, 0x08,
      0x00, 0x01,
      0x01, 0x12,
      0x00, 0x03,
      0x00, 0x00, 0x00, 0x01,
      // A SHORT value is left-justified in the 4-byte field, so big-endian puts it first.
      0x00, orientation & 0xff, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
    ];
  return [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
}

function jpegSegment(marker: number, payload: number[]): number[] {
  return [0xff, marker, ...u16be(payload.length + 2), ...payload];
}

/** A JPEG with a real SOF0 frame header, optionally carrying an EXIF orientation tag. */
export function jpegBytes(width: number, height: number, orientation = 1): Uint8Array {
  const bytes = [0xff, 0xd8];
  if (orientation !== 1) bytes.push(...jpegSegment(0xe1, exifPayload(orientation)));
  bytes.push(
    ...jpegSegment(0xc0, [
      0x08,
      ...u16be(height),
      ...u16be(width),
      0x03,
      0x01, 0x11, 0x00,
      0x02, 0x11, 0x01,
      0x03, 0x11, 0x01,
    ]),
    0xff, 0xd9,
  );
  return new Uint8Array(bytes);
}

/** Same as `jpegBytes`, but the EXIF block is stored in big-endian (Motorola) TIFF order. */
export function jpegBytesWithBigEndianExif(width: number, height: number, orientation: number): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8,
    ...jpegSegment(0xe1, exifPayload(orientation, false)),
    ...jpegSegment(0xc0, [0x08, ...u16be(height), ...u16be(width), 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]),
    0xff, 0xd9,
  ]);
}

/** A JPEG whose SOF0 frame header is missing, so no dimensions can be read. */
export function jpegBytesWithoutFrameHeader(): Uint8Array {
  return new Uint8Array([...jpegSegment(0xe0, [0x01, 0x02, 0x03, 0x04]), 0xff, 0xd9]);
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function pngBytes(width: number, height: number): Uint8Array {
  return new Uint8Array([
    ...PNG_SIGNATURE,
    ...u32be(13), 0x49, 0x48, 0x44, 0x52,
    ...u32be(width), ...u32be(height),
    0x08, 0x06, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    ...u32be(0), 0x49, 0x45, 0x4e, 0x44, 0x00, 0x00, 0x00, 0x00,
  ]);
}

function riffHeader(fourcc: string, chunkSize: number): number[] {
  return [
    0x52, 0x49, 0x46, 0x46,
    ...u32le(chunkSize + 8),
    0x57, 0x45, 0x42, 0x50,
    fourcc.charCodeAt(0), fourcc.charCodeAt(1), fourcc.charCodeAt(2), fourcc.charCodeAt(3),
    ...u32le(chunkSize),
  ];
}

/** Extended (VP8X) WebP, the container modern WebP encoders emit. */
export function webpVp8xBytes(width: number, height: number): Uint8Array {
  const widthMinusOne = width - 1;
  const heightMinusOne = height - 1;
  return new Uint8Array([
    ...riffHeader('VP8X', 10),
    0x00, 0x00, 0x00, 0x00,
    widthMinusOne & 0xff, (widthMinusOne >> 8) & 0xff, (widthMinusOne >> 16) & 0xff,
    heightMinusOne & 0xff, (heightMinusOne >> 8) & 0xff, (heightMinusOne >> 16) & 0xff,
  ]);
}

/** Lossy WebP (VP8) with the 0x9d012a sync code and 14-bit dimensions. */
export function webpVp8Bytes(width: number, height: number): Uint8Array {
  return new Uint8Array([
    ...riffHeader('VP8 ', 16),
    0x00, 0x00, 0x00,
    0x9d, 0x01, 0x2a,
    width & 0xff, (width >> 8) & 0x3f,
    height & 0xff, (height >> 8) & 0x3f,
  ]);
}

/** Lossless WebP (VP8L) with the 0x2f signature and packed 14-bit dimensions. */
export function webpVp8lBytes(width: number, height: number): Uint8Array {
  const bits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14);
  return new Uint8Array([...riffHeader('VP8L', 5), 0x2f, ...u32le(bits)]);
}

/** Byte-perfect enough for the local signature check the studio performs before upload. */
export function jpegFile(
  width: number,
  height: number,
  options: { orientation?: number; name?: string; lastModified?: number; bytes?: Uint8Array } = {},
): File {
  const bytes = options.bytes ?? jpegBytes(width, height, options.orientation ?? 1);
  return new File([bytes as BlobPart], options.name ?? 'storefront.jpg', {
    type: 'image/jpeg',
    lastModified: options.lastModified ?? 1,
  });
}
