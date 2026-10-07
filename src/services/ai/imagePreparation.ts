import { MAX_AI_IMAGE_SIDE } from './contracts';
import { orientedImageSize, readImageHeader, type ImageHeader } from './imageProbe';

interface Dimensions {
  width: number;
  height: number;
}

/**
 * Final reference size. This is the existing, unchanged provider limit (FLUX.2 Klein needs a side
 * below 512 px, and the server independently rejects anything larger), so the fix below never
 * relaxes it — it only makes reaching it reliable.
 */
const FINAL_MAX_SIDE = MAX_AI_IMAGE_SIDE;

/**
 * Longest side of the intermediate staging canvas used when a decoded bitmap is much larger than the
 * final target. Keeping every canvas small is what keeps peak canvas memory in the low megabytes on
 * phones instead of hundreds.
 */
const INTERMEDIATE_MAX_SIDE = 1024;

/**
 * A decode at or below this longest side is reduced in a single draw. Anything larger is staged
 * through one intermediate canvas first, which bounds every canvas allocation and keeps the
 * reduction ratio in the range where `drawImage` still resamples well.
 */
const SINGLE_DRAW_MAX_SIDE = INTERMEDIATE_MAX_SIDE * 2;

/** Tried in order. Encoders are not equally reliable across engines, so each is a real retry. */
const JPEG_QUALITIES = [0.82, 0.7] as const;

/**
 * Watchdogs. A decode that never settles used to leave the studio waiting for ever, because
 * preparation happens before the request (and therefore outside the request timeout). Each strategy
 * gets a slice of a shared budget, so the total wait is bounded even when every strategy stalls.
 */
const DEFAULT_STRATEGY_TIMEOUT_MS = 12_000;
const DEFAULT_TOTAL_TIMEOUT_MS = 25_000;
/** A `toBlob` call that never calls back is the same class of hang as a decode that never settles. */
const DEFAULT_ENCODE_TIMEOUT_MS = 5_000;

/**
 * Accepted output formats — exactly the three signatures the server's validation accepts. The
 * prepared bytes are checked against these before the file leaves the browser, so a provider can
 * never be handed an empty or mislabelled image.
 */
type OutputType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface PreparationOptions {
  /** Watchdog for a single decode strategy. Defaults to 12 s; tests use much smaller values. */
  strategyTimeoutMs?: number;
  /** Watchdog for the whole preparation. Defaults to 25 s. */
  totalTimeoutMs?: number;
  /** Watchdog for a single canvas encode. Defaults to 5 s. */
  encodeTimeoutMs?: number;
}

/** Scale a source down to fit `FINAL_MAX_SIDE`, never up, keeping the aspect ratio. */
function scaledSize(natural: Dimensions, maxSide = FINAL_MAX_SIDE): Dimensions {
  const scale = Math.min(1, maxSide / natural.width, maxSide / natural.height);
  return {
    width: Math.max(1, Math.round(natural.width * scale)),
    height: Math.max(1, Math.round(natural.height * scale)),
  };
}

function longestSide(size: Dimensions): number {
  return Math.max(size.width, size.height);
}

/**
 * Which single `createImageBitmap` resize option to send.
 *
 * Only ever one axis: specifying both would *stretch* the bitmap to that exact size instead of
 * scaling it proportionally, which would distort a storefront photo whose aspect ratio the header
 * probe got wrong. Capping the longest side bounds both sides, and using the oriented size means a
 * portrait phone photo is capped on its height rather than being left huge.
 */
function resizeOption(header: ImageHeader | null, maxSide = FINAL_MAX_SIDE): { resizeWidth: number } | { resizeHeight: number } {
  if (header) {
    const oriented = orientedImageSize(header);
    if (oriented.height > oriented.width) return { resizeHeight: maxSide };
  }
  return { resizeWidth: maxSide };
}

function sniffOutputType(bytes: Uint8Array): OutputType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte)) return 'image/png';
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  return null;
}

