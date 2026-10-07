const GRID_SIDE = 96;
const DECODE_TIMEOUT_MS = 4_000;
const MAX_RENDER_DATA_URL_CHARS = 17 * 1024 * 1024;
// Deliberately conservative: tolerate tiny encoding noise, but keep even a small local edit.
const MAX_MEAN_RGB_DELTA = 1.5;
const MAX_CHANNEL_DELTA = 12;

interface RasterSource {
  image: CanvasImageSource;
  release(): void;
}

function loadBitmap(blob: Blob, timeoutMs: number): Promise<RasterSource | null> {
  return new Promise((resolve) => {
    let settled = false;
    const timeout = setTimeout(() => {
      settled = true;
      resolve(null);
    }, timeoutMs);
    // The rejection handler also consumes errors after the watchdog has already fired.
    void Promise.resolve().then(() => createImageBitmap(blob, {
      resizeWidth: GRID_SIDE,
      resizeHeight: GRID_SIDE,
      resizeQuality: 'high',
    })).then((bitmap) => {
      const release = () => {
        try {
          bitmap.close();
        } catch {
          // Cleanup must not create an unhandled rejection after a timed-out decode.
        }
      };
      if (settled) {
        release();
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve({ image: bitmap, release });
    }, () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(null);
    });
  });
}

function loadImageElement(blob: Blob, timeoutMs: number): Promise<RasterSource | null> {
  if (typeof Image !== 'function' || typeof URL.createObjectURL !== 'function'
    || typeof URL.revokeObjectURL !== 'function') return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    const url = URL.createObjectURL(blob);
    const release = () => {
      try {
        image.src = '';
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    const finish = (loaded: boolean) => {
      clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      if (!loaded) {
        try {
          release();
        } catch {
          // A browser cleanup failure must not stop the watchdog from settling the comparison.
        }
      }
      resolve(loaded ? { image, release } : null);
    };
    const timeout = setTimeout(() => finish(false), timeoutMs);
    image.onload = () => finish(true);
    image.onerror = () => finish(false);
    try {
      image.src = url;
    } catch {
      finish(false);
    }
  });
}

async function samplePixels(blob: Blob): Promise<Uint8ClampedArray | null> {
  const canvas = document.createElement('canvas');
  canvas.width = GRID_SIDE;
  canvas.height = GRID_SIDE;
  let raster: RasterSource | null = null;
  try {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    const deadline = Date.now() + DECODE_TIMEOUT_MS;
    if (typeof createImageBitmap === 'function') raster = await loadBitmap(blob, DECODE_TIMEOUT_MS);
    const remaining = deadline - Date.now();
    if (!raster && remaining > 0) raster = await loadImageElement(blob, remaining);
    if (!raster) return null;
    // Flatten transparency identically and compare a bounded grid, never a full-size canvas.
    context.fillStyle = '#fff';
    context.fillRect(0, 0, GRID_SIDE, GRID_SIDE);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(raster.image, 0, 0, GRID_SIDE, GRID_SIDE);
    return context.getImageData(0, 0, GRID_SIDE, GRID_SIDE).data;
  } catch {
    return null;
  } finally {
    raster?.release();
    canvas.width = 0;
    canvas.height = 0;
  }
}

function renderBlob(dataUrl: string): Blob | null {
  if (dataUrl.length > MAX_RENDER_DATA_URL_CHARS) return null;
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) return null;
  const binary = atob(match[2]);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: match[1] });
}

/**
 * Catch a visually unchanged (including lightly re-encoded) copy before the client stores a
 * GENERATED concept. Compare the prepared photo actually sent to the provider, not the large,
 * uncompressed original. No network request is made: both images are decoded locally.
 *
 * This is an extra honesty guard, not image validation or proof that an edit is correct. Decoding,
 * canvas availability, pixel reads and watchdog failures all fail open, so a browser limitation
 * cannot discard a legitimate render. The server independently rejects byte-identical echoes.
 */
export async function isUnchangedRender(sourceImage: Blob, imageUrl: string): Promise<boolean> {
  try {
    const render = renderBlob(imageUrl);
    if (!render) return false;
    const [source, result] = await Promise.all([samplePixels(sourceImage), samplePixels(render)]);
    const pixelCount = GRID_SIDE * GRID_SIDE;
    if (!source || !result || source.length !== pixelCount * 4 || result.length !== source.length) return false;
    let totalDelta = 0;
    for (let offset = 0; offset < source.length; offset += 4) {
      for (let channel = 0; channel < 3; channel += 1) {
        const delta = Math.abs(source[offset + channel] - result[offset + channel]);
        // A meaningful local difference wins even if most of the facade is intentionally intact.
        if (delta > MAX_CHANNEL_DELTA) return false;
        totalDelta += delta;
      }
    }
    return totalDelta / (pixelCount * 3) <= MAX_MEAN_RGB_DELTA;
  } catch {
    return false;
  }
}
