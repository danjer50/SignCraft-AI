import { MAX_AI_IMAGE_SIDE } from './contracts';

/**
 * Prepare a temporary, low-resolution JPEG reference for FLUX.2 Klein. The
 * source File held by the project remains unchanged and is never replaced.
 */
export async function prepareCloudflareReferenceImage(source: File): Promise<File> {
  if (typeof createImageBitmap !== 'function') throw new Error('Image resizing is not supported in this browser.');
  const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
  try {
    if (!bitmap.width || !bitmap.height) throw new Error('The source image has invalid dimensions.');
    const scale = Math.min(1, MAX_AI_IMAGE_SIDE / bitmap.width, MAX_AI_IMAGE_SIDE / bitmap.height);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image resizing is unavailable.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const compressed = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Image compression failed.')), 'image/jpeg', 0.82);
    });
    if (!compressed.size) throw new Error('Image compression returned an empty file.');
    return new File([compressed], 'storefront.jpg', { type: 'image/jpeg', lastModified: source.lastModified });
  } finally {
    bitmap.close();
  }
}
