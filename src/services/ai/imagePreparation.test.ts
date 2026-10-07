import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareCloudflareReferenceImage } from './imagePreparation';

describe('Cloudflare reference-image preparation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('resizes the temporary copy below 512 pixels and JPEG-compresses it without altering the source File', async () => {
    const source = new File(['original photo'], 'facade.png', { type: 'image/png', lastModified: 123 });
    const bitmap = { width: 2048, height: 1024, close: vi.fn() } as unknown as ImageBitmap;
    const drawImage = vi.fn();
    const fillRect = vi.fn();
    let canvasWidth = 0;
    let canvasHeight = 0;
    const canvas = {
      get width() { return canvasWidth; },
      set width(value: number) { canvasWidth = value; },
      get height() { return canvasHeight; },
      set height(value: number) { canvasHeight = value; },
      getContext: vi.fn(() => ({ fillStyle: '', fillRect, drawImage })),
      toBlob: vi.fn((callback: BlobCallback, type?: string) => callback(new Blob(['compressed jpeg'], { type }))),
    } as unknown as HTMLCanvasElement;
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName, options) =>
      tagName === 'canvas' ? canvas : createElement(tagName, options),
    );
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap));

    const prepared = await prepareCloudflareReferenceImage(source);

    expect(prepared).not.toBe(source);
    expect(prepared.name).toBe('storefront.jpg');
    expect(prepared.type).toBe('image/jpeg');
    expect(prepared.size).toBeGreaterThan(0);
    expect(canvasWidth).toBe(511);
    expect(canvasHeight).toBe(256);
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 511, 256);
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(source.name).toBe('facade.png');
  });

  it('preserves small-image dimensions while still re-encoding to JPEG', async () => {
    const source = new File(['source'], 'small.webp', { type: 'image/webp' });
    const bitmap = { width: 320, height: 200, close: vi.fn() } as unknown as ImageBitmap;
    let width = 0;
    let height = 0;
    const canvas = {
      set width(value: number) { width = value; },
      get width() { return width; },
      set height(value: number) { height = value; },
      get height() { return height; },
      getContext: () => ({ fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() }),
      toBlob: (callback: BlobCallback, type?: string) => callback(new Blob(['small jpeg'], { type })),
    } as unknown as HTMLCanvasElement;
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => tagName === 'canvas' ? canvas : createElement(tagName, options));
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap));

    await prepareCloudflareReferenceImage(source);

    expect(width).toBe(320);
    expect(height).toBe(200);
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  function mockCanvas(onDraw: (width: number, height: number, source: unknown) => void): HTMLCanvasElement {
    let canvasWidth = 0;
    let canvasHeight = 0;
    return {
      get width() { return canvasWidth; },
      set width(value: number) { canvasWidth = value; },
      get height() { return canvasHeight; },
      set height(value: number) { canvasHeight = value; },
      getContext: () => ({ fillStyle: '', fillRect: vi.fn(), drawImage: (source: unknown) => onDraw(canvasWidth, canvasHeight, source) }),
      toBlob: (callback: BlobCallback, type?: string) => callback(new Blob(['jpeg bytes'], { type })),
    } as unknown as HTMLCanvasElement;
  }

  /** A controllable stand-in for `Image` that fires `onload`/`onerror` on demand. */
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 0;
    naturalHeight = 0;
    style: Record<string, string> = {};
    decoding = '';
    private _src = '';
    get src() { return this._src; }
    set src(value: string) {
      this._src = value;
      queueMicrotask(() => {
        if (FakeImage.shouldFail) this.onerror?.();
        else { this.naturalWidth = FakeImage.dimensions.width; this.naturalHeight = FakeImage.dimensions.height; this.onload?.(); }
      });
    }
    static shouldFail = false;
    static dimensions = { width: 0, height: 0 };
  }

  it('falls back to decoding through an <img> element when createImageBitmap fails', async () => {
    const source = new File(['original photo'], 'facade.jpg', { type: 'image/jpeg', lastModified: 456 });
    vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new Error('createImageBitmap rejected this file'); }));
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:fake'), revokeObjectURL: vi.fn() });
    FakeImage.shouldFail = false;
    FakeImage.dimensions = { width: 1600, height: 800 };
    vi.stubGlobal('Image', FakeImage);

    const canvas = mockCanvas(() => {});
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => tagName === 'canvas' ? canvas : createElement(tagName, options));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const prepared = await prepareCloudflareReferenceImage(source);

    expect(prepared.name).toBe('storefront.jpg');
    expect(prepared.type).toBe('image/jpeg');
    expect(canvas.width).toBe(511);
    expect(canvas.height).toBe(256);
    expect(warn).not.toHaveBeenCalled();
  });

  it('surfaces the fallback error when both preparation methods fail', async () => {
    const source = new File(['original photo'], 'facade.jpg', { type: 'image/jpeg' });
    vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new Error('createImageBitmap rejected this file'); }));
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:fake'), revokeObjectURL: vi.fn() });
    FakeImage.shouldFail = true;
    vi.stubGlobal('Image', FakeImage);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(prepareCloudflareReferenceImage(source)).rejects.toThrow('The source image could not be decoded.');
    expect(warn).toHaveBeenCalledOnce();
  });
});
