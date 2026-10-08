import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareCloudflareReferenceImage } from './imagePreparation';
import { jpegBytes, pngBytes, webpVp8xBytes, jpegFile } from '../../test/imageBytes';

/**
 * A canvas stand-in that keeps the two things these tests care about observable:
 * which canvas sizes were drawn, and how each canvas ended up (released or not).
 *
 * Real encodes are impossible in jsdom, so the fake encoder returns byte-correct JPEGs — that
 * matters, because preparation validates the signature of what it produces, exactly like the server
 * does. Returning `null` from `toBlob` (WebKit under memory pressure) or never calling back at all
 * are modelled explicitly.
 */
interface CanvasRecord {
  canvas: HTMLCanvasElement;
  drawn: Array<{ width: number; height: number; source: unknown }>;
  fillStyles: string[];
  toBlobQualities: Array<number | undefined>;
  toDataUrlQualities: Array<number | undefined>;
}

interface CanvasBehaviour {
  /** `null` models a rejected encode; `undefined` models a callback that never arrives. */
  toBlob?: (quality: number | undefined, size: { width: number; height: number }) => Blob | null | undefined;
  /** `null` removes `toDataURL` from the canvas, like an engine that only implements `toBlob`. */
  toDataURL?: ((quality: number | undefined) => string | null) | null;
  /** Index of the canvas whose 2D context throws, to model canvas loss / allocation failure. */
  failContextOn?: number;
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function jpegDataUrl(width: number, height: number): string {
  return `data:image/jpeg;base64,${base64(jpegBytes(width, height))}`;
}

/** Every encoder call in order, across all canvases: the retry ladder is a sequence, not a set. */
let encodeAttempts: string[] = [];

function installCanvas(behaviour: CanvasBehaviour = {}): CanvasRecord[] {
  encodeAttempts = [];
  const records: CanvasRecord[] = [];
  const createElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tagName: string, options?: ElementCreationOptions) => {
    if (tagName !== 'canvas') return createElement(tagName as keyof HTMLElementTagNameMap, options);
    const record: CanvasRecord = {
      canvas: undefined as unknown as HTMLCanvasElement,
      drawn: [],
      fillStyles: [],
      toBlobQualities: [],
      toDataUrlQualities: [],
    };
    const index = records.length;
    records.push(record);
    const size = { width: 0, height: 0 };
    const context = {
      fillStyle: '#000000',
      fillRect: vi.fn(),
      drawImage: vi.fn((source: unknown) => {
        record.drawn.push({ width: size.width, height: size.height, source });
        record.fillStyles.push(String(context.fillStyle));
      }),
    };
    const canvas: Record<string, unknown> = {
      get width() { return size.width; },
      set width(value: number) { size.width = value; },
      get height() { return size.height; },
      set height(value: number) { size.height = value; },
      getContext: vi.fn(() => {
        if (behaviour.failContextOn === index) throw new RangeError('Canvas allocation failed');
        return context;
      }),
      toBlob: (callback: BlobCallback, _type?: string, quality?: number) => {
        record.toBlobQualities.push(quality);
        encodeAttempts.push(`toBlob:${quality}`);
        const blob = behaviour.toBlob
          ? behaviour.toBlob(quality, { ...size })
          : new Blob([jpegBytes(size.width, size.height) as BlobPart], { type: 'image/jpeg' });
        if (blob === undefined) return; // never calls back
        queueMicrotask(() => callback(blob));
      },
    };
    if (behaviour.toDataURL === null) delete canvas.toDataURL;
    else {
      canvas.toDataURL = (_type?: string, quality?: number) => {
        record.toDataUrlQualities.push(quality);
        encodeAttempts.push(`toDataURL:${quality}`);
        return behaviour.toDataURL ? behaviour.toDataURL(quality) : jpegDataUrl(size.width, size.height);
      };
    }
    record.canvas = canvas as unknown as HTMLCanvasElement;
    return record.canvas;
  });
  return records;
}

/** A controllable `<img>` stand-in: loads on demand, fails, or never settles at all. */
class FakeImage {
  static failure: 'none' | 'error' | 'hang' = 'none';
  static dimensions = { width: 0, height: 0 };
  static sources: string[] = [];

  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  decoding = '';
  style: Record<string, string> = {};
  private currentSource = '';

  get src(): string {
    return this.currentSource;
  }

  set src(value: string) {
    this.currentSource = value;
    if (!value) return; // the pipeline clears the source to release the decoded image
    FakeImage.sources.push(value);
    if (FakeImage.failure === 'hang') return;
    queueMicrotask(() => {
      if (FakeImage.failure === 'error') {
        this.onerror?.();
        return;
      }
      this.naturalWidth = FakeImage.dimensions.width;
      this.naturalHeight = FakeImage.dimensions.height;
      this.onload?.();
    });
  }

