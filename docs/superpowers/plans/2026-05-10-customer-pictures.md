# Customer Pictures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let customers submit up to 3 photos + a short caption per product, with email-based one-click moderation, surfaced in a lightbox launched from a button under the gallery thumbnails on AXIS and Stack product pages.

**Architecture:** Three Cloudflare Pages Functions endpoints (submit / moderate / read) backed by D1 (metadata) and R2 (photos). HMAC-signed tokens secure the moderation links sent via Resend. Frontend is vanilla JS extending the existing `js/shop.js` render path.

**Tech Stack:** Cloudflare Pages Functions (ESM), D1 (SQLite), R2 (object storage), Resend (email), Cloudflare Turnstile (bot protection), vitest (unit tests for pure helpers). No bundler — frontend stays vanilla JS loaded via `<script src>`.

**Spec:** `docs/superpowers/specs/2026-05-10-customer-pictures-design.md`

---

## File Structure

**New:**
- `wrangler.toml` — Pages project config + local D1 / R2 bindings
- `migrations/0001_create_customer_pictures.sql` — D1 schema
- `vitest.config.js` — test runner config
- `functions/_lib/token.js` — HMAC sign/verify for moderation tokens
- `functions/_lib/image-validation.js` — MIME + magic-byte check, size cap
- `functions/_lib/turnstile.js` — Cloudflare Turnstile verify wrapper
- `functions/_lib/email.js` — Resend moderation email composer
- `functions/_lib/cleanup.js` — opportunistic cleanup of old pending rows
- `functions/api/customer-pictures/submit.js` — POST submit endpoint
- `functions/api/customer-pictures/moderate.js` — GET approve/reject endpoint
- `functions/api/customer-pictures/[slug].js` — GET approved pictures for a product
- `js/customer-pictures.js` — frontend lightbox + submit form
- `tests/token.test.js`
- `tests/image-validation.test.js`
- `tests/turnstile.test.js`

**Modified:**
- `package.json` — add vitest devDep, test scripts
- `js/shop.js` — render Customer Pictures button under thumbnails (around line 350)
- `css/shop.css` — button + lightbox + form styles
- `shop/products.json` — add `customerPictures: true` on `the-axis` + `the-stack`
- `shop/product.html` — add Turnstile script include

**Cloudflare resources (created via Wrangler CLI / dashboard, not committed):**
- D1 database: `customer_pictures` (production + local)
- R2 bucket: `choice-tactical-customer-pictures` (production)
- Pages env vars: `TURNSTILE_SECRET_KEY`, `TURNSTILE_SITE_KEY`, `MODERATION_HMAC_SECRET`, `MODERATION_EMAIL_TO`, `R2_PUBLIC_BASE_URL`

---

## Task 1: Set up vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.js`

- [ ] **Step 1: Install vitest**

```bash
cd /Users/bert_kiefer_cp_home/choice-tactical-website
npm install --save-dev vitest@^2.1.0
```

Expected: vitest added to devDependencies, no breakage.

- [ ] **Step 2: Create vitest.config.js**

```javascript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
  },
});
```

- [ ] **Step 3: Add test scripts to package.json**

In `package.json`, add inside `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Verify test runner works**

```bash
npm test
```

Expected: vitest runs, reports "No test files found" (or similar). Exit code 0 acceptable; if non-zero, that's fine — we'll fix once Task 4 adds the first test.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.js
git commit -m "build: add vitest test runner"
```

---

## Task 2: Create wrangler.toml with D1 + R2 bindings

**Files:**
- Create: `wrangler.toml`

- [ ] **Step 1: Create wrangler.toml**

```toml
name = "choice-tactical-website"
compatibility_date = "2025-01-01"
pages_build_output_dir = "."

[[d1_databases]]
binding = "DB"
database_name = "customer_pictures"
database_id = "REPLACE_WITH_PRODUCTION_ID"

[[r2_buckets]]
binding = "CUSTOMER_PICTURES"
bucket_name = "choice-tactical-customer-pictures"
preview_bucket_name = "choice-tactical-customer-pictures-preview"

[vars]
R2_PUBLIC_BASE_URL = "https://customer-pictures.choice-tactical.com"
```

(The `database_id` placeholder is filled in Task 14 after creating the production D1 in Cloudflare. Local dev works without it via `--local` flag.)

- [ ] **Step 2: Commit**

```bash
git add wrangler.toml
git commit -m "build: add wrangler.toml with D1 + R2 bindings"
```

---

## Task 3: Create D1 schema migration

**Files:**
- Create: `migrations/0001_create_customer_pictures.sql`

- [ ] **Step 1: Create migration file**

```sql
-- migrations/0001_create_customer_pictures.sql
CREATE TABLE customer_pictures (
  id TEXT PRIMARY KEY,
  product_slug TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  caption TEXT NOT NULL,
  photo_keys TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','approved')),
  submitted_at INTEGER NOT NULL,
  moderated_at INTEGER,
  ip_hash TEXT
);

CREATE INDEX idx_product_status ON customer_pictures(product_slug, status);
CREATE INDEX idx_status_submitted ON customer_pictures(status, submitted_at);
CREATE INDEX idx_ip_submitted ON customer_pictures(ip_hash, submitted_at);
```

- [ ] **Step 2: Apply migration locally (creates a local SQLite file under .wrangler/)**

```bash
npx wrangler d1 migrations apply customer_pictures --local
```

Expected: "✅ Successfully applied migrations" or similar. Creates the local `.wrangler/state/v3/d1/...` SQLite file.

- [ ] **Step 3: Verify table exists locally**

```bash
npx wrangler d1 execute customer_pictures --local --command="SELECT name FROM sqlite_master WHERE type='table';"
```

Expected: output includes `customer_pictures`.

- [ ] **Step 4: Commit**

```bash
git add migrations/0001_create_customer_pictures.sql
git commit -m "db: add customer_pictures table migration"
```

---

## Task 4: HMAC moderation token helper (TDD)

**Files:**
- Create: `tests/token.test.js`
- Create: `functions/_lib/token.js`

- [ ] **Step 1: Write failing tests**

