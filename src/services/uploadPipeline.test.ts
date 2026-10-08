import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStorefrontPhoto, MAX_PREVIEW_BYTES, readBlobBytes, UploadError } from './upload';
import { jpegFile } from '../test/imageBytes';
import { prepareCloudflareReferenceImage } from './ai/imagePreparation';

vi.mock('./ai/imagePreparation', () => ({ prepareCloudflareReferenceImage: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
describe('bounded initial preview lifecycle', () => {
  it('rejects a decompression-sized image before starting any decoder', async () => {
    vi.mocked(prepareCloudflareReferenceImage).mockClear();
    await expect(createStorefrontPhoto(jpegFile(30000, 30000))).rejects.toMatchObject({ code: 'pixel-budget' });
    expect(prepareCloudflareReferenceImage).not.toHaveBeenCalled();
  });
  it('never falls back to base64 of the original when preview compression fails', async () => {
    vi.mocked(prepareCloudflareReferenceImage).mockRejectedValue(new Error('Canvas unavailable'));
    await expect(createStorefrontPhoto(jpegFile(500, 300))).rejects.toMatchObject({ code: 'preview-unavailable' });
  });
  it('uses only the bounded prepared preview while retaining original bytes', async () => {
    const source = jpegFile(800, 500);
    vi.mocked(prepareCloudflareReferenceImage).mockResolvedValue(jpegFile(511, 300));
    const photo = await createStorefrontPhoto(source);
    expect(photo.file).toBe(source);
    expect(photo.previewUrl).toBe(photo.previewDataUrl);
    expect(photo.previewDataUrl!.length).toBeLessThan(MAX_PREVIEW_BYTES * 2);
    expect(photo.sourceIdentity).toMatch(/^[a-f0-9]{64}$/);
  });
  it('bounds a stuck read and respects cancellation before starting', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(readBlobBytes(new Blob(['x']), controller.signal)).rejects.toMatchObject({ code: 'cancelled' });
    vi.useFakeTimers();
    const stuck = { arrayBuffer: () => new Promise<ArrayBuffer>(() => {}) } as Blob;
    const pending = readBlobBytes(stuck, undefined, 20).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(21);
    expect(await pending).toEqual(new UploadError('timeout'));
  });
});
