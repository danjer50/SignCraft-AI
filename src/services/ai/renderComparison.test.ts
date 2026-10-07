import { afterEach, describe, expect, it, vi } from 'vitest';
import { isUnchangedRender } from './renderComparison';

const SIDE = 96;
const imageUrl = 'data:image/png;base64,iVBORw0KGgo=';
const preparedPhoto = new File(['prepared reference'], 'storefront.jpg', { type: 'image/jpeg' });

function grid(): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(SIDE * SIDE * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = 80 + (offset % 41);
    pixels[offset + 1] = 110;
    pixels[offset + 2] = 150;
    pixels[offset + 3] = 255;
  }
  return pixels;
}

function mockCanvases(source: Uint8ClampedArray, render: Uint8ClampedArray) {
  const contexts = [source, render].map((data) => ({
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ data })),
  }));
  const contextMock = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValueOnce(contexts[0] as unknown as CanvasRenderingContext2D)
    .mockReturnValueOnce(contexts[1] as unknown as CanvasRenderingContext2D);
  return { contexts, contextMock };
}

function mockBitmaps() {
  const bitmaps = [0, 1].map(() => ({ width: SIDE, height: SIDE, close: vi.fn() }));
  const decode = vi.fn()
    .mockResolvedValueOnce(bitmaps[0])
    .mockResolvedValueOnce(bitmaps[1]);
  vi.stubGlobal('createImageBitmap', decode);
  return { bitmaps, decode };
}

function mockImageElements(loads: boolean) {
  const createObjectURL = vi.fn(() => 'blob:local-comparison');
  const revokeObjectURL = vi.fn();
  class LocalURL extends URL {
    static createObjectURL = createObjectURL;
    static revokeObjectURL = revokeObjectURL;
  }
  vi.stubGlobal('URL', LocalURL);
  vi.stubGlobal('Image', function () {
    const image = document.createElement('img');
    Object.defineProperty(image, 'src', {
      set(value: string) {
        if (value && loads) queueMicrotask(() => image.onload?.(new Event('load')));
      },
    });
    return image;
  });
  return { createObjectURL, revokeObjectURL };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('local render comparison', () => {
  it('rejects identical decoded pixels, samples only a 96×96 grid, and closes both bitmaps', async () => {
    const pixels = grid();
    const { contexts } = mockCanvases(pixels, pixels.slice());
    const { bitmaps, decode } = mockBitmaps();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(await isUnchangedRender(preparedPhoto, imageUrl)).toBe(true);
    expect(decode.mock.calls[0][0]).toBe(preparedPhoto);
    expect(decode.mock.calls[1][0].type).toBe('image/png');
    expect(decode.mock.calls[0][1]).toEqual({ resizeWidth: SIDE, resizeHeight: SIDE, resizeQuality: 'high' });
    contexts.forEach((context, index) => {
      expect(context.drawImage).toHaveBeenCalledWith(bitmaps[index], 0, 0, SIDE, SIDE);
      expect(context.getImageData).toHaveBeenCalledWith(0, 0, SIDE, SIDE);
      expect(bitmaps[index].close).toHaveBeenCalledTimes(1);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a re-encoded copy with only tiny pixel noise, not just an equal URL', async () => {
    const source = grid();
    const copy = source.slice();
    for (let offset = 0; offset < copy.length; offset += 4) {
      copy[offset] += 1;
      copy[offset + 1] -= 1;
    }
    mockCanvases(source, copy);
    mockBitmaps();
    expect(await isUnchangedRender(preparedPhoto, 'data:image/jpeg;base64,/9j/AQI=')).toBe(true);
  });

  it('allows even a one-sample local edit instead of relying on a whole-image average', async () => {
    const source = grid();
    const edited = source.slice();
    edited[4 * (SIDE * 20 + 30)] += 40;
    mockCanvases(source, edited);
    mockBitmaps();
    expect(await isUnchangedRender(preparedPhoto, imageUrl)).toBe(false);
  });

  it('allows a broadly changed render even when each channel difference is small', async () => {
    const source = grid();
    const edited = source.slice();
    for (let offset = 0; offset < edited.length; offset += 4) {
      edited[offset] += 3;
      edited[offset + 1] += 3;
      edited[offset + 2] += 3;
    }
    mockCanvases(source, edited);
    mockBitmaps();
    expect(await isUnchangedRender(preparedPhoto, imageUrl)).toBe(false);
  });

  it('fails open if canvas is unavailable without starting a decode', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const { decode } = mockBitmaps();
    expect(await isUnchangedRender(preparedPhoto, imageUrl)).toBe(false);
    expect(decode).not.toHaveBeenCalled();
  });

  it('fails open if a pixel read throws, while still releasing decoded images', async () => {
    const { contexts } = mockCanvases(grid(), grid());
    contexts[1].getImageData.mockImplementation(() => { throw new DOMException('canvas unavailable', 'SecurityError'); });
    const { bitmaps } = mockBitmaps();
    expect(await isUnchangedRender(preparedPhoto, imageUrl)).toBe(false);
    bitmaps.forEach((bitmap) => expect(bitmap.close).toHaveBeenCalledTimes(1));
  });

  it('fails open for a decode failure or an incomplete pixel grid', async () => {
    mockCanvases(new Uint8ClampedArray(4), grid());
    mockBitmaps();
    expect(await isUnchangedRender(preparedPhoto, imageUrl)).toBe(false);

    vi.restoreAllMocks();
    mockCanvases(grid(), grid());
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('decode unsupported')));
    vi.stubGlobal('Image', undefined);
    expect(await isUnchangedRender(preparedPhoto, imageUrl)).toBe(false);
  });

  it('falls back to local image elements when bitmap decoding is unsupported and revokes URLs', async () => {
    mockCanvases(grid(), grid());
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('unsupported')));
    const { createObjectURL, revokeObjectURL } = mockImageElements(true);
    expect(await isUnchangedRender(preparedPhoto, imageUrl)).toBe(true);
    expect(createObjectURL).toHaveBeenCalledTimes(2);
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it('bounds a stuck bitmap decode and closes late bitmaps instead of hanging generation', async () => {
    vi.useFakeTimers();
    mockCanvases(grid(), grid());
    const resolvers: Array<(bitmap: unknown) => void> = [];
    vi.stubGlobal('createImageBitmap', vi.fn(() => new Promise((resolve) => resolvers.push(resolve))));
    const comparison = isUnchangedRender(preparedPhoto, imageUrl);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(await comparison).toBe(false);
    const lateBitmaps = resolvers.map(() => ({ close: vi.fn() }));
    lateBitmaps[0].close.mockImplementationOnce(() => { throw new Error('already released'); });
    resolvers.forEach((resolve, index) => resolve(lateBitmaps[index]));
    await vi.advanceTimersByTimeAsync(0);
    lateBitmaps.forEach((bitmap) => expect(bitmap.close).toHaveBeenCalledTimes(1));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds a stuck image-element fallback even if local URL cleanup fails', async () => {
    vi.useFakeTimers();
    mockCanvases(grid(), grid());
    vi.stubGlobal('createImageBitmap', undefined);
    const { revokeObjectURL } = mockImageElements(false);
    revokeObjectURL.mockImplementation(() => { throw new Error('cleanup unavailable'); });
    const comparison = isUnchangedRender(preparedPhoto, imageUrl);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(await comparison).toBe(false);
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['https://example.invalid/render.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,A'])('fails open on an unsupported input without any network access: %s', async (url) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await isUnchangedRender(preparedPhoto, url)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