  static reset(): void {
    FakeImage.failure = 'none';
    FakeImage.dimensions = { width: 0, height: 0 };
    FakeImage.sources = [];
  }
}

function stubObjectUrl(): { revoke: ReturnType<typeof vi.fn> } {
  const revoke = vi.fn();
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:fake'), revokeObjectURL: revoke });
  return { revoke };
}

function stubBitmap(width: number, height: number): ReturnType<typeof vi.fn> {
  const bitmap = { width, height, close: vi.fn() } as unknown as ImageBitmap;
  const createImageBitmapMock = vi.fn(async () => bitmap);
  vi.stubGlobal('createImageBitmap', createImageBitmapMock);
  return createImageBitmapMock;
}

/** jsdom's Blob has no `arrayBuffer()`, so read through FileReader like the source does. */
async function bytesOf(file: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(new Error('Could not read the prepared file'));
    reader.readAsArrayBuffer(file);
  });
}

async function signature(file: File): Promise<number[]> {
  return Array.from((await bytesOf(file)).subarray(0, 3));
}

function delayHeaderRead(source: File, delayMs: number): void {
  const bytes = jpegBytes(640, 480);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  vi.spyOn(source, 'slice').mockImplementation(() => ({
    arrayBuffer: () => new Promise<ArrayBuffer>((resolve) => setTimeout(() => resolve(buffer), delayMs)),
  }) as Blob);
}