```javascript
// tests/token.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { signToken, verifyToken } from '../functions/_lib/token.js';

const SECRET = 'test-secret-key-for-hmac-do-not-use-in-prod';

describe('token', () => {
  it('round-trips a valid token', async () => {
    const token = await signToken({ id: 'abc', action: 'approve' }, SECRET, 3600);
    const result = await verifyToken(token, SECRET);
    expect(result.ok).toBe(true);
    expect(result.payload.id).toBe('abc');
    expect(result.payload.action).toBe('approve');
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signToken({ id: 'abc', action: 'approve' }, SECRET, 3600);
    const result = await verifyToken(token, 'wrong-secret');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid_signature');
  });

  it('rejects an expired token', async () => {
    const token = await signToken({ id: 'abc', action: 'approve' }, SECRET, -1);
    const result = await verifyToken(token, SECRET);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('expired');
  });

  it('rejects a tampered payload', async () => {
    const token = await signToken({ id: 'abc', action: 'approve' }, SECRET, 3600);
    const tampered = token.replace(/approve/g, 'reject');
    const result = await verifyToken(tampered, SECRET);
    expect(result.ok).toBe(false);
  });

  it('rejects a malformed token', async () => {
    const result = await verifyToken('not-a-real-token', SECRET);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('malformed');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/token.test.js
```

Expected: all 5 tests FAIL with "Cannot find module" or "function not defined."

- [ ] **Step 3: Implement token helper**

```javascript
// functions/_lib/token.js
// HMAC-SHA256 signed tokens for moderation links.
// Format: base64url(JSON payload).base64url(HMAC signature)
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
  const payloadB64 = b64url(new TextEncoder().encode(payloadStr));
  const sig = await hmac(secret, payloadB64);
  return `${payloadB64}.${b64url(sig)}`;
}

export async function verifyToken(token, secret) {
  if (typeof token !== 'string' || !token.includes('.')) {
    return { ok: false, reason: 'malformed' };
  }
  const [payloadB64, sigB64] = token.split('.');
  if (!payloadB64 || !sigB64) return { ok: false, reason: 'malformed' };

  let expectedSig;
  try {
    expectedSig = new Uint8Array(await hmac(secret, payloadB64));
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
    payload = JSON.parse(new TextDecoder().decode(fromB64url(payloadB64)));
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: 'expired' };
  }

  return { ok: true, payload };
}
```

- [ ] **Step 4: Run tests to verify all pass**

```bash
npm test -- tests/token.test.js
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/token.js tests/token.test.js
git commit -m "feat: add HMAC moderation token helper"
```

---

## Task 5: Image validation helper (TDD)

**Files:**
- Create: `tests/image-validation.test.js`
- Create: `functions/_lib/image-validation.js`

- [ ] **Step 1: Write failing tests**

```javascript
// tests/image-validation.test.js
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/image-validation.test.js
```

Expected: all 6 tests FAIL.

- [ ] **Step 3: Implement validation helper**

```javascript
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
```

- [ ] **Step 4: Run tests to verify all pass**

```bash
npm test -- tests/image-validation.test.js
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/image-validation.js tests/image-validation.test.js
git commit -m "feat: add image validation helper (MIME + magic bytes + size cap)"
```

---

## Task 6: Turnstile verify helper

**Files:**
- Create: `tests/turnstile.test.js`
- Create: `functions/_lib/turnstile.js`

- [ ] **Step 1: Write failing tests with mocked fetch**

```javascript
// tests/turnstile.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifyTurnstile } from '../functions/_lib/turnstile.js';

describe('verifyTurnstile', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true on success response', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    const ok = await verifyTurnstile('test-token', 'test-secret', '1.2.3.4');
    expect(ok).toBe(true);
  });

  it('returns false on failure response', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] }),
    });
    const ok = await verifyTurnstile('test-token', 'test-secret', '1.2.3.4');
    expect(ok).toBe(false);
  });

  it('returns false on network failure', async () => {
    global.fetch.mockRejectedValue(new Error('network down'));
    const ok = await verifyTurnstile('test-token', 'test-secret', '1.2.3.4');
    expect(ok).toBe(false);
  });

  it('returns false on missing token', async () => {
    const ok = await verifyTurnstile('', 'test-secret', '1.2.3.4');
    expect(ok).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/turnstile.test.js
```

Expected: 4 tests FAIL.

- [ ] **Step 3: Implement Turnstile helper**

