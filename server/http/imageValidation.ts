const signatures: Record<string, (bytes: Uint8Array) => boolean> = {
  'image/jpeg': (bytes) => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  'image/png': (bytes) => bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte),
  'image/webp': (bytes) => bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50,
};

/** Check file magic bytes rather than trusting a browser-supplied MIME type. */
export function hasValidImageSignature(mimeType: string, bytes: Uint8Array): boolean {
  return signatures[mimeType]?.(bytes) ?? false;
}

export async function hasValidImageFileSignature(file: File): Promise<boolean> {
  return hasValidImageSignature(file.type, new Uint8Array(await file.slice(0, 12).arrayBuffer()));
}
