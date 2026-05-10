// functions/_lib/image-validation.js
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // 8 MB

const SIGNATURES = {
  jpeg: [{ bytes: [0xFF, 0xD8, 0xFF], offset: 0 }],
  png:  [{ bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], offset: 0 }],
  webp: [
    { bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 },
    { bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 },
  ],
};

const MIME_TO_FORMAT = {
  'image/jpeg': { format: 'jpeg', ext: 'jpg' },
  'image/png':  { format: 'png',  ext: 'png' },
  'image/webp': { format: 'webp', ext: 'webp' },
};

function matchesSignature(bytes, format) {
  return SIGNATURES[format].every(({ bytes: sig, offset }) =>
    sig.every((b, i) => bytes[offset + i] === b)
  );
}

export async function validateImage(file) {
  if (!file || typeof file.size !== 'number') {
    return { ok: false, reason: 'no_file' };
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return { ok: false, reason: 'too_large' };
  }
  const mimeMap = MIME_TO_FORMAT[file.type];
  if (!mimeMap) {
    return { ok: false, reason: 'unsupported_format' };
  }
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!matchesSignature(head, mimeMap.format)) {
    return { ok: false, reason: 'magic_bytes_mismatch' };
  }
  return { ok: true, ext: mimeMap.ext, format: mimeMap.format };
}