```javascript
// functions/_lib/turnstile.js
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstile(token, secret, ip) {
  if (!token || !secret) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set('remoteip', ip);
  try {
    const resp = await fetch(VERIFY_URL, {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    if (!resp.ok) return false;
    const data = await resp.json();
    return data.success === true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run tests to verify all pass**

```bash
npm test -- tests/turnstile.test.js
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/turnstile.js tests/turnstile.test.js
git commit -m "feat: add Turnstile verification helper"
```

---

## Task 7: Resend moderation email helper

**Files:**
- Create: `functions/_lib/email.js`

- [ ] **Step 1: Implement email composer + sender**

```javascript
// functions/_lib/email.js
const RESEND_API = 'https://api.resend.com/emails';

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function buildModerationEmail({
  productName,
  customerName,
  customerEmail,
  caption,
  photoUrls,
  approveUrl,
  rejectUrl,
}) {
  const photoTags = photoUrls.map(url =>
    `<img src="${escapeHtml(url)}" alt="" style="width:160px;height:160px;object-fit:cover;border-radius:6px;margin-right:8px;border:1px solid #ddd">`
  ).join('');

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#222">
  <h2 style="margin:0 0 16px">New Customer Picture — ${escapeHtml(productName)}</h2>
  <p style="margin:0 0 4px"><strong>From:</strong> ${escapeHtml(customerName)} &lt;${escapeHtml(customerEmail)}&gt;</p>
  <p style="margin:0 0 16px"><strong>Caption:</strong> ${escapeHtml(caption)}</p>
  <div style="display:flex;flex-wrap:wrap;margin-bottom:24px">${photoTags}</div>
  <table cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="padding-right:8px"><a href="${escapeHtml(approveUrl)}" style="display:inline-block;background:#2e7d32;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">✓ APPROVE</a></td>
    <td><a href="${escapeHtml(rejectUrl)}" style="display:inline-block;background:#c62828;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">✗ REJECT</a></td>
  </tr></table>
  <p style="margin-top:24px;font-size:12px;color:#888">Links expire in 24 hours.</p>
</body></html>`;

  const subject = `New Customer Picture — ${productName}`;
  return { subject, html };
}

export async function sendModerationEmail({ apiKey, from, to, subject, html }) {
  const resp = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Resend send failed: ${resp.status} ${text}`);
  }
  return resp.json();
}
```

- [ ] **Step 2: Commit**

```bash
git add functions/_lib/email.js
git commit -m "feat: add Resend moderation email helper"
```

---

## Task 8: Cleanup helper for old pending submissions

**Files:**
- Create: `functions/_lib/cleanup.js`

- [ ] **Step 1: Implement opportunistic cleanup**

```javascript
// functions/_lib/cleanup.js
const PENDING_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export async function cleanupOldPending(env) {
  const cutoff = Math.floor(Date.now() / 1000) - PENDING_TTL_SECONDS;

  // Find expired pending rows so we can delete their R2 photos
  const { results } = await env.DB
    .prepare("SELECT id, photo_keys FROM customer_pictures WHERE status = 'pending' AND submitted_at < ?")
    .bind(cutoff)
    .all();

  if (!results || results.length === 0) return { deleted: 0 };

  for (const row of results) {
    let keys;
    try {
      keys = JSON.parse(row.photo_keys);
    } catch {
      keys = [];
    }
    for (const key of keys) {
      try { await env.CUSTOMER_PICTURES.delete(key); } catch {}
    }
  }

  await env.DB
    .prepare("DELETE FROM customer_pictures WHERE status = 'pending' AND submitted_at < ?")
    .bind(cutoff)
    .run();

  return { deleted: results.length };
}
```

- [ ] **Step 2: Commit**

```bash
git add functions/_lib/cleanup.js
git commit -m "feat: add opportunistic cleanup of old pending submissions"
```

---

## Task 9: Submit endpoint

**Files:**
- Create: `functions/api/customer-pictures/submit.js`

- [ ] **Step 1: Implement submit handler**

```javascript
// functions/api/customer-pictures/submit.js
import { validateImage, MAX_PHOTO_BYTES } from '../../_lib/image-validation.js';
import { verifyTurnstile } from '../../_lib/turnstile.js';
import { signToken } from '../../_lib/token.js';
import { buildModerationEmail, sendModerationEmail } from '../../_lib/email.js';
import { cleanupOldPending } from '../../_lib/cleanup.js';

const ALLOWED_SLUGS = ['the-axis', 'the-stack'];
const PRODUCT_NAMES = { 'the-axis': 'The AXIS', 'the-stack': 'The Stack' };
const MAX_PHOTOS = 3;
const RATE_LIMIT_WINDOW_SECONDS = 3600;
const RATE_LIMIT_MAX = 3;
const TOKEN_EXPIRY_SECONDS = 24 * 60 * 60;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function hashIp(ip) {
  const data = new TextEncoder().encode(ip || 'unknown');
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function uuid() {
  return crypto.randomUUID();
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const ip = request.headers.get('cf-connecting-ip') || '';

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'Invalid form data' }, 400);
  }

  const productSlug = String(form.get('productSlug') || '').trim();
  const customerName = String(form.get('name') || '').trim();
  const customerEmail = String(form.get('email') || '').trim();
  const caption = String(form.get('caption') || '').trim();
  const turnstileToken = String(form.get('turnstileToken') || '');
  const photos = form.getAll('photo').filter(p => p && typeof p === 'object' && 'arrayBuffer' in p);

  // ── Field validation ─────────────────────────────
  if (!ALLOWED_SLUGS.includes(productSlug)) {
    return json({ error: 'Unknown product' }, 400);
  }
  if (customerName.length < 2 || customerName.length > 60) {
    return json({ error: 'Name must be 2–60 characters' }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail) || customerEmail.length > 120) {
    return json({ error: 'Invalid email address' }, 400);
  }
  if (caption.length < 1 || caption.length > 140) {
    return json({ error: 'Caption must be 1–140 characters' }, 400);
  }
  if (photos.length < 1 || photos.length > MAX_PHOTOS) {
    return json({ error: `Submit between 1 and ${MAX_PHOTOS} photos` }, 400);
  }

  // ── Turnstile ──────────────────────────────────────
  const turnstileOk = await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET_KEY, ip);
  if (!turnstileOk) {
    return json({ error: 'Bot check failed — please refresh and try again' }, 400);
  }

  // ── Rate limit ─────────────────────────────────────
  const ipHash = await hashIp(ip);
  const windowStart = Math.floor(Date.now() / 1000) - RATE_LIMIT_WINDOW_SECONDS;
  const { results: rlRows } = await env.DB
    .prepare("SELECT COUNT(*) AS n FROM customer_pictures WHERE ip_hash = ? AND submitted_at > ?")
    .bind(ipHash, windowStart)
    .all();
  if (rlRows[0].n >= RATE_LIMIT_MAX) {
    return json({ error: 'Too many submissions — please try again later' }, 429);
  }

  // ── Validate each photo ────────────────────────────
  const validatedPhotos = [];
  for (const photo of photos) {
    const result = await validateImage(photo);
    if (!result.ok) {
      return json({ error: `Photo rejected: ${result.reason}` }, 400);
    }
    validatedPhotos.push({ photo, ext: result.ext });
  }

  // ── Upload photos to R2 ────────────────────────────
  const submissionId = uuid();
  const photoKeys = [];
  for (let i = 0; i < validatedPhotos.length; i++) {
    const { photo, ext } = validatedPhotos[i];
    const key = `${submissionId}/${i}.${ext}`;
    await env.CUSTOMER_PICTURES.put(key, photo.stream(), {
      httpMetadata: { contentType: photo.type },
    });
    photoKeys.push(key);
  }

  // ── Insert D1 row ──────────────────────────────────
  const now = Math.floor(Date.now() / 1000);
  await env.DB
    .prepare(`INSERT INTO customer_pictures
      (id, product_slug, customer_name, customer_email, caption, photo_keys, status, submitted_at, ip_hash)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`)
    .bind(submissionId, productSlug, customerName, customerEmail, caption, JSON.stringify(photoKeys), now, ipHash)
    .run();

  // ── Send moderation email ──────────────────────────
  const origin = new URL(request.url).origin;
  const approveToken = await signToken({ id: submissionId, action: 'approve' }, env.MODERATION_HMAC_SECRET, TOKEN_EXPIRY_SECONDS);
  const rejectToken = await signToken({ id: submissionId, action: 'reject' }, env.MODERATION_HMAC_SECRET, TOKEN_EXPIRY_SECONDS);
  const photoUrls = photoKeys.map(key => `${env.R2_PUBLIC_BASE_URL}/${key}`);

  const { subject, html } = buildModerationEmail({
    productName: PRODUCT_NAMES[productSlug],
    customerName,
    customerEmail,
    caption,
    photoUrls,
    approveUrl: `${origin}/api/customer-pictures/moderate?token=${encodeURIComponent(approveToken)}`,
    rejectUrl: `${origin}/api/customer-pictures/moderate?token=${encodeURIComponent(rejectToken)}`,
  });

  try {
    await sendModerationEmail({
      apiKey: env.RESEND_API_KEY,
      from: env.ORDER_EMAIL_FROM,
      to: env.MODERATION_EMAIL_TO,
      subject,
      html,
    });
  } catch (err) {
    // Email failure shouldn't lose the submission — log but still return success.
    console.error('Resend send failed:', err);
  }

  // ── Opportunistic cleanup (best-effort) ────────────
  try { await cleanupOldPending(env); } catch (err) { console.error('cleanup failed:', err); }

  return json({ ok: true, message: 'Submitted for review' });
}
```

- [ ] **Step 2: Smoke-test with wrangler dev**

```bash
# In one terminal:
npx wrangler pages dev . --d1=DB=customer_pictures --r2=CUSTOMER_PICTURES --local
```

In another terminal, send a multipart submission with curl:

```bash
# Create a tiny test JPEG locally
printf '\xFF\xD8\xFF\xE0' > /tmp/test.jpg && dd if=/dev/zero bs=1024 count=10 >> /tmp/test.jpg 2>/dev/null

