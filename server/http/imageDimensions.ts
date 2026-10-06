export interface ImageDimensions {
  width: number;
  height: number;
}

function readUint24LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readJpegDimensions(bytes: Uint8Array): ImageDimensions | null {
  let offset = 2;
  const scanLimit = Math.min(bytes.length, 64 * 1024);
  while (offset + 3 < scanLimit) {
    if (bytes[offset] !== 0xff) return null;
    while (offset < scanLimit && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) return null;
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue;
    if (offset + 2 > scanLimit) return null;
    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > scanLimit) return null;
    const isStartOfFrame = [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker);
    if (isStartOfFrame) {
      if (segmentLength < 7) return null;
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      return width > 0 && height > 0 ? { width, height } : null;
    }
    offset += segmentLength;
  }
  return null;
}

function readWebpDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 30) return null;
  const chunk = String.fromCharCode(...bytes.subarray(12, 16));
  if (chunk === 'VP8X') {
    const width = readUint24LE(bytes, 24) + 1;
    const height = readUint24LE(bytes, 27) + 1;
    return { width, height };
  }
  if (chunk === 'VP8L' && bytes[20] === 0x2f) {
    const width = 1 + bytes[21] + ((bytes[22] & 0x3f) << 8);
    const height = 1 + ((bytes[22] & 0xc0) >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10);
    return { width, height };
  }
  if (chunk === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    const width = ((bytes[27] & 0x3f) << 8) | bytes[26];
    const height = ((bytes[29] & 0x3f) << 8) | bytes[28];
    return width > 0 && height > 0 ? { width, height } : null;
  }
  return null;
}

/** Read pixel dimensions from common image headers without decompressing user data. */
export function readImageDimensions(mimeType: string, bytes: Uint8Array): ImageDimensions | null {
  if (mimeType === 'image/png') {
    if (bytes.length < 24 || String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR') return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(16, false);
    const height = view.getUint32(20, false);
    return width > 0 && height > 0 ? { width, height } : null;
  }
  if (mimeType === 'image/jpeg') return readJpegDimensions(bytes);
  if (mimeType === 'image/webp') return readWebpDimensions(bytes);
  return null;
}
