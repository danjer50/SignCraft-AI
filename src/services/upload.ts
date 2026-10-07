import type { UploadedStorefrontPhoto } from '../domain/sign.js';

export const MAX_STOREFRONT_IMAGE_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type UploadValidationError = 'unsupported-type' | 'too-large' | 'empty-file';

export function validateStorefrontImage(file: Pick<File, 'type' | 'size'>): UploadValidationError | null {
  if (!file.size) return 'empty-file';
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_TYPES)[number])) {
    return 'unsupported-type';
  }
  if (file.size > MAX_STOREFRONT_IMAGE_BYTES) return 'too-large';
  return null;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not decode image'));
    image.src = url;
  });
}

async function makeThumbnail(file: File, maxWidth: number, maxHeight: number): Promise<string> {
  const source = URL.createObjectURL(file);
  try {
    const image = await loadImage(source);
    const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.74);
  } finally {
    URL.revokeObjectURL(source);
  }
}

async function readHeaderBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => reader.result instanceof ArrayBuffer ? resolve(new Uint8Array(reader.result)) : reject(new Error('Could not read image header'));
    reader.onerror = () => reject(new Error('Could not read image header'));
    reader.readAsArrayBuffer(blob);
  });
}

export async function validateStorefrontImageSignature(file: File): Promise<boolean> {
  const bytes = await readHeaderBytes(file.slice(0, 12));
  if (file.type === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (file.type === 'image/png') return bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte);
  if (file.type === 'image/webp') return bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  return false;
}

export async function createStorefrontPhoto(file: File): Promise<UploadedStorefrontPhoto> {
  const issue = validateStorefrontImage(file);
  if (issue) throw new Error(issue);
  if (!await validateStorefrontImageSignature(file)) throw new Error('invalid-image');

  let previewDataUrl: string;
  try {
    previewDataUrl = await makeThumbnail(file, 520, 380);
  } catch {
    // A local preview is still useful on browsers without canvas support; the file remains local.
    previewDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Preview failed')));
      reader.onerror = () => reject(new Error('Preview failed'));
      reader.readAsDataURL(file);
    });
  }

  return {
    file,
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    transferState: 'LOCAL_ONLY',
    previewDataUrl,
    previewUrl: URL.createObjectURL(file),
  };
}
