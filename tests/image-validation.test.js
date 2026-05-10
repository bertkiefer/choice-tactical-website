import { describe, it, expect } from 'vitest';
import { validateImage, MAX_PHOTO_BYTES } from '../functions/_lib/image-validation.js';

// Real magic bytes for each format
const JPEG_HEADER = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]);
const PNG_HEADER = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
const WEBP_HEADER = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50,
]);
const GIF_HEADER = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);

function makeFile(bytes, mime, name = 'test') {
  // Pad to 1KB so Blob has reasonable size
  const padded = new Uint8Array(1024);
  padded.set(bytes);
  return new File([padded], name, { type: mime });
}

describe('validateImage', () => {
  it('accepts a valid JPEG', async () => {
    const result = await validateImage(makeFile(JPEG_HEADER, 'image/jpeg'));
    expect(result.ok).toBe(true);
    expect(result.ext).toBe('jpg');
  });

  it('accepts a valid PNG', async () => {
    const result = await validateImage(makeFile(PNG_HEADER, 'image/png'));
    expect(result.ok).toBe(true);
    expect(result.ext).toBe('png');
  });

  it('accepts a valid WebP', async () => {
    const result = await validateImage(makeFile(WEBP_HEADER, 'image/webp'));
    expect(result.ok).toBe(true);
    expect(result.ext).toBe('webp');
  });

  it('rejects a GIF', async () => {
    const result = await validateImage(makeFile(GIF_HEADER, 'image/gif'));
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('unsupported_format');
  });

  it('rejects a JPEG MIME with PNG bytes (mismatch)', async () => {
    const result = await validateImage(makeFile(PNG_HEADER, 'image/jpeg'));
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('magic_bytes_mismatch');
  });

  it('rejects a file over 8 MB', async () => {
    const huge = new Uint8Array(MAX_PHOTO_BYTES + 1);
    huge.set(JPEG_HEADER);
    const file = new File([huge], 'big.jpg', { type: 'image/jpeg' });
    const result = await validateImage(file);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('too_large');
  });
});
