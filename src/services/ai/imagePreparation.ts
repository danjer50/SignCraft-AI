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
async function encodeCanvas(
  canvas: HTMLCanvasElement,
  lastModified: number,
  options: PreparationOptions,
  budget: PreparationBudget,
): Promise<File | null> {
  const timeoutMessage = 'Encoding the photo timed out.';
  const perEncodeTimeout = encodeTimeout(options);

  for (const quality of JPEG_QUALITIES) {
    budget.assertAvailable(timeoutMessage);
    if (typeof canvas.toBlob === 'function') {
      let viaBlob: Blob | null = null;
      try {
        viaBlob = await budget.run(() => new Promise<Blob | null>((resolve) => {
          try {
            canvas.toBlob((blob) => resolve(blob ?? null), 'image/jpeg', quality);
          } catch {
            resolve(null);
          }
        }), perEncodeTimeout, timeoutMessage);
      } catch (error) {
        if (budget.remaining() <= 0) throw error;
      }

      if (viaBlob) {
        try {
          const file = await budget.run(() => toPreparedFile(viaBlob, lastModified), perEncodeTimeout, timeoutMessage);
          if (file) return file;
        } catch (error) {
          if (budget.remaining() <= 0) throw error;
        }
      }
    }

    if (typeof canvas.toDataURL === 'function') {
      try {
        const file = await budget.run(
          () => toPreparedFile(dataUrlToBlob(canvas.toDataURL('image/jpeg', quality)), lastModified),
          perEncodeTimeout,
          timeoutMessage,
        );
        if (file) return file;
      } catch (error) {
        if (budget.remaining() <= 0) throw error;
        // Try the next quality/encoder combination while the shared deadline still permits it.
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
  options: PreparationOptions,
  budget: PreparationBudget,
): Promise<File> {
  budget.assertAvailable('Encoding the photo timed out.');
  const target = scaledSize(sourceSize);
  if (longestSide(sourceSize) <= SINGLE_DRAW_MAX_SIDE) {
    const canvas = draw(source, target);
    try {
      const file = await encodeCanvas(canvas, lastModified, options, budget);
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
      const file = await encodeCanvas(canvas, lastModified, options, budget);
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
  /** Time left before the one deadline shared by probing, decoding, encoding and fallbacks. */
  remaining(): number;
  assertAvailable(message: string): void;
  run<T>(
    work: () => Promise<T> | T,
    maxDurationMs: number,
    message: string,
    onTimeout?: () => void,
    onLateValue?: (value: T) => void,
  ): Promise<T>;
}

function createBudget(options: PreparationOptions): PreparationBudget {
  const configuredTotal = Number.isFinite(options.totalTimeoutMs)
    ? Math.max(0, options.totalTimeoutMs as number)
    : DEFAULT_TOTAL_TIMEOUT_MS;
  const deadline = Date.now() + configuredTotal;
  const remaining = () => Math.max(0, deadline - Date.now());

  return {
    remaining,
    assertAvailable(message) {
      if (remaining() <= 0) throw new Error(message);
    },
    run<T>(
      work: () => Promise<T> | T,
      maxDurationMs: number,
      message: string,
      onTimeout?: () => void,
      onLateValue?: (value: T) => void,
    ): Promise<T> {
      const available = remaining();
      const configuredDuration = Number.isFinite(maxDurationMs) ? Math.max(0, maxDurationMs) : 0;
      const timeoutMs = Math.min(available, configuredDuration);
      if (timeoutMs <= 0) {
        onTimeout?.();
        return Promise.reject(new Error(message));
      }
      const pending = Promise.resolve().then(work);
      return withTimeout(pending, timeoutMs, message, () => remaining() <= 0, onTimeout, onLateValue);
    },
  };
}

function strategyTimeout(options: PreparationOptions): number {
  return Number.isFinite(options.strategyTimeoutMs)
    ? Math.max(0, options.strategyTimeoutMs as number)
    : DEFAULT_STRATEGY_TIMEOUT_MS;
}

function encodeTimeout(options: PreparationOptions): number {
  return Number.isFinite(options.encodeTimeoutMs)
    ? Math.max(0, options.encodeTimeoutMs as number)
    : DEFAULT_ENCODE_TIMEOUT_MS;
}

function withTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
  message: string,
  totalExpired?: () => boolean,
  onTimeout?: () => void,
  onLateValue?: (value: T) => void,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    onTimeout?.();
    return Promise.reject(new Error(message));
  }

  const stageDeadline = Date.now() + timeoutMs;
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const rejectForTimeout = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      onTimeout?.();
      reject(new Error(message));
    };
    const timer = setTimeout(rejectForTimeout, timeoutMs);

    work.then(
      (value) => {
        if (settled) {
          try {
            onLateValue?.(value);
          } catch {
            // Late-resource cleanup must never create a second unhandled failure.
          }
          return;
        }
        if (Date.now() >= stageDeadline || totalExpired?.()) {
          try {
            onLateValue?.(value);
          } catch {
            // Late-resource cleanup must never create a second unhandled failure.
          }
          rejectForTimeout();
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        if (Date.now() >= stageDeadline || totalExpired?.()) {
          rejectForTimeout();
          return;
        }
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Decode with one watchdog. A timed-out browser decode cannot be cancelled, so never start another
 * bitmap decode as a fallback; if this one eventually resolves, close it instead of retaining it.
 */
function closeBitmap(bitmap: ImageBitmap): void {
  try {
    bitmap.close();
  } catch {
    // Already released.
  }
}

function decodeBitmapWithTimeout(
  source: File,
  bitmapOptions: ImageBitmapOptions,
  timeoutMs: number,
  budget: PreparationBudget,
): Promise<ImageBitmap> {
  return budget.run(
    () => createImageBitmap(source, bitmapOptions),
    timeoutMs,
    'Decoding the photo timed out.',
    undefined,
    closeBitmap,
  );
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
      bitmap = await decodeBitmapWithTimeout(source, bitmapOptions, strategyTimeout(options), budget);
      break;
    } catch (error) {
      lastError = error;
      // Retrying after an ordinary decode failure or timeout can leave several uncancellable
      // decoders competing for the same browser resources. Simpler options are only a TypeError
      // compatibility fallback; all other errors go straight to the existing <img> strategy.
      if (!(error instanceof TypeError)) throw error;
    }
  }
  if (!bitmap) throw lastError;

  try {
    if (!bitmap.width || !bitmap.height) throw new Error('The source image has invalid dimensions.');
    return await downscaleToReference(bitmap, { width: bitmap.width, height: bitmap.height }, source.lastModified, options, budget);
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
  budget.assertAvailable('Decoding the photo timed out.');
  const image = new Image();
  image.decoding = 'async';
  try {
    await budget.run(() => new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('The source image could not be decoded.'));
      image.src = url;
    }), strategyTimeout(options), 'Decoding the photo timed out.');
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('The source image has invalid dimensions.');
    return await downscaleToReference(
      image,
      { width: image.naturalWidth, height: image.naturalHeight },
      source.lastModified,
      options,
      budget,
    );
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
function readDataUrl(file: Blob, options: PreparationOptions, budget: PreparationBudget): Promise<string | null> {
  let reader: FileReader | null = null;
  return budget.run(() => new Promise((resolve) => {
    try {
      reader = new FileReader();
      reader.onload = () => resolve(typeof reader?.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.onabort = () => resolve(null);
      reader.readAsDataURL(file);
    } catch {
      resolve(null);
    }
  }), strategyTimeout(options), 'Reading the photo timed out.', () => {
    try {
      reader?.abort();
    } catch {
      // The FileReader may already have completed or been released.
    }
  });
}

/**
 * Prepare a temporary, low-resolution reference for the AI providers. The source File held by the
 * project remains unchanged and is never replaced, and only the resized copy is ever uploaded.
 *
 * One deadline starts before the header probe and is shared by every decoder, encoder and URL
 * fallback. Bitmap option retries are compatibility-only (TypeError); ordinary errors and timeouts
 * move directly to the existing <img> fallback so abandoned decoders do not multiply.
 */
export async function prepareCloudflareReferenceImage(source: File, options: PreparationOptions = {}): Promise<File> {
  const budget = createBudget(options);
  const header = await budget.run(
    () => readImageHeader(source),
    budget.remaining(),
    'Preparing the photo timed out.',
  );
  const attempts: Array<{ name: string; run: () => Promise<File> }> = [];
  const failures: unknown[] = [];

  let objectUrl: string | null = null;
  try {
    budget.assertAvailable('Preparing the photo timed out.');
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

    for (const attempt of attempts) {
      if (budget.remaining() <= 0) break;
      try {
        return await attempt.run();
      } catch (error) {
        failures.push(error);
      }
    }

    // Only now is a data URL built: it holds a base64 copy of the file, so it is a genuine
    // last resort rather than the default path. Its read and subsequent <img> decode use the same
    // deadline as the header probe and bitmap strategy.
    if (budget.remaining() > 0) {
      try {
        const dataUrl = await readDataUrl(source, options, budget);
        if (dataUrl && budget.remaining() > 0) {
          try {
            return await prepareViaImageElement(source, { dataUrl }, options, budget);
          } catch (error) {
            failures.push(error);
          }
        }
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
