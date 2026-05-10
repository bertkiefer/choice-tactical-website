# Customer Pictures — Design Spec

**Date:** 2026-05-10
**Project:** choice-tactical.com shop
**Repo:** `bertkiefer/choice-tactical-website`
**Status:** Design locked — ready for implementation plan

## Goal

Let customers submit photos + short captions of themselves using Choice Tactical products. Submissions go through a moderation step (one-click email approval) before appearing on the product page in a lightbox gallery.

## Scope (v1)

- Photos only — video clips deferred to v2
- Two products: **The AXIS** and **The Stack** (architecture supports per-product flag, but only these two get the button initially)
- Up to 3 photos per submission
- Photo + short caption + display name (shown) + email (private)
- Cloudflare Turnstile on the submit form
- Email-based moderation (Approve / Reject links from Resend email)

## Out of scope (v1, deferred)

- Video clips
- Star ratings
- "Verified Buyer" badges (would require matching against Stripe order email)
- Public admin page (handled by separate self-service shop admin project)
- "Rejected" notification email to the customer (silent reject)
- Customer-side delete or edit of their own submission

## User-facing UX

### Product page button

Below the gallery thumbnails, a button:

- When `count == 0`: `➕ Submit a Picture`
- When `count >= 1`: `📷 Customer Pictures (N)`

Clicking opens a lightbox (same dark-overlay style as the existing hero zoom in `js/gallery.js`).

### Lightbox layout

```
┌──────────────────────────────────────────────────────┐
│  Customer Pictures — The AXIS                    ✕  │
├──────────────────────────────────────────────────────┤
│   [grid: 4-column responsive grid of approved tiles] │
│      Each tile: photo + name + caption underneath    │
│                                                      │
│           ┌────────────────────────────┐             │
│           │  ➕  Submit Your Picture   │             │
│           └────────────────────────────┘             │
└──────────────────────────────────────────────────────┘
```

When a product has zero approved pictures, the grid is replaced with a friendly empty state: "No customer pictures yet — be the first to share!"

Clicking `Submit Your Picture` slides in a form with:
- Photo upload — 1 to 3 files, drag-drop or tap, client-side compression before upload
- Display name (shown publicly)
- Email (kept private, used for moderation contact only)
- Caption — single line, ~140 char limit
- Cloudflare Turnstile widget
- Submit button

After submit, customer sees: **"Thanks! Your picture will appear here once Choice Tactical approves it (usually within a day)."**

### Moderation email (sent to shop email)

Subject: `New Customer Picture — <Product Name>`

Body:
- Customer name + email
- Caption
- Photo thumbnails (R2 signed URLs, 24-hour expiry)
- Two buttons: `✓ APPROVE` and `✗ REJECT` — each is a link to `/api/customer-pictures/moderate?token=…`
- Token is an HMAC of `submission_id + action + expiry` (24-hour expiry), preventing forgery / replay

One click → confirmation page in browser → done.

## Architecture

### New endpoints (Cloudflare Pages Functions)

All under `functions/api/customer-pictures/`:

1. **`POST /api/customer-pictures/submit`**
   - Body: multipart form (`productSlug`, `name`, `email`, `caption`, `photo[]` × 1-3, `turnstileToken`)
   - Validates Turnstile token via Cloudflare's verify endpoint
   - Validates each photo: MIME type (jpeg/png/webp), magic bytes match extension, ≤ 8 MB per photo
   - Uploads photos to R2 at `customer-pictures/{submission_id}/{0|1|2}.<ext>`
   - Inserts D1 row with `status='pending'`
   - Sends Resend email with Approve/Reject links to shop email
   - Returns `{ ok: true }` or `{ error: "..." }`

2. **`GET /api/customer-pictures/moderate?token=…`**
   - Validates HMAC signed token (24-hour expiry)
   - On Approve: D1 `UPDATE status='approved', moderated_at=now()`
   - On Reject: D1 `DELETE row` + R2 delete `customer-pictures/{submission_id}/*`
   - Idempotent: second click shows "already moderated"
   - Returns simple HTML confirmation page

3. **`GET /api/customer-pictures/:slug`**
   - Returns approved submissions for a product as JSON: `{ items: [{ id, name, caption, photoUrls, submittedAt }] }`
   - `photoUrls` are public R2 URLs (or signed if bucket stays private)
   - Cached at edge for 5 minutes via `Cache-Control` headers
   - Cache busted on approve via cache purge or short TTL