async function blobBytes(blob: Blob): Promise<Uint8Array | null> {
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

/** Build the final File only from bytes that really are a supported image, so adapters get a usable file. */
async function toPreparedFile(blob: Blob | null, lastModified: number): Promise<File | null> {
  if (!blob || !blob.size) return null;
  const bytes = await blobBytes(blob.slice(0, 12));
  const type = bytes ? sniffOutputType(bytes) : null;
  if (!type) return null;
  return new File([blob], 'storefront.jpg', { type, lastModified });
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) return null;
  try {
    const binary = atob(match[2]);
    if (!binary.length) return null;
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: match[1] });
  } catch {
    return null;
  }
}

/**
 * Encode a canvas to JPEG, trying every encoder the engine offers.
 *
 * `canvas.toBlob` is not dependable everywhere: some engines hand back `null` (or never call back)
 * under memory pressure even though the very same canvas encodes perfectly through `toDataURL`.
 * Treating that single result as fatal is what produced the production failure, so a null/failed
 * `toBlob` now falls through to a lower quality, then to `toDataURL`, and only then gives up.
 */
async function encodeCanvas(canvas: HTMLCanvasElement, lastModified: number, timeoutMs: number): Promise<File | null> {
  for (const quality of JPEG_QUALITIES) {
    if (typeof canvas.toBlob === 'function') {
      const pending = new Promise<Blob | null>((resolve) => {
        try {
          canvas.toBlob((blob) => resolve(blob ?? null), 'image/jpeg', quality);
        } catch {
          resolve(null);
        }
      });
      const viaBlob = await withTimeout(pending, timeoutMs, 'Encoding the photo timed out.').catch(() => null);
      const file = await toPreparedFile(viaBlob, lastModified);
      if (file) return file;
    }
    if (typeof canvas.toDataURL === 'function') {
      try {
        const file = await toPreparedFile(dataUrlToBlob(canvas.toDataURL('image/jpeg', quality)), lastModified);
        if (file) return file;
      } catch {
        // Try the next quality/encoder combination.
      }
    }
  }
  return null;
}

/**
 * Release a canvas' backing store immediately. On memory-constrained mobile browsers this is the
 * difference between a working next step and an allocation failure, because canvas memory is not
 * reclaimed until the element is collected.
 */
function releaseCanvas(canvas: HTMLCanvasElement | null): void {
  if (!canvas) return;
  try {
    canvas.width = 0;
    canvas.height = 0;
  } catch {
    // Nothing to do: the canvas is already unusable.
  }
}

function draw(source: CanvasImageSource, size: Dimensions): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  try {
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image resizing is unavailable.');
    // Flatten transparency onto white: storefront renderings and the JPEG reference expect an
    // opaque facade, and a transparent PNG/WebP would otherwise come out black.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, size.width, size.height);
    context.drawImage(source, 0, 0, size.width, size.height);
    return canvas;
  } catch (error) {
    // A canvas that failed part-way still holds its allocation until it is reset.
    releaseCanvas(canvas);
    throw error;
  }
}

/**
 * Draw any decoded source down to the final reference size through at most one intermediate canvas.
 *
 * A very large bitmap is never drawn straight into the tiny final canvas: the staged draw keeps the
 * per-step reduction modest (better quality) and, more importantly, keeps every canvas allocation
 * bounded. Each intermediate canvas is released as soon as it has been consumed.
 */
async function downscaleToReference(
  source: CanvasImageSource,
  sourceSize: Dimensions,
  lastModified: number,
  timeoutMs: number,
): Promise<File> {
  const target = scaledSize(sourceSize);
  if (longestSide(sourceSize) <= SINGLE_DRAW_MAX_SIDE) {
    const canvas = draw(source, target);
    try {
      const file = await encodeCanvas(canvas, lastModified, timeoutMs);
      if (!file) throw new Error('Image compression failed.');
      return file;
    } finally {
      releaseCanvas(canvas);
    }
  }

  const intermediateSize = scaledSize(sourceSize, INTERMEDIATE_MAX_SIDE);
  const intermediate = draw(source, intermediateSize);
  try {
    const canvas = draw(intermediate, target);
    try {
      const file = await encodeCanvas(canvas, lastModified, timeoutMs);
      if (!file) throw new Error('Image compression failed.');
      return file;
    } finally {
      releaseCanvas(canvas);
    }
  } finally {
    releaseCanvas(intermediate);
  }
}

