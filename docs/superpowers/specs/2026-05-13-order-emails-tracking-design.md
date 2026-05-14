# Order Confirmation & Shipping Tracking Emails — Design Spec

**Date:** 2026-05-13
**Status:** Awaiting user review
**Trigger:** First live order produced no customer email — investigation found webhook only emails the merchant.

---

## Problem

The Stripe webhook at `functions/api/stripe-webhook.js` fires on `checkout.session.completed` and sends ONE email — a "new order" notification to `orders@choice-tactical.com` (the merchant). Customers receive nothing from Choice Tactical when they pay. We need:

1. A **branded order confirmation** email sent to the customer immediately on payment.
2. A **branded shipping notification** email sent to the customer when the order ships, including carrier + tracking number + clickable tracking link.
3. A way for the merchant to enter tracking numbers from desktop or phone.

## Two-email flow

### Email 1 — Order Confirmation (automatic)
Triggered by the existing `checkout.session.completed` webhook. Sent to `session.customer_details.email` in addition to the existing merchant notification (which we keep).

Content:
- Header: "Thanks for your order, {first name}"
- Order number (last 10 chars of session ID, same as merchant email)
- Items table (qty, name, line-item metadata like plate size, line total)
- Shipping cost, tax, total
- Shipping address (so they can spot a typo and reply quickly)
- **"Ships in 2–3 business days after order payment"** expectation line
- Reply-to: `orders@choice-tactical.com` with text "Need to change something? Reply to this email."
- Choice Tactical branding (same gold accent `#CBB589` as merchant email)

### Email 2 — Shipping Notification (manual)
Triggered when the merchant marks an order shipped via the admin UI. Sent to the same customer email saved at order time.

Content:
- Header: "Your order has shipped"
- Order number
- Carrier name (USPS or UPS)
- Tracking number
- Clickable "Track your package" button → carrier tracking URL
- Restate shipping address (in case anything changed)
- Items shipped (in case of partial — v1 treats every order as one shipment)
- Reply-to: same

## Carriers (v1: USPS, UPS)

Tracking URL builders:
- USPS → `https://tools.usps.com/go/TrackConfirmAction?tLabels=<num>`
- UPS  → `https://www.ups.com/track?tracknum=<num>`

Schema allows other carriers in the future (`carrier` column accepts any string; URL builder falls back to a generic Google search if unknown).

## D1 schema

New table in the existing `customer_pictures` D1 database (binding `DB`):

```sql
-- migrations/0002_create_orders.sql
CREATE TABLE orders (
  id TEXT PRIMARY KEY,                    -- Stripe session ID (cs_...)
  short_id TEXT NOT NULL,                 -- last 10 chars of session ID (display)
  customer_email TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  amount_total INTEGER NOT NULL,          -- cents
  amount_shipping INTEGER NOT NULL,
  amount_tax INTEGER NOT NULL,
  currency TEXT NOT NULL,                 -- 'usd'
  line_items_json TEXT NOT NULL,          -- JSON array of {qty, name, meta, total_cents}
  shipping_address_json TEXT NOT NULL,    -- JSON of {line1, line2, city, state, postal, country}
  shipping_rate_name TEXT,                -- e.g. "USPS Priority"
  status TEXT NOT NULL CHECK(status IN ('pending','shipped','delivered','cancelled')),
  carrier TEXT,                           -- 'USPS' | 'UPS' | other
  tracking_number TEXT,
  payment_intent_id TEXT,                 -- Stripe payment intent (for dashboard link)
  paid_at INTEGER NOT NULL,               -- unix ms
  shipped_at INTEGER,
  notes TEXT
);

CREATE INDEX idx_orders_status_paid ON orders(status, paid_at DESC);
CREATE INDEX idx_orders_email ON orders(customer_email);
```

## Files to create / change

### Existing files modified
- `functions/api/stripe-webhook.js`
  - After fetching the Stripe session, **insert order row** into D1
  - After existing merchant email, **send customer confirmation email** to `session.customer_details.email`

### New helper modules
- `functions/_lib/email-order-confirmation.js` — `buildOrderConfirmationEmail(order) → { subject, html, text }`
- `functions/_lib/email-order-shipped.js`      — `buildOrderShippedEmail(order) → { subject, html, text }`
- `functions/_lib/tracking-urls.js`            — `trackingUrl(carrier, number) → string`

