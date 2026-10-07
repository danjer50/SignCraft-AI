import { hasValidImageSignature } from '../http/imageValidation.js';

const MAX_OUTPUT_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_OUTPUT_BASE64_CHARS = Math.ceil(MAX_OUTPUT_IMAGE_BYTES * 4 / 3) + 8;
const OUTPUT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export interface DecodedProviderImage {
  bytes: Uint8Array;
  mimeType: string;
  base64: string;
}

/**
 * Encode image bytes as base64 without Buffer, so the same code runs on Node/Vercel and on
 * Cloudflare Workers. Chunked because `String.fromCharCode(...bytes)` would overflow the stack on
 * a multi-hundred-kilobyte photo.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

/**
 * Reject a provider echo using the exact bytes uploaded to that provider, not the base64 spelling
 * or the customer's original (pre-resize) file. This works on both Node and Workers without an
 * image-decoding dependency. Re-encoded copies need the browser's separate pixel comparison.
 */
export function isUnchangedSource(image: DecodedProviderImage, sourceBytes: Uint8Array): boolean {
  return image.bytes.length === sourceBytes.length
    && image.bytes.every((byte, index) => byte === sourceBytes[index]);
}

function mimeTypeFromSignature(bytes: Uint8Array): string | null {
  const header = bytes.subarray(0, 12);
  return OUTPUT_IMAGE_TYPES.find((candidate) => hasValidImageSignature(candidate, header)) ?? null;
}

/**
 * Validate and decode a bare base64 image returned by a provider. A provider result is only ever
 * accepted when it decodes to a real JPEG/PNG/WebP inside the size cap, so a malformed or hostile
 * payload can never reach the browser as a `data:` URL.
 */
export function decodeProviderBase64Image(base64: string): DecodedProviderImage | null {
  const value = base64.trim();
  if (!value || value.length > MAX_OUTPUT_BASE64_CHARS || value.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    return null;
  }
  const padded = value + '='.repeat((4 - value.length % 4) % 4);
  try {
    const binary = atob(padded);
    if (!binary.length || binary.length > MAX_OUTPUT_IMAGE_BYTES) return null;
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const mimeType = mimeTypeFromSignature(bytes);
    return mimeType ? { bytes, mimeType, base64: padded } : null;
  } catch {
    return null;
  }
}

/** Same validation, for providers (OpenRouter) that answer with a `data:image/...;base64,` URL. */
export function decodeProviderDataUrlImage(dataUrl: string): DecodedProviderImage | null {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl.trim());
  if (!match) return null;
  const decoded = decodeProviderBase64Image(match[2]);
  if (!decoded || decoded.mimeType !== match[1]) return null;
  return decoded;
}