interface PreparationBudget {
  /** Time left for the next strategy, never below zero. */
  remaining(): number;
}

function createBudget(options: PreparationOptions): PreparationBudget {
  const total = Number.isFinite(options.totalTimeoutMs) ? (options.totalTimeoutMs as number) : DEFAULT_TOTAL_TIMEOUT_MS;
  const deadline = Date.now() + total;
  return { remaining: () => Math.max(0, deadline - Date.now()) };
}

function strategyTimeout(options: PreparationOptions, budget: PreparationBudget): number {
  const perStrategy = Number.isFinite(options.strategyTimeoutMs)
    ? (options.strategyTimeoutMs as number)
    : DEFAULT_STRATEGY_TIMEOUT_MS;
  if (!Number.isFinite(options.totalTimeoutMs)) return perStrategy;
  return Math.max(1, Math.min(perStrategy, budget.remaining()));
}

function encodeTimeout(options: PreparationOptions, budget: PreparationBudget): number {
  const perEncode = Number.isFinite(options.encodeTimeoutMs)
    ? (options.encodeTimeoutMs as number)
    : DEFAULT_ENCODE_TIMEOUT_MS;
  if (!Number.isFinite(options.totalTimeoutMs)) return perEncode;
  return Math.max(1, Math.min(perEncode, budget.remaining()));
}

/**
 * Decode through `createImageBitmap` with a watchdog that still releases the bitmap if the decode
 * finishes *after* the watchdog fired — otherwise a slow decode would leak the very allocation the
 * timeout exists to protect against.
 */
async function decodeBitmapWithTimeout(source: File, bitmapOptions: ImageBitmapOptions, timeoutMs: number): Promise<ImageBitmap> {
  const pending = createImageBitmap(source, bitmapOptions);
  let timedOut = false;
  pending.then(
    (bitmap) => {
      if (!timedOut) return;
      try {
        bitmap.close();
      } catch {
        // Already released.
      }
    },
    () => {
      // The rejection is reported by the awaited promise below.
    },
  );
  try {
    return await withTimeout(pending, timeoutMs, 'Decoding the photo timed out.');
  } catch (error) {
    timedOut = true;
    throw error;
  }
}

function withTimeout<T>(work: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return work;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    work.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

/**
 * Primary strategy: `createImageBitmap`, which can decode straight to the capped size on engines
 * that implement the resize options — the cheapest and most memory-friendly path.
 *
 * The options are tried richest-first. The reason is not cosmetic: `createImageBitmap` validates its
 * options dictionary, so an engine that does not accept `imageOrientation: 'from-image'` or the
 * resize keys throws a `TypeError` for the *whole call*. One rejected option used to kill decoding
 * by bitmap entirely, which pushed every photo onto the far more memory-hungry `<img>` path.
 */
async function prepareViaImageBitmap(source: File, header: ImageHeader | null, options: PreparationOptions, budget: PreparationBudget): Promise<File> {
  if (typeof createImageBitmap !== 'function') throw new Error('createImageBitmap is not supported in this browser.');
  const resize = resizeOption(header);
  const attempts: ImageBitmapOptions[] = [
    { imageOrientation: 'from-image', ...resize, resizeQuality: 'high' },
    { ...resize, resizeQuality: 'high' },
    {},
  ];

  let bitmap: ImageBitmap | null = null;
  let lastError: unknown = new Error('createImageBitmap rejected every option combination.');
  for (const bitmapOptions of attempts) {
    try {
      bitmap = await decodeBitmapWithTimeout(source, bitmapOptions, strategyTimeout(options, budget));
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!bitmap) throw lastError;

  try {
    if (!bitmap.width || !bitmap.height) throw new Error('The source image has invalid dimensions.');
    return await downscaleToReference(bitmap, { width: bitmap.width, height: bitmap.height }, source.lastModified, encodeTimeout(options, budget));
  } finally {
    // Freed before encoding finishes only after the draw, so a huge bitmap never lingers.
    bitmap.close();
  }
}

interface ImageElementSource {
  objectUrl?: string;
  dataUrl?: string;
}

/**
 * Fallback strategy: decode through a plain `<img>` element.
 *
 * Tried only when the bitmap API is unavailable or rejects the file. It exercises the browser's
 * ordinary image pipeline, which renders some photos (unusual ICC profiles, certain progressive
 * JPEGs) that `createImageBitmap` refuses; the cost is a full-resolution decode, so the result is
 * drawn through the same bounded staging as the primary path and the element is released at once.
 *
 * `imageOrientation` is intentionally not set through CSS: it is not a real CSS property and does
 * nothing. Every current browser applies EXIF rotation when *rendering* an `<img>`, which is what
 * this path relies on.
 */
async function prepareViaImageElement(source: File, sourceUrl: ImageElementSource, options: PreparationOptions, budget: PreparationBudget): Promise<File> {
  if (typeof Image !== 'function') throw new Error('Image decoding is not supported in this browser.');
  const url = sourceUrl.objectUrl ?? sourceUrl.dataUrl;
  if (!url) throw new Error('No image source is available for decoding.');
  const image = new Image();
  image.decoding = 'async';
  try {
    await withTimeout(new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('The source image could not be decoded.'));
      image.src = url;
    }), strategyTimeout(options, budget), 'Decoding the photo timed out.');
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('The source image has invalid dimensions.');
    return await downscaleToReference(image, { width: image.naturalWidth, height: image.naturalHeight }, source.lastModified, encodeTimeout(options, budget));
  } finally {
    // Drop the reference to the decoded image so the browser can reclaim it immediately.
    try {
      image.src = '';
    } catch {
      // Ignore: nothing depends on this succeeding.
    }
  }
}

