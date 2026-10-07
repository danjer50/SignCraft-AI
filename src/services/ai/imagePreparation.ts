import { MAX_AI_IMAGE_SIDE } from './contracts';

interface Dimensions {
  width: number;
  height: number;
}

function scaledSize(natural: Dimensions): Dimensions {
  const scale = Math.min(1, MAX_AI_IMAGE_SIDE / natural.width, MAX_AI_IMAGE_SIDE / natural.height);
  return {
    width: Math.max(1, Math.round(natural.width * scale)),
    height: Math.max(1, Math.round(natural.height * scale)),
  };
}

/** Draw any canvas-drawable source into a correctly sized, JPEG-compressed temporary File. */
async function drawToJpegFile(source: CanvasImageSource, size: Dimensions, lastModified: number): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image resizing is unavailable.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size.width, size.height);
  context.drawImage(source, 0, 0, size.width, size.height);
  const compressed = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Image compression failed.'))), 'image/jpeg', 0.82);
  });
  if (!compressed.size) throw new Error('Image compression returned an empty file.');
  return new File([compressed], 'storefront.jpg', { type: 'image/jpeg', lastModified });
}

/**
 * Upper bound used only to cap how large a bitmap `createImageBitmap` ever has to materialize in
 * memory. Modern phone cameras can produce images tens of megapixels wide; decoding one of those
 * at full native resolution just to immediately throw it away after a canvas downscale is a
 * plausible cause of "preparation failed" on low-memory Android devices. This value is a
 * generous ceiling (every realistic storefront photo ends up far smaller than this on its longer
 * side already, long before the final `MAX_AI_IMAGE_SIDE` downscale), chosen so it only ever
 * kicks in for the oversized photos that are actually at OOM risk.
 */
const PRE_DECODE_MAX_SIDE = 2048;

/** Primary method: decode the bitmap (capped during decode to bound memory use), then downscale it onto a small canvas. */
async function prepareViaImageBitmap(source: File): Promise<File> {
  if (typeof createImageBitmap !== 'function') throw new Error('createImageBitmap is not supported in this browser.');
  const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image', resizeWidth: PRE_DECODE_MAX_SIDE, resizeQuality: 'medium' });
  try {
    if (!bitmap.width || !bitmap.height) throw new Error('The source image has invalid dimensions.');
    return await drawToJpegFile(bitmap, scaledSize(bitmap), source.lastModified);
  } finally {
    bitmap.close();
  }
}


/**
 * Fallback method, tried only if the primary one fails: decode through a plain `<img>` element
 * instead of `createImageBitmap`. This exercises the browser's ordinary image-rendering
 * pipeline rather than the Canvas ImageBitmap API, which on some mobile browsers rejects or
 * mishandles photos (unusual ICC colour profiles, certain progressive JPEGs, camera-specific
 * encodings) that the standard `<img>` decoder still renders without issue.
 */
async function prepareViaImageElement(source: File): Promise<File> {
  if (typeof Image !== 'function') throw new Error('Image decoding is not supported in this browser.');
  const objectUrl = URL.createObjectURL(source);
  try {
    const image = new Image();
    // Keep the same EXIF-respecting rotation behaviour as createImageBitmap's
    // `imageOrientation: 'from-image'` so a sideways phone photo is not sent upright-but-wrong.
    image.style.imageOrientation = 'from-image';
    image.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('The source image could not be decoded.'));
      image.src = objectUrl;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('The source image has invalid dimensions.');
    return await drawToJpegFile(image, scaledSize({ width: image.naturalWidth, height: image.naturalHeight }), source.lastModified);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Prepare a temporary, low-resolution JPEG reference for FLUX.2 Klein. The source File held by
 * the project remains unchanged and is never replaced.
 *
 * Tries `createImageBitmap` first (fast, used by almost every device), and only falls back to a
 * plain `<img>`-based decode if that throws — this keeps a photo that one method cannot handle
 * from failing the whole "prepare image" step outright instead of a visible error.
 */
export async function prepareCloudflareReferenceImage(source: File): Promise<File> {
  try {
    return await prepareViaImageBitmap(source);
  } catch (primaryError) {
    try {
      return await prepareViaImageElement(source);
    } catch (fallbackError) {
      console.warn('[SignCraft] storefront photo preparation failed on both the primary and fallback paths.', { primaryError, fallbackError });
      throw fallbackError;
    }
  }
}