describe('Cloudflare reference-image preparation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    FakeImage.reset();
  });

  it('resizes the temporary copy below 512 pixels and JPEG-compresses it without altering the source File', async () => {
    const source = new File([pngBytes(2048, 1024) as BlobPart], 'facade.png', { type: 'image/png', lastModified: 123 });
    installCanvas();
    const createImageBitmapMock = stubBitmap(2048, 1024);

    const prepared = await prepareCloudflareReferenceImage(source);

    expect(prepared).not.toBe(source);
    expect(prepared.name).toBe('storefront.jpg');
    expect(prepared.type).toBe('image/jpeg');
    expect(prepared.size).toBeGreaterThan(0);
    expect(await signature(prepared)).toEqual([0xff, 0xd8, 0xff]);
    expect(createImageBitmapMock).toHaveBeenCalledWith(source, expect.objectContaining({ resizeWidth: 511 }));
    expect(source.name).toBe('facade.png');
    expect(source.type).toBe('image/png');
  });

  it('preserves small-image dimensions while still re-encoding to JPEG', async () => {
    const source = new File([webpVp8xBytes(320, 200) as BlobPart], 'small.webp', { type: 'image/webp' });
    const records = installCanvas();
    stubBitmap(320, 200);

    await prepareCloudflareReferenceImage(source);

    expect(records).toHaveLength(1);
    expect(records[0].drawn).toEqual([{ width: 320, height: 200, source: expect.anything() }]);
  });

  it('asks createImageBitmap to cap the longest side, using the height for portrait photos', async () => {
    const landscape = jpegFile(4032, 3024, { name: 'landscape.jpg' });
    installCanvas();
    const landscapeBitmap = stubBitmap(4032, 3024);
    await prepareCloudflareReferenceImage(landscape);
    expect(landscapeBitmap.mock.calls[0][1]).toMatchObject({ resizeWidth: 511, resizeQuality: 'high' });
    expect(landscapeBitmap.mock.calls[0][1]).not.toHaveProperty('resizeHeight');

    vi.restoreAllMocks();
    const portrait = jpegFile(4032, 3024, { name: 'portrait.jpg', orientation: 6 }); // displayed 3024x4032
    installCanvas();
    const portraitBitmap = stubBitmap(3024, 4032);
    await prepareCloudflareReferenceImage(portrait);
    expect(portraitBitmap.mock.calls[0][1]).toMatchObject({ resizeHeight: 511 });
    expect(portraitBitmap.mock.calls[0][1]).not.toHaveProperty('resizeWidth');
  });

  it('retries createImageBitmap without the optional resize settings when an engine rejects them', async () => {
    const source = jpegFile(2048, 1536);
    installCanvas();
    const bitmap = { width: 2048, height: 1536, close: vi.fn() } as unknown as ImageBitmap;
    const createImageBitmapMock = vi.fn(async (_source: File, options?: ImageBitmapOptions) => {
      if (options?.resizeWidth || options?.imageOrientation || options?.resizeQuality) {
        throw new TypeError('Unsupported image bitmap option');
      }
      return bitmap;
    });
    vi.stubGlobal('createImageBitmap', createImageBitmapMock);

    const prepared = await prepareCloudflareReferenceImage(source);

    expect(prepared.type).toBe('image/jpeg');
    expect(createImageBitmapMock).toHaveBeenCalledTimes(3);
  });

  it('flattens transparency onto a white matte before encoding to JPEG', async () => {
    const source = new File([pngBytes(400, 400) as BlobPart], 'transparent.png', { type: 'image/png' });
    const records = installCanvas();
    stubBitmap(400, 400);

    await prepareCloudflareReferenceImage(source);

    expect(records[0].fillStyles).toEqual(['#ffffff']);
  });

  it('stages very large photos through a bounded intermediate canvas and releases every canvas', async () => {
    const source = jpegFile(3000, 2000, { name: 'large-but-safe.jpg' });
    const records = installCanvas();
    // No bitmap API on this engine, so the full-resolution <img> path is the one under test.
    vi.stubGlobal('createImageBitmap', undefined);
    stubObjectUrl();
    FakeImage.dimensions = { width: 3000, height: 2000 };
    vi.stubGlobal('Image', FakeImage);

    const prepared = await prepareCloudflareReferenceImage(source);

    expect(records).toHaveLength(2);
    expect(records[0].drawn).toEqual([{ width: 1024, height: 683, source: expect.anything() }]);
    expect(records[1].drawn).toEqual([{ width: 511, height: 341, source: records[0].canvas }]);
    // Both canvases are handed back to the browser instead of being kept alive until collection.
    expect(records.map((record) => [record.canvas.width, record.canvas.height])).toEqual([[0, 0], [0, 0]]);
    expect(prepared.size).toBeGreaterThan(0);
  });

  it('falls back to decoding through an <img> element when createImageBitmap fails', async () => {
    const source = jpegFile(1600, 800, { name: 'fallback.jpg', lastModified: 456 });
    const records = installCanvas();
    const createImageBitmapMock = vi.fn(async () => { throw new Error('createImageBitmap rejected this file'); });
    vi.stubGlobal('createImageBitmap', createImageBitmapMock);
    const { revoke } = stubObjectUrl();
    FakeImage.dimensions = { width: 1600, height: 800 };
    vi.stubGlobal('Image', FakeImage);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const prepared = await prepareCloudflareReferenceImage(source);

    expect(prepared.name).toBe('storefront.jpg');
    expect(prepared.type).toBe('image/jpeg');
    expect(records[0].drawn).toEqual([{ width: 511, height: 256, source: expect.anything() }]);
    expect(await signature(prepared)).toEqual([0xff, 0xd8, 0xff]);
    expect(createImageBitmapMock).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith('blob:fake');
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not retry a timed-out bitmap decode and closes its late result while the img fallback succeeds', async () => {
    const source = jpegFile(1600, 800, { name: 'slow-decoder.jpg' });
    installCanvas();
    const bitmapResolvers: Array<(bitmap: ImageBitmap) => void> = [];
    const lateDecode = new Promise<ImageBitmap>((resolve) => { bitmapResolvers.push(resolve); });
    const createImageBitmapMock = vi.fn(() => lateDecode);
    vi.stubGlobal('createImageBitmap', createImageBitmapMock);
    stubObjectUrl();
    FakeImage.dimensions = { width: 1600, height: 800 };
    vi.stubGlobal('Image', FakeImage);

    const prepared = await prepareCloudflareReferenceImage(source, {
      strategyTimeoutMs: 10,
      totalTimeoutMs: 200,
      encodeTimeoutMs: 30,
    });

    expect(prepared.type).toBe('image/jpeg');
    expect(createImageBitmapMock).toHaveBeenCalledTimes(1);
    expect(FakeImage.sources).toEqual(['blob:fake']);

    const lateBitmap = { width: 1600, height: 800, close: vi.fn() } as unknown as ImageBitmap;
    const resolveLateBitmap = bitmapResolvers[0];
    if (!resolveLateBitmap) throw new Error('The bitmap decoder was not started.');
    resolveLateBitmap(lateBitmap);
    await lateDecode;
    await Promise.resolve();
    expect(lateBitmap.close).toHaveBeenCalledOnce();
  });

  it('includes the header probe in the shared deadline before starting image decoding', async () => {
    const source = jpegFile(640, 480, { name: 'slow-header.jpg' });
    delayHeaderRead(source, 100);
    installCanvas();
    const lateBitmap = { width: 640, height: 480, close: vi.fn() } as unknown as ImageBitmap;
    const decodePromises: Promise<ImageBitmap>[] = [];
    const createImageBitmapMock = vi.fn(() => {
      const pending = new Promise<ImageBitmap>((resolve) => setTimeout(() => resolve(lateBitmap), 250));
      decodePromises.push(pending);
      return pending;
    });
    vi.stubGlobal('createImageBitmap', createImageBitmapMock);
    stubObjectUrl();
    FakeImage.dimensions = { width: 640, height: 480 };
    vi.stubGlobal('Image', FakeImage);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(prepareCloudflareReferenceImage(source, {
      strategyTimeoutMs: 500,
      totalTimeoutMs: 300,
      encodeTimeoutMs: 50,
    })).rejects.toThrow(/timed out/i);

    expect(createImageBitmapMock).toHaveBeenCalledTimes(1);
    expect(FakeImage.sources).toEqual([]);
    const decodePending = decodePromises[0];
    if (!decodePending) throw new Error('The bitmap decoder was not started.');
    await decodePending;
    await Promise.resolve();
    expect(lateBitmap.close).toHaveBeenCalledOnce();
  });

  it('bounds the data-URL fallback by the same deadline that started before header probing', async () => {
    const source = jpegFile(640, 480, { name: 'slow-data-url.jpg' });
    delayHeaderRead(source, 30);
    installCanvas();
    const createImageBitmapMock = vi.fn(async () => { throw new Error('bitmap decoder rejected this image'); });
    vi.stubGlobal('createImageBitmap', createImageBitmapMock);
    stubObjectUrl();
    FakeImage.failure = 'error';
    vi.stubGlobal('Image', FakeImage);

    const readAsDataURL = vi.fn();
    const abort = vi.fn();
    class HangingFileReader {
      result: string | ArrayBuffer | null = null;
      onload: FileReader['onload'] = null;
      onerror: FileReader['onerror'] = null;
      onabort: FileReader['onabort'] = null;
      readAsArrayBuffer = vi.fn();
      readAsDataURL = readAsDataURL;
      abort = abort;
    }
    vi.stubGlobal('FileReader', HangingFileReader as unknown as typeof FileReader);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const timeout = await new Promise<'hung' | 'settled'>((resolve) => {
      const timer = setTimeout(() => resolve('hung'), 300);
      void prepareCloudflareReferenceImage(source, {
        strategyTimeoutMs: 500,
        totalTimeoutMs: 120,
        encodeTimeoutMs: 20,
      }).then(
        () => { clearTimeout(timer); resolve('settled'); },
        () => { clearTimeout(timer); resolve('settled'); },
      );
    });

    expect(timeout).toBe('settled');
    expect(createImageBitmapMock).toHaveBeenCalledTimes(1);
    expect(FakeImage.sources).toEqual(['blob:fake']);
    expect(readAsDataURL).toHaveBeenCalledOnce();
    expect(abort).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledOnce();
  });

  it('uses the toDataURL encoder when canvas.toBlob returns null, the production failure', async () => {
    const source = jpegFile(4032, 3024, { name: 'photo.jpg' });
    const records = installCanvas({ toBlob: () => null });
    stubBitmap(4032, 3024);

    const prepared = await prepareCloudflareReferenceImage(source);

    expect(prepared.type).toBe('image/jpeg');
    expect(prepared.size).toBeGreaterThan(0);
    expect(await signature(prepared)).toEqual([0xff, 0xd8, 0xff]);
    expect(records.length).toBeGreaterThan(0);
    // The same quality is tried with the other encoder before the quality is reduced, so the
    // highest usable quality wins.
    expect(encodeAttempts).toEqual(['toBlob:0.82', 'toDataURL:0.82']);
  });

  it('does not hang when canvas.toBlob never calls back', async () => {
    const source = jpegFile(800, 600);
    installCanvas({ toBlob: () => undefined });
    stubBitmap(800, 600);

    const prepared = await prepareCloudflareReferenceImage(source, { encodeTimeoutMs: 20 });

    expect(prepared.type).toBe('image/jpeg');
    expect(await signature(prepared)).toEqual([0xff, 0xd8, 0xff]);
    expect(encodeAttempts).toEqual(['toBlob:0.82', 'toDataURL:0.82']);
  });

  it('retries at a lower JPEG quality when the best quality yields no usable image', async () => {
    const source = jpegFile(1200, 900);
    installCanvas({
      toBlob: () => new Blob(['not an image' as BlobPart], { type: 'image/jpeg' }),
      toDataURL: (quality) => (quality === 0.7 ? jpegDataUrl(511, 383) : 'data:image/jpeg;base64,Z2FyYmFnZQ=='),
    });
    stubBitmap(1200, 900);

    const prepared = await prepareCloudflareReferenceImage(source);

    expect(await signature(prepared)).toEqual([0xff, 0xd8, 0xff]);
    expect(encodeAttempts).toEqual(['toBlob:0.82', 'toDataURL:0.82', 'toBlob:0.7', 'toDataURL:0.7']);
  });

  it('never returns a file that is not a real image', async () => {
    const source = jpegFile(1000, 1000);
    // Every canvas encodes garbage, and the fallback decoder refuses the file as well.
    installCanvas({
      toBlob: () => new Blob(['garbage' as BlobPart], { type: 'image/jpeg' }),
      toDataURL: () => 'data:image/jpeg;base64,Z2FyYmFnZQ==',
    });
    vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new Error('createImageBitmap rejected this file'); }));
    stubObjectUrl();
    FakeImage.failure = 'error';
    vi.stubGlobal('Image', FakeImage);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(prepareCloudflareReferenceImage(source)).rejects.toThrow('The source image could not be decoded.');
    expect(warn).toHaveBeenCalledOnce();
  });

  it('escalates to the fallback when a canvas cannot be allocated', async () => {
    const source = jpegFile(2048, 1536, { lastModified: 789 });
    const records = installCanvas({ failContextOn: 0 });
    stubBitmap(2048, 1536);
    stubObjectUrl();
    FakeImage.dimensions = { width: 2048, height: 1536 };
    vi.stubGlobal('Image', FakeImage);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const prepared = await prepareCloudflareReferenceImage(source);

    expect(prepared.type).toBe('image/jpeg');
    expect(prepared.lastModified).toBe(789);
    // The failed canvas is released straight away, then the fallback decodes the photo.
    expect(records[0].canvas.width).toBe(0);
    expect(FakeImage.sources).toEqual(['blob:fake']);
    expect(warn).not.toHaveBeenCalled();
  });

  it('falls back to a data URL when blob object URLs are unavailable', async () => {
    const source = jpegFile(900, 700);
    installCanvas();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new Error('no bitmap support'); }));
    vi.stubGlobal('URL', {
      createObjectURL: () => { throw new Error('object URLs are not supported'); },
      revokeObjectURL: vi.fn(),
    });
    FakeImage.dimensions = { width: 900, height: 700 };
    vi.stubGlobal('Image', FakeImage);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const prepared = await prepareCloudflareReferenceImage(source);

    expect(prepared.type).toBe('image/jpeg');
    expect(FakeImage.sources).toHaveLength(1);
    expect(FakeImage.sources[0].startsWith('data:image/jpeg;base64,')).toBe(true);
  });

  it('settles instead of hanging when a decode never completes, and reports the failure', async () => {
    const source = jpegFile(4000, 3000);
    installCanvas();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new Error('createImageBitmap unavailable'); }));
    stubObjectUrl();
    FakeImage.failure = 'hang';
    vi.stubGlobal('Image', FakeImage);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const outcome = await Promise.race([
      prepareCloudflareReferenceImage(source, { strategyTimeoutMs: 30, totalTimeoutMs: 400, encodeTimeoutMs: 30 })
        .then(() => 'settled', () => 'settled'),
      new Promise<string>((resolve) => setTimeout(() => resolve('hung'), 5000)),
    ]);

    expect(outcome).toBe('settled');
    expect(warn).toHaveBeenCalledOnce();
    // Nothing that identifies the customer's photo is logged — dimensions only.
    const [, details] = warn.mock.calls[0];
    expect(details).toMatchObject({ source: 'jpeg 4000x3000' });
    expect(JSON.stringify(details)).not.toContain('storefront.jpg');
  });

  it('surfaces the fallback error when both preparation methods fail', async () => {
    const source = jpegFile(640, 480, { name: 'facade.jpg' });
    installCanvas();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new Error('createImageBitmap rejected this file'); }));
    stubObjectUrl();
    FakeImage.failure = 'error';
    vi.stubGlobal('Image', FakeImage);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(prepareCloudflareReferenceImage(source)).rejects.toThrow('The source image could not be decoded.');
    expect(warn).toHaveBeenCalledOnce();

    const emptySource = jpegFile(640, 480);
    warn.mockClear();
    FakeImage.failure = 'none';
    FakeImage.dimensions = { width: 640, height: 480 };
    await expect(prepareCloudflareReferenceImage(emptySource)).resolves.toBeInstanceOf(File);
  });
});