/** Last-resort URL: some environments refuse `blob:` object URLs but accept a `data:` URL. */
function readDataUrl(file: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Prepare a temporary, low-resolution JPEG reference for the AI providers. The source File held by
 * the project remains unchanged and is never replaced, and only the resized copy is ever uploaded.
 *
 * The pipeline is a ladder rather than a single attempt, because the failure that reached production
 * was a *single* rejected decoder option or a *single* null encoder result discarding an otherwise
 * perfectly good photo:
 *
 * 1. header probe (free) → correct resize axis and oriented dimensions;
 * 2. `createImageBitmap` with the richest options, then simpler ones, then none;
 * 3. `<img>` over an object URL, then over a data URL;
 * 4. staged, bounded downscale → encoder ladder (`toBlob`, lower quality, `toDataURL`);
 * 5. every strategy has a watchdog, so a decode that never settles cannot hang the studio.
 */
export async function prepareCloudflareReferenceImage(source: File, options: PreparationOptions = {}): Promise<File> {
  const header = await readImageHeader(source);
  const budget = createBudget(options);
  const attempts: Array<{ name: string; run: () => Promise<File> }> = [];

  let objectUrl: string | null = null;
  if (typeof URL?.createObjectURL === 'function') {
    try {
      objectUrl = URL.createObjectURL(source);
    } catch {
      objectUrl = null;
    }
  }

  attempts.push({ name: 'image-bitmap', run: () => prepareViaImageBitmap(source, header, options, budget) });
  if (objectUrl) {
    attempts.push({ name: 'image-element', run: () => prepareViaImageElement(source, { objectUrl: objectUrl as string }, options, budget) });
  }

  const failures: unknown[] = [];
  try {
    for (const attempt of attempts) {
      try {
        return await attempt.run();
      } catch (error) {
        failures.push(error);
      }
    }
    // Only now is a data URL built: it holds a base64 copy of the file, so it is a genuine
    // last resort rather than the default path.
    const dataUrl = await readDataUrl(source);
    if (dataUrl) {
      try {
        return await prepareViaImageElement(source, { dataUrl }, options, budget);
      } catch (error) {
        failures.push(error);
      }
    }
  } finally {
    if (objectUrl) {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        // Ignore: the URL is already gone.
      }
    }
  }

  // Dimensions and strategy names only: no file name, no bytes, nothing identifying the photo.
  console.warn('[SignCraft] storefront photo preparation failed on every strategy.', {
    source: header ? `${header.format} ${header.width}x${header.height}` : 'unreadable header',
    strategies: attempts.map((attempt) => attempt.name).join(', '),
    failures,
  });
  throw failures[failures.length - 1] ?? new Error('Image preparation failed.');
}