4. **Opportunistic cleanup** (runs inside `submit` handler, not a separate cron)
   - Before each new submission is written, delete any pending rows older than 30 days plus their R2 photos
   - Keeps the moderation queue from growing indefinitely without needing a separate scheduled Worker (Cloudflare Pages Functions don't natively support cron triggers)
   - Cheap: a single indexed DELETE per submission, runs at most a few times per day at this volume

### Storage

**Cloudflare D1 (SQL):**

```sql
CREATE TABLE customer_pictures (
  id TEXT PRIMARY KEY,           -- UUID
  product_slug TEXT NOT NULL,    -- 'the-axis' | 'the-stack'
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  caption TEXT NOT NULL,
  photo_keys TEXT NOT NULL,      -- JSON array of R2 keys
  status TEXT NOT NULL CHECK(status IN ('pending','approved')),
  submitted_at INTEGER NOT NULL, -- unix seconds
  moderated_at INTEGER,
  ip_hash TEXT                   -- SHA-256 of submitter IP for rate limiting
);

CREATE INDEX idx_product_status ON customer_pictures(product_slug, status);
CREATE INDEX idx_status_submitted ON customer_pictures(status, submitted_at);
CREATE INDEX idx_ip_submitted ON customer_pictures(ip_hash, submitted_at);
```

(Rejected submissions are deleted immediately, so `status` only has two states in practice.)

**Cloudflare R2:**

- Bucket: `choice-tactical-customer-pictures` (new)
- Key scheme: `{submission_id}/{photo_index}.{ext}`
- **Public read access** — these photos are intended to be public anyway (they appear on a public product page); a public bucket avoids signed-URL latency on every page load and the cache caches better at the edge
- Photos for *rejected* submissions are deleted immediately in the moderate handler, so a public bucket only ever contains approved + pending photos. Pending photos are technically reachable if someone guesses the UUID, but UUIDs are unguessable

### Frontend changes

- **`js/shop.js`** — extend the product detail render (around line 350 where the gallery is built) to add the Customer Pictures button under the thumbnails. Fetch `/api/customer-pictures/:slug` to get the count for the button label.
- **`js/customer-pictures.js`** (new) — lightbox open/close, grid render, submit form, file upload + client-side compression, Turnstile integration.
- **`css/shop.css`** — new styles for the lightbox grid, form, and the customer-pictures button (matches existing button styles).
- **`shop/products.json`** — add `customerPictures: true` flag on `the-axis` and `the-stack`. Other products omit the flag (defaults to false).

## Security & guardrails

| Risk | Mitigation |
|---|---|
| Bot spam to submit endpoint | Cloudflare Turnstile validation before any storage write |
| Oversized uploads | 8 MB per-photo cap, client-side compression first, multipart parser rejects oversize |
| Non-image files | MIME type allowlist (jpeg/png/webp) + magic-byte verification |
| Rate-limit abuse | Per-IP cap: 3 submissions per IP per hour (SHA-256 IP hash, not raw IP) |
| Forged moderation links | HMAC-signed token on every Approve/Reject URL, 24-hour expiry |
| Replay attack on moderation | Idempotent moderation handler — duplicate clicks show "already moderated" |
| Pending submissions piling up | Daily cron cleanup of pending rows older than 30 days |
| Service downtime (D1/R2 brief outage) | Form shows retry message; no partial-state data loss (D1 insert is the commit point) |

## Secrets / environment variables

New env vars on the Pages project:

- `TURNSTILE_SECRET_KEY` — server-side Turnstile verification
- `MODERATION_HMAC_SECRET` — for signing moderation tokens
- `MODERATION_EMAIL_TO` — where Approve/Reject emails go (sendit@choice-tactical.com)
- `R2_PUBLIC_BASE_URL` — public CDN base for the R2 bucket (e.g., `https://customer-pictures.choice-tactical.com` once a custom domain is attached, or the default `pub-xxxxx.r2.dev` URL during development)

Existing reused: `RESEND_API_KEY`, `ORDER_EMAIL_FROM` (the `from` address for moderation emails).

D1 binding: `DB`
R2 binding: `CUSTOMER_PICTURES`

## Testing strategy

- **Unit:** Turnstile verification helper, HMAC token sign/verify, MIME + magic-byte validation, IP rate-limit check
- **Integration (Wrangler local dev):** submit endpoint end-to-end with mocked Resend, moderate endpoint with valid + expired + replayed tokens, read endpoint returns only approved
- **Manual:** real Turnstile challenge, real Resend email to test inbox, click both Approve and Reject links, confirm photo appears / disappears on product page
- **Edge cases:** 0-photo submission rejected, 4-photo submission rejected, 50 MB photo rejected, .gif rejected, malformed token rejected

## Cost estimate (low volume)

- D1: free tier covers easily (5M reads/day free)
- R2: ~$0.015/GB/mo storage + ~$0.36/million Class A ops. 100 submissions × 3 photos × 3 MB = ~900 MB ≈ $0.014/mo. Reads cached at edge → near-zero ongoing cost.
- Turnstile: free
- Resend: existing free tier covers moderation emails (3000/mo)

Total expected ongoing cost: under $1/mo at expected volume.

## Open questions

None — all user-facing decisions resolved during brainstorming.

## Next step

Invoke `superpowers:writing-plans` to break this design into an ordered implementation plan with discrete tasks, dependencies, and verification steps.
