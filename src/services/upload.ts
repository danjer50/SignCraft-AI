import type { UploadedStorefrontPhoto } from '../domain/sign.js';
import { prepareCloudflareReferenceImage } from './ai/imagePreparation.js';
import { parseImageHeader, HEADER_PROBE_BYTES } from './ai/imageProbe.js';
import { sha256 } from '@noble/hashes/sha2.js';

export const MAX_STOREFRONT_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_STOREFRONT_PIXELS = 24_000_000;
export const MAX_PREVIEW_BYTES = 256 * 1024;
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type UploadValidationError = 'unsupported-type' | 'too-large' | 'empty-file';
export type UploadErrorCode = UploadValidationError | 'invalid-image' | 'pixel-budget' | 'timeout' | 'preview-unavailable' | 'cancelled';
export class UploadError extends Error {
  constructor(readonly code: UploadErrorCode) { super(code); this.name = 'UploadError'; }
}
export function validateStorefrontImage(file: Pick<File, 'type' | 'size'>): UploadValidationError | null {
  if (!file.size) return 'empty-file';
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_TYPES)[number])) return 'unsupported-type';
  if (file.size > MAX_STOREFRONT_IMAGE_BYTES) return 'too-large';
  return null;
}

/** Bounded reads: abort FileReader, ignore late native blob results, never encode the original as a data URL. */
export async function readBlobBytes(blob: Blob, signal?: AbortSignal, timeoutMs = 8000): Promise<Uint8Array> {
  if (signal?.aborted) throw new UploadError('cancelled');
  return new Promise((resolve, reject) => {
    let reader: FileReader | undefined;
    let settled = false;
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    const fail = (code: UploadErrorCode) => {
      if (settled) return;
      settled = true; cleanup();
      try { reader?.abort(); } catch { /* already finished */ }
      reject(new UploadError(code));
    };
    const abort = () => fail('cancelled');
    const timer = setTimeout(() => fail('timeout'), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    const done = (value: ArrayBuffer) => {
      if (settled) return;
      settled = true; cleanup(); resolve(new Uint8Array(value));
    };
    if (typeof blob.arrayBuffer === 'function') {
      blob.arrayBuffer().then(done, () => fail('invalid-image'));
    } else {
      try {
        reader = new FileReader();
        reader.onload = () => reader?.result instanceof ArrayBuffer ? done(reader.result) : fail('invalid-image');
        reader.onerror = () => fail('invalid-image');
        reader.onabort = () => fail('cancelled');
        reader.readAsArrayBuffer(blob);
      } catch { fail('invalid-image'); }
    }
  });
}
export async function validateStorefrontImageSignature(file: File, signal?: AbortSignal): Promise<boolean> {
  const bytes = await readBlobBytes(file.slice(0, 12), signal);
  if (file.type === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (file.type === 'image/png') return bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, i) => bytes[i] === byte);
  if (file.type === 'image/webp') return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  return false;
}
export function bytesDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(binary)}`;
}
export async function createStorefrontPhoto(file: File, options: { signal?: AbortSignal } = {}): Promise<UploadedStorefrontPhoto> {
  const { signal } = options;
  const issue = validateStorefrontImage(file);
  if (issue) throw new UploadError(issue);
  if (!await validateStorefrontImageSignature(file, signal)) throw new UploadError('invalid-image');
  const header = parseImageHeader(await readBlobBytes(file.slice(0, HEADER_PROBE_BYTES), signal));
  if (signal?.aborted) throw new UploadError('cancelled');
  if (!header) throw new UploadError('invalid-image');
  if (header.width * header.height > MAX_STOREFRONT_PIXELS || header.width > 30000 || header.height > 30000) throw new UploadError('pixel-budget');
  let preview: File;
  try {
    preview = await prepareCloudflareReferenceImage(file, { signal, maxSide: 960, maxInputPixels: MAX_STOREFRONT_PIXELS });
    if (preview.size > MAX_PREVIEW_BYTES) preview = await prepareCloudflareReferenceImage(preview, { signal, maxSide: 511 });
  } catch (error) {
    if (signal?.aborted || error instanceof DOMException && error.name === 'AbortError') throw new UploadError('cancelled');
    if (error instanceof Error && /timed out/i.test(error.message)) throw new UploadError('timeout');
    throw new UploadError('preview-unavailable');
  }
  if (preview.size > MAX_PREVIEW_BYTES || !preview.size) throw new UploadError('preview-unavailable');
  const previewDataUrl = bytesDataUrl(await readBlobBytes(preview, signal), preview.type);
  const sourceIdentity = Array.from(sha256(await readBlobBytes(file, signal)), (b) => b.toString(16).padStart(2, '0')).join('');
  if (signal?.aborted) throw new UploadError('cancelled');
  return { file, fileName: file.name, mimeType: file.type, sizeBytes: file.size, sourceIdentity, transferState: 'LOCAL_ONLY', previewDataUrl, previewUrl: previewDataUrl };
}
export function uploadErrorMessageKey(error: unknown): string {
  const code = error instanceof UploadError ? error.code : 'preview-unavailable';
  return ({ 'unsupported-type': 'studio.fileTypeError', 'too-large': 'studio.fileTooLarge', 'empty-file': 'studio.fileEmpty', 'invalid-image': 'image.invalid', 'pixel-budget': 'image.pixelBudget', timeout: 'image.timeout', 'preview-unavailable': 'image.previewFailure', cancelled: 'image.cancelled' } as const)[code];
}
