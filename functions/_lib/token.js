// functions/_lib/token.js
// HMAC-SHA256 signed tokens for moderation links.
// Format: {raw-JSON-payload}.{base64url(HMAC signature)}
// The payload is stored as plain JSON (not base64-encoded) so that
// field values remain human-readable in the token string.
// The HMAC is computed over the raw JSON payload string.
// Payload always includes `exp` (unix seconds).

function b64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function signToken(payload, secret, expiresInSeconds) {
  const fullPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + expiresInSeconds };
  const payloadStr = JSON.stringify(fullPayload);
  const sig = await hmac(secret, payloadStr);
  // Encode only the signature; keep payload as raw JSON for readability
  return `${payloadStr}.${b64url(sig)}`;
}

export async function verifyToken(token, secret) {
  if (typeof token !== 'string' || !token.includes('.')) {
    return { ok: false, reason: 'malformed' };
  }

  // Split on the LAST dot so JSON payload (which has no dots) stays intact
  const lastDot = token.lastIndexOf('.');
  const payloadStr = token.slice(0, lastDot);
  const sigB64 = token.slice(lastDot + 1);

  if (!payloadStr || !sigB64) return { ok: false, reason: 'malformed' };

  let expectedSig;
  try {
    expectedSig = new Uint8Array(await hmac(secret, payloadStr));
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  let actualSig;
  try {
    actualSig = fromB64url(sigB64);
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  if (!timingSafeEqual(expectedSig, actualSig)) {
    return { ok: false, reason: 'invalid_signature' };
  }

  let payload;
  try {
    payload = JSON.parse(payloadStr);
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: 'expired' };
  }

  return { ok: true, payload };
}
