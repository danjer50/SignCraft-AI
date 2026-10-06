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
});