### New API endpoints (admin, key-gated)
- `functions/api/orders/list.js`   — `GET` returns recent orders, filterable by status
- `functions/api/orders/ship.js`   — `POST { order_id, carrier, tracking_number }` → updates D1 + sends shipping email + returns success

### New admin pages
- `shop/admin/orders/index.html` — desktop list view with shipping form per row
- `shop/admin/orders/ship.html`  — phone-friendly single-order form (order # + carrier + tracking)

## Auth strategy

The existing Customer Pictures admin uses HMAC magic-links (one-shot URLs emailed to the merchant per moderation action). That pattern doesn't fit shipping — Bert needs persistent access to ship many orders over time. Two viable approaches:

**Picked: URL-key approach (simplest)**
- A single secret stored as Cloudflare Pages env var `ADMIN_KEY` (random 32+ char string).
- Admin pages and API endpoints accept the key via `?key=<value>` query param OR `x-admin-key` header.
- Bert bookmarks `/shop/admin/orders/?key=<value>` on desktop and phone.
- If the key leaks, rotate the env var — old bookmarks stop working.
- Constant-time compare in the handler to avoid timing attacks.

Not picked (for later if needed):
- HMAC-signed login cookie + login page — more code, no real benefit for one-user admin.
- Cloudflare Access — best long-term, but adds a setup step for Bert.

## Environment variables

Already set:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `ORDER_EMAIL_FROM` (default merchant from)
- `ORDER_EMAIL_TO` (merchant inbox)

New / repurposed:
- `CUSTOMER_EMAIL_FROM` — defaults to `Choice Tactical <orders@choice-tactical.com>` (visible to customer). Must be a verified domain in Resend.
- `REPLY_TO_EMAIL`      — defaults to `orders@choice-tactical.com`
- `ADMIN_KEY`           — long random secret (32+ chars). Gates `/shop/admin/orders/` pages and `/api/orders/*` endpoints.

## Failure modes & how we handle them

- **Webhook retries:** Stripe will retry the webhook if we return non-2xx. The D1 insert uses `INSERT OR IGNORE` on the session-ID primary key — so retries don't create duplicate rows or duplicate emails. (We track an `email_sent` flag on the order — see below.)
- **Email send fails:** If the merchant or customer email fails to send, we log and return 200 anyway (so Stripe doesn't retry the webhook indefinitely). Failed sends show up in Resend logs; we can resend manually from admin if needed.
- **Tracking number typo:** Admin can edit a shipped order's tracking and re-send the email. v1 doesn't include this; if needed we add a "resend tracking email" button in v1.1.
- **Bad shipping address from Stripe:** We send the email anyway with what we have. Customer can reply to fix.

## Add to schema later (v1.1, not v1)
- `email_sent_at` (timestamp) — verify we sent and avoid double-sends on webhook retry. v1 relies on `INSERT OR IGNORE` collision behavior; if that's not enough we'll add the column.
- `delivery_confirmed_at` — if/when we add USPS/UPS webhook integration to detect delivery
- `customer_pictures_invited_at` — for sending a "share a photo" email N days after delivery

## Out of scope (v1)

- Partial shipments (split orders)
- Refund-triggered emails
- Customer self-serve order lookup
- Automatic delivery detection via carrier APIs
- Order edits / cancellations from admin
- "Share a photo" follow-up email (separate feature, ties into existing Customer Pictures)

## Rollout

1. Run migration `0002_create_orders.sql` on the live D1 database.
2. Deploy with `wrangler pages deploy` (per CLAUDE.md memory — Direct Upload, not git-auto).
3. Place one $1 test order via Stripe test mode to verify confirmation email arrives.
4. Place one live $1 test order to verify webhook fires in live mode and saves to D1.
5. From admin UI, mark the test order shipped with a fake tracking number — verify shipping email arrives and tracking link works.
6. Confirm Stripe receipts (separate channel) are also enabled in the dashboard — belt and suspenders.

## Open user decisions (none — all locked)

- Carriers: **USPS + UPS** ✓
- Tracking entry UI: **both desktop list + phone form** ✓
- Confirmation content: **summary + shipping addr + 2–3 day expectation + reply-to** ✓
- Exact wording on timing: **"Ships in 2–3 business days after order payment"** ✓