curl -i -X POST http://localhost:8788/api/customer-pictures/submit \
  -F productSlug=the-axis \
  -F name="Test User" \
  -F email="test@example.com" \
  -F caption="Looks great" \
  -F turnstileToken="dummy" \
  -F photo=@/tmp/test.jpg
```

Expected: `400` with `{"error":"Bot check failed..."}` because Turnstile is real. To bypass for local testing, temporarily set `TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA` in `.dev.vars` (Cloudflare's "always passes" test secret) and retry.

After fixing Turnstile, expected: `200 {"ok":true,...}`. Verify:

```bash
npx wrangler d1 execute customer_pictures --local --command="SELECT id, product_slug, status FROM customer_pictures;"
```

Expected: one `pending` row.

- [ ] **Step 3: Commit**

```bash
git add functions/api/customer-pictures/submit.js
git commit -m "feat: add customer pictures submit endpoint"
```

---

## Task 10: Moderate endpoint

**Files:**
- Create: `functions/api/customer-pictures/moderate.js`

- [ ] **Step 1: Implement moderate handler**

```javascript
// functions/api/customer-pictures/moderate.js
import { verifyToken } from '../../_lib/token.js';

function htmlPage(title, body, status = 200) {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${title} — Choice Tactical</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; background: #0e1116; color: #e4e4e4; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
  .card { max-width: 480px; padding: 32px; text-align: center; }
  h1 { color: #ffb84d; margin: 0 0 12px; }
  p { color: #ccc; margin: 8px 0; line-height: 1.5; }
  .ok { color: #4caf50; }
  .err { color: #f44336; }
</style></head><body><div class="card">${body}</div></body></html>`;
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return htmlPage('Missing token', `<h1>Missing token</h1><p>This link is invalid.</p>`, 400);
  }

  const result = await verifyToken(token, env.MODERATION_HMAC_SECRET);
  if (!result.ok) {
    const msg = result.reason === 'expired'
      ? 'This link has expired. Submissions stay pending; you can find this one in the database if needed.'
      : 'This link is invalid or has been tampered with.';
    return htmlPage('Link invalid', `<h1 class="err">Link ${result.reason}</h1><p>${msg}</p>`, 400);
  }

  const { id, action } = result.payload;
  if (!['approve', 'reject'].includes(action)) {
    return htmlPage('Bad action', `<h1 class="err">Unknown action</h1>`, 400);
  }

  const row = await env.DB
    .prepare('SELECT id, status, photo_keys FROM customer_pictures WHERE id = ?')
    .bind(id)
    .first();

  if (!row) {
    return htmlPage('Already moderated', `<h1>Already handled</h1><p>This submission was already approved or rejected.</p>`);
  }

  if (row.status === 'approved') {
    return htmlPage('Already approved', `<h1 class="ok">Already approved</h1><p>This picture is already live on the product page.</p>`);
  }

  if (action === 'approve') {
    await env.DB
      .prepare("UPDATE customer_pictures SET status = 'approved', moderated_at = ? WHERE id = ?")
      .bind(Math.floor(Date.now() / 1000), id)
      .run();
    return htmlPage('Approved', `<h1 class="ok">✓ Approved</h1><p>The picture is now live on the product page.</p>`);
  }

  // Reject: delete row + photos
  let keys = [];
  try { keys = JSON.parse(row.photo_keys); } catch {}
  for (const key of keys) {
    try { await env.CUSTOMER_PICTURES.delete(key); } catch {}
  }
  await env.DB.prepare('DELETE FROM customer_pictures WHERE id = ?').bind(id).run();

  return htmlPage('Rejected', `<h1 class="err">✗ Rejected</h1><p>The submission and its photos have been deleted.</p>`);
}
```

- [ ] **Step 2: Smoke test approve flow**

With wrangler dev still running, take a submission ID from Task 9 and a fresh approve token (you can generate one in a quick Node REPL or manually decode the email URL). Easier: trigger a real submission, copy the URL out of the captured email payload (you can comment out the actual Resend send during local dev and console.log the approve/reject URLs instead).

Approve a submission:

```bash
curl -i "http://localhost:8788/api/customer-pictures/moderate?token=<APPROVE_TOKEN>"
```

Expected: `200` HTML page with "✓ Approved". Then:

```bash
npx wrangler d1 execute customer_pictures --local --command="SELECT id, status FROM customer_pictures;"
```

Expected: row's `status` is now `approved`.

- [ ] **Step 3: Smoke test reject flow**

Submit another picture, copy the reject token, hit it. Expected: `200` HTML "✗ Rejected", D1 row gone, R2 keys removed.

- [ ] **Step 4: Smoke test idempotency**

Hit an approve token a second time after approval. Expected: "Already approved" page, no error.

- [ ] **Step 5: Commit**

```bash
git add functions/api/customer-pictures/moderate.js
git commit -m "feat: add customer pictures moderate endpoint"
```

---

## Task 11: Read endpoint

**Files:**
- Create: `functions/api/customer-pictures/[slug].js`

- [ ] **Step 1: Implement read handler**

```javascript
// functions/api/customer-pictures/[slug].js
const ALLOWED_SLUGS = ['the-axis', 'the-stack'];

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=300, s-maxage=300',
      ...extraHeaders,
    },
  });
}

export async function onRequestGet(context) {
  const { params, env } = context;
  const slug = String(params.slug || '');

  if (!ALLOWED_SLUGS.includes(slug)) {
    return json({ error: 'Unknown product' }, 404);
  }

  const { results } = await env.DB
    .prepare(`SELECT id, customer_name, caption, photo_keys, submitted_at
              FROM customer_pictures
              WHERE product_slug = ? AND status = 'approved'
              ORDER BY moderated_at DESC`)
    .bind(slug)
    .all();

  const items = (results || []).map(row => {
    let keys = [];
    try { keys = JSON.parse(row.photo_keys); } catch {}
    return {
      id: row.id,
      name: row.customer_name,
      caption: row.caption,
      photoUrls: keys.map(k => `${env.R2_PUBLIC_BASE_URL}/${k}`),
      submittedAt: row.submitted_at,
    };
  });

  return json({ items, count: items.length });
}
```

- [ ] **Step 2: Smoke test**

```bash
curl -s http://localhost:8788/api/customer-pictures/the-axis | head
curl -s http://localhost:8788/api/customer-pictures/nonsense | head
```

Expected: first returns `{"items":[...],"count":N}`, second returns `{"error":"Unknown product"}` with status 404.

- [ ] **Step 3: Commit**

```bash
git add functions/api/customer-pictures/[slug].js
git commit -m "feat: add customer pictures read endpoint"
```

---

## Task 12: Add customerPictures flag in products.json

**Files:**
- Modify: `shop/products.json`

- [ ] **Step 1: Add `customerPictures: true` to AXIS and Stack entries**

Open `shop/products.json`. For the entries with `slug: "the-axis"` and `slug: "the-stack"`, add `"customerPictures": true` to each top-level product object (alongside `slug`, `name`, etc.).

- [ ] **Step 2: Verify JSON is still valid**

```bash
node -e "JSON.parse(require('fs').readFileSync('shop/products.json','utf8'))"
```

Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add shop/products.json
git commit -m "shop: enable customer pictures on AXIS + Stack"
```

---

## Task 13: Add Customer Pictures button under gallery thumbnails

**Files:**
- Modify: `js/shop.js`
- Modify: `css/shop.css`

- [ ] **Step 1: Find the gallery render in js/shop.js**

The product gallery is rendered around line 350 of `js/shop.js` (the `'<div class="product-gallery">' + ...` template). After the closing `</div>` of `.product-gallery-thumbs`, append a button container.

- [ ] **Step 2: Update gallery template in js/shop.js**

Replace the existing gallery template block (around lines 350-360) with:

```javascript
var galleryButton = product.customerPictures
  ? '<div class="customer-pictures-button-wrap">' +
    '<button type="button" class="customer-pictures-button" data-slug="' + product.slug + '">' +
      '<span class="customer-pictures-icon">📷</span>' +
      '<span class="customer-pictures-label">Customer Pictures</span>' +
    '</button>' +
    '</div>'
  : '';

var gallery = '<div class="product-gallery">' +
  '<img class="product-gallery-hero no-zoom" id="productHero" ' +
  'src="' + images[0] + '" alt="' + escapeHtml(product.name) + '" data-index="0">' +
  '<div class="product-gallery-thumbs">' +
    images.map(function (img, i) {
      return '<button type="button" class="product-gallery-thumb no-zoom' +
        (i === 0 ? ' is-active' : '') + '" data-index="' + i + '">' +
        '<img src="' + img + '" alt="" loading="lazy">' +
        '</button>';
    }).join('') +
  '</div>' +
  galleryButton +
'</div>';
```

(Adjust the surrounding context to match the file's actual existing structure — the key change is adding `+ galleryButton` after the thumbs div.)

- [ ] **Step 3: Add wiring after gallery is mounted**

In the same file, in the function that runs after the product detail is inserted into the DOM (search for where `setupGallery` or similar is invoked), add:

```javascript
function setupCustomerPicturesButton(container, slug) {
  var btn = container.querySelector('.customer-pictures-button[data-slug="' + slug + '"]');
  if (!btn) return;

  fetch('/api/customer-pictures/' + slug)
    .then(function (r) { return r.ok ? r.json() : { items: [], count: 0 }; })
    .then(function (data) {
      var label = btn.querySelector('.customer-pictures-label');
      if (data.count > 0) {
        label.textContent = 'Customer Pictures (' + data.count + ')';
      } else {
        label.textContent = 'Submit a Picture';
        btn.querySelector('.customer-pictures-icon').textContent = '➕';
      }
      btn.addEventListener('click', function () {
        if (window.CustomerPictures) {
          window.CustomerPictures.open(slug, data);
        }
      });
    })
    .catch(function () {
      // Network error: leave default label and let click open empty lightbox
      btn.addEventListener('click', function () {
        if (window.CustomerPictures) window.CustomerPictures.open(slug, { items: [], count: 0 });
      });
    });
}
```

Call `setupCustomerPicturesButton(productContainer, product.slug);` near the `setupGallery(...)` call.

- [ ] **Step 4: Add CSS in css/shop.css**

Append to the bottom of `css/shop.css`:

```css
/* ── Customer Pictures button ───────────────────── */
.customer-pictures-button-wrap {
  margin-top: 12px;
  text-align: center;
}
.customer-pictures-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  color: #ffb84d;
  border: 1px solid #ffb84d;
  border-radius: 4px;
  padding: 10px 18px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.5px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  font-family: inherit;
}
.customer-pictures-button:hover {
  background: #ffb84d;
  color: #000;
}
.customer-pictures-icon { font-size: 14px; }
```

- [ ] **Step 5: Smoke test**

Open `http://localhost:8788/shop/product?slug=the-axis` (or the local equivalent) in a browser. Expected: under the thumbnail strip, a button labeled either "Submit a Picture" (no approved pictures yet) or "Customer Pictures (N)". Clicking it does nothing yet (lightbox JS in next task).

- [ ] **Step 6: Commit**

```bash
git add js/shop.js css/shop.css
git commit -m "shop: add Customer Pictures button under gallery thumbnails"
```

---

## Task 14: Customer Pictures lightbox + grid

**Files:**
- Create: `js/customer-pictures.js`
- Modify: `css/shop.css`
- Modify: `shop/product.html` (add script include)

- [ ] **Step 1: Create js/customer-pictures.js with grid render only**

```javascript
// js/customer-pictures.js
(function () {
  'use strict';

  var SLUG_TO_NAME = { 'the-axis': 'The AXIS', 'the-stack': 'The Stack' };

  function el(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = text;
    return n;
  }

  function escapeAttr(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function buildGrid(items) {
    if (!items.length) {
      var empty = el('div', 'cp-empty');
      empty.textContent = 'No customer pictures yet — be the first to share!';
      return empty;
    }
    var grid = el('div', 'cp-grid');
    items.forEach(function (item) {
      var url = item.photoUrls[0];
      var tile = el('div', 'cp-tile');
      tile.innerHTML =
        '<img src="' + escapeAttr(url) + '" alt="" loading="lazy">' +
        '<div class="cp-tile-meta">' +
          '<div class="cp-tile-name">' + escapeAttr(item.name) + '</div>' +
          '<div class="cp-tile-caption">' + escapeAttr(item.caption) + '</div>' +
        '</div>';
      grid.appendChild(tile);
    });
    return grid;
  }

  function open(slug, data) {
    var overlay = el('div', 'cp-overlay');
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(overlay); });

    var box = el('div', 'cp-box');
    var header = el('div', 'cp-header');
    header.innerHTML =
      '<h2>Customer Pictures — ' + escapeAttr(SLUG_TO_NAME[slug] || slug) + '</h2>' +
      '<button type="button" class="cp-close" aria-label="Close">×</button>';
    header.querySelector('.cp-close').addEventListener('click', function () { close(overlay); });

    var content = el('div', 'cp-content');
    content.appendChild(buildGrid(data.items || []));

    var footer = el('div', 'cp-footer');
    var submitBtn = el('button', 'cp-submit-btn');
    submitBtn.type = 'button';
    submitBtn.innerHTML = '<span>➕</span> Submit Your Picture';
    submitBtn.addEventListener('click', function () {
      // Wired up in Task 15
      submitBtn.textContent = 'Submit form coming next…';
    });
    footer.appendChild(submitBtn);

    box.appendChild(header);
    box.appendChild(content);
    box.appendChild(footer);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    document.addEventListener('keydown', escHandler);
    overlay._escHandler = escHandler;

    function escHandler(e) {
      if (e.key === 'Escape') close(overlay);
    }
  }

  function close(overlay) {
    document.body.style.overflow = '';
    if (overlay._escHandler) document.removeEventListener('keydown', overlay._escHandler);
    overlay.remove();
  }

  window.CustomerPictures = { open: open };
})();
```

- [ ] **Step 2: Add CSS for lightbox + grid**

Append to `css/shop.css`:

```css
/* ── Customer Pictures lightbox ─────────────────── */
.cp-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(0, 0, 0, 0.85);
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
}
.cp-box {
  background: #14181f;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  width: 100%; max-width: 960px;
  max-height: 90vh;
  display: flex; flex-direction: column;
  color: #e4e4e4;
}
.cp-header {
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex; align-items: center; justify-content: space-between;
}
.cp-header h2 { margin: 0; font-size: 18px; color: #fff; }
.cp-close {
  background: none; border: none; color: #ccc; font-size: 24px; cursor: pointer;
  padding: 0 8px; line-height: 1;
}
.cp-close:hover { color: #fff; }
.cp-content { padding: 20px; overflow-y: auto; flex: 1; }
.cp-footer {
  padding: 16px 20px; border-top: 1px solid rgba(255, 255, 255, 0.08);
  text-align: center;
}
.cp-submit-btn {
  background: #ffb84d; color: #000; border: none; border-radius: 4px;
  padding: 12px 24px; font-size: 14px; font-weight: 700; cursor: pointer;
  font-family: inherit;
}
.cp-submit-btn:hover { background: #ffc266; }

.cp-empty {
  text-align: center; color: #888; padding: 60px 20px; font-size: 14px;
}

.cp-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
}
.cp-tile {
  background: #1a1f28; border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 6px; overflow: hidden;
}
.cp-tile img { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; }
.cp-tile-meta { padding: 8px 10px; }
.cp-tile-name { font-size: 12px; font-weight: 600; color: #ffb84d; }
.cp-tile-caption { font-size: 12px; color: #ccc; margin-top: 2px; line-height: 1.4; }
```

- [ ] **Step 3: Add script include in shop/product.html**

In `shop/product.html`, after the existing `<script src="/js/gallery.js"></script>` line, add:

```html
<script src="/js/customer-pictures.js?v=1"></script>
```

- [ ] **Step 4: Smoke test**

Reload `http://localhost:8788/shop/product?slug=the-axis` in browser. Click the Customer Pictures button. Expected: dark overlay opens with header, empty-state message (assuming no approved pictures yet), and "Submit Your Picture" button. Click ✕ or press Esc — overlay closes.

If you have approved pictures from earlier smoke tests, expected: grid of tiles with photo + name + caption.

- [ ] **Step 5: Commit**

```bash
git add js/customer-pictures.js css/shop.css shop/product.html
git commit -m "shop: add Customer Pictures lightbox grid"
```

---

## Task 15: Submit form inside lightbox

**Files:**
- Modify: `js/customer-pictures.js`
- Modify: `css/shop.css`
- Modify: `shop/product.html` (add Turnstile script)

- [ ] **Step 1: Add Turnstile script to product page**

In `shop/product.html`, in the `<head>`, add:

```html
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
```

- [ ] **Step 2: Replace the submit button click handler in customer-pictures.js**

Find the `submitBtn.addEventListener('click', ...)` block from Task 14 and replace its body with `showSubmitForm(box, slug);`. Then add these two new functions before `function close(overlay)`:

```javascript
  var TURNSTILE_SITE_KEY = window.CT_TURNSTILE_SITE_KEY || '';
  var MAX_PHOTOS = 3;
  var MAX_DIM = 1600; // resize longest edge to this before upload

  async function compressImage(file) {
    if (!file.type.startsWith('image/')) return file;
    var bmp = await createImageBitmap(file);
    var scale = Math.min(1, MAX_DIM / Math.max(bmp.width, bmp.height));
    var w = Math.round(bmp.width * scale);
    var h = Math.round(bmp.height * scale);
    var canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(bmp, 0, 0, w, h);
    var blob = await new Promise(function (resolve) {
      canvas.toBlob(resolve, 'image/jpeg', 0.85);
    });
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  }

  function showSubmitForm(box, slug) {
    var content = box.querySelector('.cp-content');
    var footer = box.querySelector('.cp-footer');
    content.innerHTML = '';
    footer.innerHTML = '';

    var form = el('form', 'cp-form');
    form.innerHTML =
      '<label class="cp-label">Photos (up to 3)' +
        '<input type="file" name="photo" accept="image/jpeg,image/png,image/webp" multiple required>' +
      '</label>' +
      '<label class="cp-label">Display name' +
        '<input type="text" name="name" required minlength="2" maxlength="60" placeholder="Mike R.">' +
      '</label>' +
      '<label class="cp-label">Email <span class="cp-hint">(kept private)</span>' +
        '<input type="email" name="email" required maxlength="120" placeholder="you@example.com">' +
      '</label>' +
      '<label class="cp-label">Caption' +
        '<input type="text" name="caption" required maxlength="140" placeholder="Mounted on my Vortex Razor">' +
      '</label>' +
      '<div class="cf-turnstile" data-sitekey="' + escapeAttr(TURNSTILE_SITE_KEY) + '"></div>' +
      '<div class="cp-form-status"></div>' +
      '<button type="submit" class="cp-submit-btn">Submit</button>';

    if (window.turnstile && TURNSTILE_SITE_KEY) {
      window.turnstile.render(form.querySelector('.cf-turnstile'));
    }

    var status = form.querySelector('.cp-form-status');
    var submitBtn = form.querySelector('button[type="submit"]');

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      status.textContent = 'Uploading…';
      submitBtn.disabled = true;

      var fileInput = form.querySelector('input[name="photo"]');
      var files = Array.from(fileInput.files || []);
      if (files.length < 1 || files.length > MAX_PHOTOS) {
        status.textContent = 'Please select between 1 and ' + MAX_PHOTOS + ' photos.';
        submitBtn.disabled = false;
        return;
      }

      try {
        var compressed = [];
        for (var i = 0; i < files.length; i++) {
          compressed.push(await compressImage(files[i]));
        }

        var fd = new FormData();
        fd.set('productSlug', slug);
        fd.set('name', form.name.value.trim());
        fd.set('email', form.email.value.trim());
        fd.set('caption', form.caption.value.trim());
        var turnstileToken = (form.querySelector('input[name="cf-turnstile-response"]') || {}).value || '';
        fd.set('turnstileToken', turnstileToken);
        compressed.forEach(function (f) { fd.append('photo', f); });

        var resp = await fetch('/api/customer-pictures/submit', { method: 'POST', body: fd });
        var data = await resp.json();
        if (resp.ok && data.ok) {
          content.innerHTML =
            '<div class="cp-thanks">' +
              '<h3>Thanks!</h3>' +
              '<p>Your picture will appear here once Choice Tactical approves it (usually within a day).</p>' +
            '</div>';
          footer.innerHTML = '';
        } else {
          status.textContent = data.error || 'Submission failed. Please try again.';
          submitBtn.disabled = false;
        }
      } catch (err) {
        status.textContent = 'Submission failed: ' + err.message;
        submitBtn.disabled = false;
      }
    });

    content.appendChild(form);
  }
```

- [ ] **Step 3: Set Turnstile site key globally**

In `shop/product.html`, add inside `<head>` *before* the customer-pictures.js include:

```html
<script>window.CT_TURNSTILE_SITE_KEY = '__TURNSTILE_SITE_KEY__';</script>
```

The `__TURNSTILE_SITE_KEY__` placeholder will be replaced at deploy time, OR you can set it via a small inline script that reads from a `<meta>` tag, OR simply hardcode the public site key (it is *not* secret — only the secret key is). Easiest path: hardcode the public site key once it exists.

- [ ] **Step 4: Add CSS for the form**

Append to `css/shop.css`:

```css
.cp-form { display: flex; flex-direction: column; gap: 14px; max-width: 480px; margin: 0 auto; }
.cp-label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #ccc; text-transform: uppercase; letter-spacing: 0.5px; }
.cp-hint { color: #777; text-transform: none; letter-spacing: 0; font-size: 11px; }
.cp-label input[type="text"], .cp-label input[type="email"], .cp-label input[type="file"] {
  background: #0e1116; color: #e4e4e4;
  border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 4px;
  padding: 10px 12px; font-size: 14px; font-family: inherit;
}
.cp-label input:focus { outline: none; border-color: #ffb84d; }
.cp-form-status { color: #f0a020; font-size: 13px; min-height: 18px; }
.cp-thanks { text-align: center; padding: 40px 20px; }
.cp-thanks h3 { color: #4caf50; margin: 0 0 8px; font-size: 20px; }
.cp-thanks p { color: #ccc; }
```

- [ ] **Step 5: Smoke test full flow locally**

With wrangler dev still running and Turnstile test secret + test site key (`1x00000000000000000000AA`) configured:

1. Reload product page, click Customer Pictures button → Submit Your Picture
2. Fill the form, attach 1-3 real photos, submit
3. Expected: "Thanks!" message appears
4. Check `console.log` from local Resend send (or comment it out to skip) for the approve URL
5. Open the approve URL in a new tab → "Approved" page
6. Reload product page → photo now appears in the grid

- [ ] **Step 6: Commit**

```bash
git add js/customer-pictures.js css/shop.css shop/product.html
git commit -m "shop: add Customer Pictures submit form with Turnstile + client-side compression"
```

---

## Task 16: Production Cloudflare setup

**Files:** none committed — Cloudflare dashboard + Wrangler CLI work.

This task is configuration, not code. Do these in order:

- [ ] **Step 1: Create production D1 database**

```bash
npx wrangler d1 create customer_pictures
```

Copy the printed `database_id` and paste it into `wrangler.toml` replacing `REPLACE_WITH_PRODUCTION_ID`. Commit:

```bash
git add wrangler.toml
git commit -m "build: wire production D1 database id"
```

- [ ] **Step 2: Apply migration to production D1**

```bash
npx wrangler d1 migrations apply customer_pictures --remote
```

Expected: same migration applied to the remote DB.

- [ ] **Step 3: Create production R2 bucket**

```bash
npx wrangler r2 bucket create choice-tactical-customer-pictures
npx wrangler r2 bucket create choice-tactical-customer-pictures-preview
```

Then in the Cloudflare dashboard, attach a custom domain to the bucket (e.g., `customer-pictures.choice-tactical.com`) so photos are publicly readable at a stable URL. Update `R2_PUBLIC_BASE_URL` in `wrangler.toml` if the custom domain differs from what's there.

- [ ] **Step 4: Create Turnstile site/secret keys**

In the Cloudflare dashboard → Turnstile → Add site → for `choice-tactical.com` (and `localhost` for dev). Copy the site key and secret key.

- [ ] **Step 5: Set production env vars on the Pages project**

In the Cloudflare dashboard → Pages → choice-tactical-website → Settings → Environment variables (Production):

- `TURNSTILE_SECRET_KEY` (encrypted)
- `MODERATION_HMAC_SECRET` (encrypted; generate with `openssl rand -hex 32`)
- `MODERATION_EMAIL_TO` (`sendit@choice-tactical.com` or your preferred address)
- `R2_PUBLIC_BASE_URL` (matches the R2 custom domain from Step 3)

The existing `RESEND_API_KEY` and `ORDER_EMAIL_FROM` are already set from the order email work — verify they're still there.

- [ ] **Step 6: Hardcode the Turnstile public site key**

In `shop/product.html`, replace the `__TURNSTILE_SITE_KEY__` placeholder with the actual public site key from Step 4 (the *site* key is public; only the *secret* key stays in env vars).

```bash
git add shop/product.html
git commit -m "shop: wire Turnstile site key"
```

- [ ] **Step 7: Bind D1 + R2 to the Pages project**

In the Cloudflare dashboard → Pages → choice-tactical-website → Settings → Functions:

- Bind D1: variable name `DB`, database `customer_pictures`
- Bind R2: variable name `CUSTOMER_PICTURES`, bucket `choice-tactical-customer-pictures`

(These can also be set via `wrangler.toml` once you switch the Pages project to git-style deploys, but since the project uses Direct Upload, dashboard bindings are the source of truth.)

- [ ] **Step 8: Deploy**

```bash
npx wrangler pages deploy . --project-name=choice-tactical-website --branch=main --commit-dirty=true
```

Expected: deploy succeeds, prints a URL.

- [ ] **Step 9: Smoke test production**

Visit `https://www.choice-tactical.com/shop/product?slug=the-axis`. Expected: button appears under thumbnails, opens lightbox. Submit a real test entry. Check inbox for moderation email. Click Approve. Reload product page — photo appears.

---

## Self-Review Checklist (run before declaring plan complete)

- [ ] Every endpoint in the spec has an implementing task: submit (Task 9), moderate (Task 10), read (Task 11) ✓
- [ ] All env vars in spec mapped to Task 16: TURNSTILE_SECRET_KEY, MODERATION_HMAC_SECRET, MODERATION_EMAIL_TO, R2_PUBLIC_BASE_URL, RESEND_API_KEY (existing), ORDER_EMAIL_FROM (existing) ✓
- [ ] Turnstile wired both server-side (Task 6 + 9) and client-side (Task 15) ✓
- [ ] Moderation token sign + verify both implemented and tested (Task 4) ✓
- [ ] Image validation: MIME, magic bytes, size cap all in Task 5 ✓
- [ ] Rate limit (3 per IP per hour) in Task 9 ✓
- [ ] Opportunistic cleanup (30-day pending TTL) in Task 8 + invoked in Task 9 ✓
- [ ] Idempotent moderation (already-handled, expired) in Task 10 ✓
- [ ] Empty-state UI (button label changes, lightbox empty message) in Tasks 13 + 14 ✓
- [ ] Confirmation message uses exact wording: "Your picture will appear here once Choice Tactical approves it (usually within a day)" — Task 15 ✓
