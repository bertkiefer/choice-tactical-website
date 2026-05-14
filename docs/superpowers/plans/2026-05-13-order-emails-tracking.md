# Order Emails & Tracking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send customers a branded order confirmation email on payment, and a branded shipping email with tracking link when the merchant marks the order shipped via admin UI.

**Architecture:** Extend the existing `stripe-webhook.js` Cloudflare Pages Function to insert a row into a new D1 `orders` table and send a customer email in addition to the merchant notification. Add two admin API endpoints (`list`, `ship`) gated by a single `ADMIN_KEY` secret, plus two admin pages (desktop list, phone form). All email helpers live in `functions/_lib/` and are unit-tested in isolation.

**Tech Stack:** Cloudflare Pages Functions (ES modules), D1 (SQLite), Resend (transactional email), Stripe Webhooks, Vitest (Node) for unit tests.

**Spec:** `docs/superpowers/specs/2026-05-13-order-emails-tracking-design.md`

---

## File Structure

**Create:**
- `migrations/0002_create_orders.sql` — D1 schema for orders table
- `functions/_lib/tracking-urls.js` — `trackingUrl(carrier, number)` builder for USPS/UPS/fallback
- `functions/_lib/email-order-confirmation.js` — `buildOrderConfirmationEmail(order)` → `{ subject, html, text }`
- `functions/_lib/email-order-shipped.js` — `buildOrderShippedEmail(order)` → `{ subject, html, text }`
- `functions/_lib/admin-auth.js` — `verifyAdminKey(request, env)` → boolean (constant-time compare)
- `functions/api/orders/list.js` — `GET /api/orders/list` admin endpoint
- `functions/api/orders/ship.js` — `POST /api/orders/ship` admin endpoint
- `shop/admin/orders/index.html` — desktop list view
- `shop/admin/orders/ship.html` — phone-friendly single-order form
- `tests/tracking-urls.test.js`
- `tests/email-order-confirmation.test.js`
- `tests/email-order-shipped.test.js`
- `tests/admin-auth.test.js`

**Modify:**
- `functions/api/stripe-webhook.js` — after fetching session, insert order row into D1 and send customer confirmation email

**Reference (no changes):**
- `functions/_lib/email.js` — existing Resend helper pattern (read only, for style match)
- `migrations/0001_create_customer_pictures.sql` — existing migration style

---

## Task 1: D1 migration — create `orders` table

**Files:**
- Create: `migrations/0002_create_orders.sql`

- [ ] **Step 1: Create the migration file**

Write `migrations/0002_create_orders.sql`:

```sql
-- migrations/0002_create_orders.sql
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  short_id TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  amount_total INTEGER NOT NULL,
  amount_shipping INTEGER NOT NULL,
  amount_tax INTEGER NOT NULL,
  currency TEXT NOT NULL,
  line_items_json TEXT NOT NULL,
  shipping_address_json TEXT NOT NULL,
  shipping_rate_name TEXT,
  status TEXT NOT NULL CHECK(status IN ('pending','shipped','delivered','cancelled')),
  carrier TEXT,
  tracking_number TEXT,
  payment_intent_id TEXT,
  paid_at INTEGER NOT NULL,
  shipped_at INTEGER,
  notes TEXT
);

CREATE INDEX idx_orders_status_paid ON orders(status, paid_at DESC);
CREATE INDEX idx_orders_email ON orders(customer_email);
```

- [ ] **Step 2: Apply migration to LOCAL D1 first**

Run:
```bash
cd ~/choice-tactical-website
npx wrangler d1 execute customer_pictures --local --file=migrations/0002_create_orders.sql
```

Expected: `🌀 Executing on local database ... ✅ [info]`

- [ ] **Step 3: Verify table exists locally**

Run:
```bash
npx wrangler d1 execute customer_pictures --local --command="SELECT name FROM sqlite_master WHERE type='table';"
```

Expected output includes both `customer_pictures` and `orders`.

- [ ] **Step 4: Commit migration**

```bash
git add migrations/0002_create_orders.sql
git commit -m "feat(orders): add D1 migration for orders table"
```

Do NOT apply to remote yet — that happens at deploy time in Task 11.

---

## Task 2: Tracking URL builder + tests

**Files:**
- Create: `functions/_lib/tracking-urls.js`
- Create: `tests/tracking-urls.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/tracking-urls.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { trackingUrl } from '../functions/_lib/tracking-urls.js';

describe('trackingUrl', () => {
  it('builds USPS tracking URL', () => {
    expect(trackingUrl('USPS', '9400111899223197428490'))
      .toBe('https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223197428490');
  });

  it('builds UPS tracking URL', () => {
    expect(trackingUrl('UPS', '1Z999AA10123456784'))
      .toBe('https://www.ups.com/track?tracknum=1Z999AA10123456784');
  });

  it('falls back to a Google search URL for unknown carriers', () => {
    expect(trackingUrl('FedEx', '123456789012'))
      .toBe('https://www.google.com/search?q=FedEx+tracking+123456789012');
  });

  it('case-insensitive carrier match', () => {
    expect(trackingUrl('usps', '9400111'))
      .toBe('https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111');
    expect(trackingUrl('Ups', '1Z999'))
      .toBe('https://www.ups.com/track?tracknum=1Z999');
  });

  it('URL-encodes the tracking number', () => {
    expect(trackingUrl('UNKNOWN', 'AB 123/456'))
      .toBe('https://www.google.com/search?q=UNKNOWN+tracking+AB%20123%2F456');
  });

  it('returns empty string when carrier or number is missing', () => {
    expect(trackingUrl('', '12345')).toBe('');
    expect(trackingUrl('USPS', '')).toBe('');
    expect(trackingUrl(null, null)).toBe('');
  });
});
```

- [ ] **Step 2: Run tests — they should fail**

Run: `npx vitest run tests/tracking-urls.test.js`
Expected: FAIL with module-not-found error on `tracking-urls.js`.

- [ ] **Step 3: Implement the builder**

Create `functions/_lib/tracking-urls.js`:

```javascript
// functions/_lib/tracking-urls.js
// Build a clickable tracking URL given a carrier name and tracking number.
// Returns '' if either is missing. Unknown carriers fall back to a Google search.

export function trackingUrl(carrier, number) {
  if (!carrier || !number) return '';
  const c = String(carrier).trim().toUpperCase();
  const n = String(number).trim();
  if (!n) return '';

  switch (c) {
    case 'USPS':
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(n)}`;
    case 'UPS':
      return `https://www.ups.com/track?tracknum=${encodeURIComponent(n)}`;
    default:
      return `https://www.google.com/search?q=${encodeURIComponent(carrier)}+tracking+${encodeURIComponent(n)}`;
  }
}
```

- [ ] **Step 4: Run tests — they should pass**

Run: `npx vitest run tests/tracking-urls.test.js`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/tracking-urls.js tests/tracking-urls.test.js
git commit -m "feat(orders): add tracking URL builder for USPS/UPS"
```

---

## Task 3: Order confirmation email builder + tests

**Files:**
- Create: `functions/_lib/email-order-confirmation.js`
- Create: `tests/email-order-confirmation.test.js`

The function takes an `order` object (the row we'll insert into D1) and returns `{ subject, html, text }`.

- [ ] **Step 1: Write the failing tests**

Create `tests/email-order-confirmation.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { buildOrderConfirmationEmail } from '../functions/_lib/email-order-confirmation.js';

const sampleOrder = {
  id: 'cs_test_abc1234567890',
  short_id: '1234567890',
  customer_email: 'jane@example.com',
  customer_name: 'Jane Doe',
  amount_total: 12500,
  amount_shipping: 750,
  amount_tax: 0,
  currency: 'usd',
  line_items: [
    { qty: 1, name: 'The AXIS Flag Alignment Tool', meta: 'plate_size: 18 mm', total_cents: 11750 }
  ],
  shipping_address: {
    line1: '123 Main St', line2: '', city: 'Austin',
    state: 'TX', postal_code: '78701', country: 'US'
  },
  shipping_rate_name: 'USPS Priority',
};

describe('buildOrderConfirmationEmail', () => {
  it('returns subject, html, and text strings', () => {
    const out = buildOrderConfirmationEmail(sampleOrder);
    expect(typeof out.subject).toBe('string');
    expect(typeof out.html).toBe('string');
    expect(typeof out.text).toBe('string');
  });

  it('subject includes the short order id', () => {
    const out = buildOrderConfirmationEmail(sampleOrder);
    expect(out.subject).toMatch(/1234567890/);
  });

  it('text body includes customer first name', () => {
    const out = buildOrderConfirmationEmail(sampleOrder);
    expect(out.text).toMatch(/Jane/);
  });

  it('text body includes the 2-3 business days expectation line', () => {
    const out = buildOrderConfirmationEmail(sampleOrder);
    expect(out.text).toMatch(/2.{0,3}3 business days/);
    expect(out.text).toMatch(/after order payment/);
  });

  it('text body includes the shipping address', () => {
    const out = buildOrderConfirmationEmail(sampleOrder);
    expect(out.text).toMatch(/123 Main St/);
    expect(out.text).toMatch(/Austin/);
    expect(out.text).toMatch(/TX/);
    expect(out.text).toMatch(/78701/);
  });

  it('text body includes the reply-to-change line', () => {
    const out = buildOrderConfirmationEmail(sampleOrder);
    expect(out.text).toMatch(/reply to this email/i);
  });

  it('html body includes item name and formatted total', () => {
    const out = buildOrderConfirmationEmail(sampleOrder);
    expect(out.html).toMatch(/AXIS Flag Alignment Tool/);
    expect(out.html).toMatch(/\$125\.00/);
  });

  it('html escapes user-supplied content', () => {
    const out = buildOrderConfirmationEmail({
      ...sampleOrder,
      customer_name: 'Jane <script>alert(1)</script> Doe',
    });
    expect(out.html).not.toMatch(/<script>/);
    expect(out.html).toMatch(/&lt;script&gt;/);
  });

  it('handles single-name customers without crashing', () => {
    const out = buildOrderConfirmationEmail({ ...sampleOrder, customer_name: 'Jane' });
    expect(out.text).toMatch(/Jane/);
  });
});
```

- [ ] **Step 2: Run tests — they should fail**

Run: `npx vitest run tests/email-order-confirmation.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the builder**

Create `functions/_lib/email-order-confirmation.js`:

```javascript
// functions/_lib/email-order-confirmation.js
// Customer-facing order confirmation email (Choice Tactical branded).
// Order object must include: short_id, customer_email, customer_name,
//   amount_total, amount_shipping, amount_tax, currency, line_items[],
//   shipping_address{}, shipping_rate_name.

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function firstName(full) {
  if (!full) return 'there';
  return String(full).trim().split(/\s+/)[0];
}

function fmtCents(cents) {
  return (cents / 100).toFixed(2);
}

export function buildOrderConfirmationEmail(order) {
  const first = firstName(order.customer_name);
  const shipping = order.shipping_address || {};
  const items = order.line_items || [];

  const subject = `Choice Tactical order ${order.short_id} — thanks for your order, ${first}`;

  // Plain text
  const textLines = [
    `Hi ${first},`,
    ``,
    `Thanks for your Choice Tactical order. Here's a summary:`,
    ``,
    `Order: ${order.short_id}`,
    ``,
    `ITEMS:`,
  ];
  items.forEach(it => {
    textLines.push(`  ${it.qty}x ${it.name}${it.meta ? `  (${it.meta})` : ''} — $${fmtCents(it.total_cents)}`);
  });
  textLines.push(
    ``,
    `Shipping${order.shipping_rate_name ? ` (${order.shipping_rate_name})` : ''}: $${fmtCents(order.amount_shipping)}`,
    `Tax: $${fmtCents(order.amount_tax)}`,
    `TOTAL: $${fmtCents(order.amount_total)}`,
    ``,
    `SHIPPING TO:`,
    `  ${order.customer_name}`,
    `  ${shipping.line1 || ''}`,
  );
  if (shipping.line2) textLines.push(`  ${shipping.line2}`);
  textLines.push(
    `  ${shipping.city || ''}, ${shipping.state || ''} ${shipping.postal_code || ''}`,
    `  ${shipping.country || ''}`,
    ``,
    `WHAT'S NEXT:`,
    `Ships in 2-3 business days after order payment. You'll get a separate email with tracking when it ships.`,
    ``,
    `Need to change something? Reply to this email and we'll take care of it.`,
    ``,
    `— Choice Tactical`,
  );

  // HTML
  const itemRowsHtml = items.map(it => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #eee">
        <strong>${it.qty}× ${esc(it.name)}</strong>
        ${it.meta ? `<br><span style="color:#666;font-size:13px">${esc(it.meta)}</span>` : ''}
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">
        $${fmtCents(it.total_cents)}
      </td>
    </tr>`).join('');

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f6f6f6;margin:0;padding:24px;color:#111">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,.06)">
    <h1 style="margin:0 0 8px;color:#CBB589">Thanks for your order, ${esc(first)}</h1>
    <p style="color:#666;margin:0 0 24px;font-size:14px">Choice Tactical &middot; Order ${esc(order.short_id)}</p>

    <h3 style="font-size:12px;letter-spacing:.1em;color:#888;margin:0 0 6px;text-transform:uppercase">Items</h3>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px">
      ${itemRowsHtml}
      <tr>
        <td style="padding:8px 0;color:#444">Shipping${order.shipping_rate_name ? ` <span style="color:#888;font-size:13px">(${esc(order.shipping_rate_name)})</span>` : ''}</td>
        <td style="padding:8px 0;text-align:right;color:#444">$${fmtCents(order.amount_shipping)}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#444">Tax</td>
        <td style="padding:8px 0;text-align:right;color:#444">$${fmtCents(order.amount_tax)}</td>
      </tr>
      <tr>
        <td style="padding:14px 0 0;font-weight:700;font-size:18px;border-top:2px solid #000">Total</td>
        <td style="padding:14px 0 0;text-align:right;font-weight:700;font-size:18px;border-top:2px solid #000">$${fmtCents(order.amount_total)}</td>
      </tr>
    </table>

    <h3 style="font-size:12px;letter-spacing:.1em;color:#888;margin:0 0 6px;text-transform:uppercase">Shipping to</h3>
    <p style="margin:0 0 24px;line-height:1.6">
      ${esc(order.customer_name)}<br>
      ${esc(shipping.line1 || '')}${shipping.line2 ? '<br>' + esc(shipping.line2) : ''}<br>
      ${esc(shipping.city || '')}, ${esc(shipping.state || '')} ${esc(shipping.postal_code || '')}<br>
      ${esc(shipping.country || '')}
    </p>

    <div style="background:#f4ede0;border-left:4px solid #CBB589;padding:14px 18px;border-radius:4px;margin:0 0 24px">
      <strong style="color:#12161A">What's next:</strong>
      <p style="margin:6px 0 0;color:#444;font-size:14px">Ships in 2-3 business days after order payment. You'll get a separate email with tracking when it ships.</p>
    </div>

    <p style="color:#666;font-size:14px;margin:24px 0 0">
      Need to change something? Reply to this email and we'll take care of it.
    </p>
    <p style="color:#888;font-size:13px;margin:8px 0 0">— Choice Tactical</p>
  </div>
</body></html>`;

  return { subject, html, text: textLines.join('\n') };
}
```

- [ ] **Step 4: Run tests — they should pass**

Run: `npx vitest run tests/email-order-confirmation.test.js`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/email-order-confirmation.js tests/email-order-confirmation.test.js
git commit -m "feat(orders): add customer order confirmation email template"
```

---

## Task 4: Shipping notification email builder + tests

**Files:**
- Create: `functions/_lib/email-order-shipped.js`
- Create: `tests/email-order-shipped.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/email-order-shipped.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { buildOrderShippedEmail } from '../functions/_lib/email-order-shipped.js';

const shippedOrder = {
  id: 'cs_test_abc1234567890',
  short_id: '1234567890',
  customer_email: 'jane@example.com',
  customer_name: 'Jane Doe',
  amount_total: 12500,
  line_items: [
    { qty: 1, name: 'The AXIS Flag Alignment Tool', meta: 'plate_size: 18 mm', total_cents: 11750 }
  ],
  shipping_address: {
    line1: '123 Main St', line2: '', city: 'Austin',
    state: 'TX', postal_code: '78701', country: 'US'
  },
  carrier: 'USPS',
  tracking_number: '9400111899223197428490',
};

describe('buildOrderShippedEmail', () => {
  it('subject calls out shipment with order id', () => {
    const out = buildOrderShippedEmail(shippedOrder);
    expect(out.subject).toMatch(/shipped/i);
    expect(out.subject).toMatch(/1234567890/);
  });

  it('text body includes carrier and tracking number', () => {
    const out = buildOrderShippedEmail(shippedOrder);
    expect(out.text).toMatch(/USPS/);
    expect(out.text).toMatch(/9400111899223197428490/);
  });

  it('text body includes the USPS tracking URL', () => {
    const out = buildOrderShippedEmail(shippedOrder);
    expect(out.text).toMatch(/tools\.usps\.com/);
    expect(out.text).toMatch(/9400111899223197428490/);
  });

  it('html body has a clickable Track button linking to carrier site', () => {
    const out = buildOrderShippedEmail(shippedOrder);
    expect(out.html).toMatch(/Track your package/);
    expect(out.html).toMatch(/tools\.usps\.com/);
  });

  it('UPS carrier produces UPS URL', () => {
    const out = buildOrderShippedEmail({
      ...shippedOrder, carrier: 'UPS', tracking_number: '1Z999AA10123456784'
    });
    expect(out.html).toMatch(/ups\.com\/track/);
  });

  it('text body restates shipping address', () => {
    const out = buildOrderShippedEmail(shippedOrder);
    expect(out.text).toMatch(/123 Main St/);
    expect(out.text).toMatch(/Austin/);
  });

  it('html escapes carrier and tracking number', () => {
    const out = buildOrderShippedEmail({
      ...shippedOrder, carrier: 'Evil<x>', tracking_number: '<script>'
    });
    expect(out.html).not.toMatch(/<script>/);
    expect(out.html).toMatch(/&lt;script&gt;/);
  });
});
```

- [ ] **Step 2: Run tests — they should fail**

Run: `npx vitest run tests/email-order-shipped.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the builder**

Create `functions/_lib/email-order-shipped.js`:

```javascript
// functions/_lib/email-order-shipped.js
// Customer-facing shipping notification email.
import { trackingUrl } from './tracking-urls.js';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function firstName(full) {
  if (!full) return 'there';
  return String(full).trim().split(/\s+/)[0];
}

export function buildOrderShippedEmail(order) {
  const first = firstName(order.customer_name);
  const shipping = order.shipping_address || {};
  const items = order.line_items || [];
  const trackUrl = trackingUrl(order.carrier, order.tracking_number);

  const subject = `Choice Tactical order ${order.short_id} has shipped`;

  const textLines = [
    `Hi ${first},`,
    ``,
    `Good news — your Choice Tactical order ${order.short_id} is on the way.`,
    ``,
    `Carrier: ${order.carrier}`,
    `Tracking #: ${order.tracking_number}`,
    `Track it: ${trackUrl}`,
    ``,
    `SHIPPING TO:`,
    `  ${order.customer_name}`,
    `  ${shipping.line1 || ''}`,
  ];
  if (shipping.line2) textLines.push(`  ${shipping.line2}`);
  textLines.push(
    `  ${shipping.city || ''}, ${shipping.state || ''} ${shipping.postal_code || ''}`,
    `  ${shipping.country || ''}`,
    ``,
    `ITEMS SHIPPED:`,
  );
  items.forEach(it => {
    textLines.push(`  ${it.qty}x ${it.name}${it.meta ? `  (${it.meta})` : ''}`);
  });
  textLines.push(
    ``,
    `Questions? Reply to this email.`,
    ``,
    `— Choice Tactical`,
  );

  const itemRowsHtml = items.map(it => `
    <tr><td style="padding:6px 0;color:#444">
      ${it.qty}× ${esc(it.name)}${it.meta ? `<span style="color:#888;font-size:13px"> — ${esc(it.meta)}</span>` : ''}
    </td></tr>`).join('');

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f6f6f6;margin:0;padding:24px;color:#111">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,.06)">
    <h1 style="margin:0 0 8px;color:#CBB589">Your order has shipped</h1>
    <p style="color:#666;margin:0 0 24px;font-size:14px">Choice Tactical &middot; Order ${esc(order.short_id)}</p>

    <p style="margin:0 0 16px">Hi ${esc(first)}, good news — your order is on the way.</p>

    <h3 style="font-size:12px;letter-spacing:.1em;color:#888;margin:0 0 6px;text-transform:uppercase">Tracking</h3>
    <p style="margin:0 0 6px"><strong>${esc(order.carrier)}</strong></p>
    <p style="margin:0 0 18px;font-family:monospace;font-size:14px">${esc(order.tracking_number)}</p>
    <p style="margin:0 0 28px">
      <a href="${esc(trackUrl)}"
         style="display:inline-block;padding:12px 22px;background:#12161A;color:#CBB589;text-decoration:none;border-radius:8px;font-weight:600">
        Track your package →
      </a>
    </p>

    <h3 style="font-size:12px;letter-spacing:.1em;color:#888;margin:0 0 6px;text-transform:uppercase">Shipping to</h3>
    <p style="margin:0 0 24px;line-height:1.6">
      ${esc(order.customer_name)}<br>
      ${esc(shipping.line1 || '')}${shipping.line2 ? '<br>' + esc(shipping.line2) : ''}<br>
      ${esc(shipping.city || '')}, ${esc(shipping.state || '')} ${esc(shipping.postal_code || '')}<br>
      ${esc(shipping.country || '')}
    </p>

    <h3 style="font-size:12px;letter-spacing:.1em;color:#888;margin:0 0 6px;text-transform:uppercase">Items shipped</h3>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px">${itemRowsHtml}</table>

    <p style="color:#666;font-size:14px;margin:24px 0 0">Questions? Reply to this email.</p>
    <p style="color:#888;font-size:13px;margin:8px 0 0">— Choice Tactical</p>
  </div>
</body></html>`;

  return { subject, html, text: textLines.join('\n') };
}
```

- [ ] **Step 4: Run tests — they should pass**

Run: `npx vitest run tests/email-order-shipped.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/email-order-shipped.js tests/email-order-shipped.test.js
git commit -m "feat(orders): add shipping notification email template"
```

---

## Task 5: Admin auth helper + tests

**Files:**
- Create: `functions/_lib/admin-auth.js`
- Create: `tests/admin-auth.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/admin-auth.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { verifyAdminKey } from '../functions/_lib/admin-auth.js';

function mkRequest({ url = 'https://example.com/admin', headers = {} } = {}) {
  return new Request(url, { headers });
}

describe('verifyAdminKey', () => {
  const env = { ADMIN_KEY: 'super-long-random-secret-32chars-xyz' };

  it('accepts a matching key via query string', () => {
    const req = mkRequest({ url: 'https://x.com/?key=super-long-random-secret-32chars-xyz' });
    expect(verifyAdminKey(req, env)).toBe(true);
  });

  it('accepts a matching key via x-admin-key header', () => {
    const req = mkRequest({ headers: { 'x-admin-key': 'super-long-random-secret-32chars-xyz' } });
    expect(verifyAdminKey(req, env)).toBe(true);
  });

  it('rejects a wrong key', () => {
    const req = mkRequest({ url: 'https://x.com/?key=wrong' });
    expect(verifyAdminKey(req, env)).toBe(false);
  });

  it('rejects when no key is provided', () => {
    const req = mkRequest();
    expect(verifyAdminKey(req, env)).toBe(false);
  });

  it('rejects when ADMIN_KEY env var is missing', () => {
    const req = mkRequest({ url: 'https://x.com/?key=anything' });
    expect(verifyAdminKey(req, {})).toBe(false);
  });

  it('rejects when ADMIN_KEY env var is empty', () => {
    const req = mkRequest({ url: 'https://x.com/?key=' });
    expect(verifyAdminKey(req, { ADMIN_KEY: '' })).toBe(false);
  });

  it('rejects keys of different length (does not leak length via short-circuit)', () => {
    const req = mkRequest({ url: 'https://x.com/?key=short' });
    expect(verifyAdminKey(req, env)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — they should fail**

Run: `npx vitest run tests/admin-auth.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the verifier**

Create `functions/_lib/admin-auth.js`:

```javascript
// functions/_lib/admin-auth.js
// Constant-time comparison of an admin key supplied via ?key=<value>
// or the x-admin-key header against the ADMIN_KEY env secret.

function constantTimeEq(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function verifyAdminKey(request, env) {
  const expected = env && env.ADMIN_KEY;
  if (!expected) return false;

  const url = new URL(request.url);
  const queryKey = url.searchParams.get('key') || '';
  const headerKey = request.headers.get('x-admin-key') || '';
  const supplied = queryKey || headerKey;
  if (!supplied) return false;

  return constantTimeEq(supplied, expected);
}
```

- [ ] **Step 4: Run tests — they should pass**

Run: `npx vitest run tests/admin-auth.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/admin-auth.js tests/admin-auth.test.js
git commit -m "feat(orders): add admin key verifier with constant-time compare"
```

---

## Task 6: Update Stripe webhook to insert order + send customer email

**Files:**
- Modify: `functions/api/stripe-webhook.js`

This task changes existing production code. No new tests — the webhook handler integrates D1, Resend, and Stripe APIs which are awkward to unit-test in Node. We verify via manual test order in Task 11.

- [ ] **Step 1: Add imports and order-building helpers at the top**

In `functions/api/stripe-webhook.js`, **after** the existing top-of-file docblock and **before** `export async function onRequestPost`, add:

```javascript
import { buildOrderConfirmationEmail } from '../_lib/email-order-confirmation.js';

// Convert a Stripe session into a plain order object matching the D1 schema.
function sessionToOrder(session) {
  const customer = session.customer_details || {};
  const shipping = customer.address || {};
  const shippingRate = session.shipping_cost && session.shipping_cost.shipping_rate;
  const metadata = session.metadata || {};

  const lineItems = ((session.line_items && session.line_items.data) || []).map((li, i) => {
    const num = i + 1;
    const itemMeta = {};
    Object.keys(metadata).forEach(k => {
      const m = k.match(new RegExp(`^line_${num}_(.+)$`));
      if (m) itemMeta[m[1]] = metadata[k];
    });
    const metaStr = Object.entries(itemMeta)
      .map(([k, v]) => (k === 'plate_size' ? `Plate: ${v} mm` : `${k}: ${v}`))
      .join(', ');
    return {
      qty: li.quantity || 1,
      name: li.description || 'Item',
      meta: metaStr,
      total_cents: li.amount_total || 0,
    };
  });

  return {
    id: session.id,
    short_id: (session.id || '').slice(-10),
    customer_email: customer.email || '',
    customer_name: customer.name || '',
    amount_total: session.amount_total || 0,
    amount_shipping: (session.shipping_cost && session.shipping_cost.amount_total) || 0,
    amount_tax: (session.total_details && session.total_details.amount_tax) || 0,
    currency: session.currency || 'usd',
    line_items: lineItems,
    shipping_address: {
      line1: shipping.line1 || '',
      line2: shipping.line2 || '',
      city:  shipping.city  || '',
      state: shipping.state || '',
      postal_code: shipping.postal_code || '',
      country: shipping.country || '',
    },
    shipping_rate_name: (shippingRate && shippingRate.display_name) || null,
    payment_intent_id: session.payment_intent || null,
    paid_at: Date.now(),
  };
}

async function insertOrderIfNew(db, order) {
  // Returns true if a NEW row was inserted, false if it already existed.
  const result = await db.prepare(
    `INSERT OR IGNORE INTO orders (
       id, short_id, customer_email, customer_name,
       amount_total, amount_shipping, amount_tax, currency,
       line_items_json, shipping_address_json, shipping_rate_name,
       status, payment_intent_id, paid_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?, 'pending', ?, ?)`
  ).bind(
    order.id, order.short_id, order.customer_email, order.customer_name,
    order.amount_total, order.amount_shipping, order.amount_tax, order.currency,
    JSON.stringify(order.line_items),
    JSON.stringify(order.shipping_address),
    order.shipping_rate_name,
    order.payment_intent_id,
    order.paid_at,
  ).run();
  return (result && result.meta && result.meta.changes) === 1;
}

async function sendCustomerConfirmation(env, order) {
  const fromAddr = env.CUSTOMER_EMAIL_FROM || 'Choice Tactical <orders@choice-tactical.com>';
  const replyTo  = env.REPLY_TO_EMAIL      || 'orders@choice-tactical.com';
  const { subject, html, text } = buildOrderConfirmationEmail(order);

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromAddr,
      to: [order.customer_email],
      reply_to: replyTo,
      subject, html, text,
    }),
  });
  if (!r.ok) {
    const errText = await r.text();
    console.error('Customer confirmation send failed', r.status, errText);
  }
}
```

- [ ] **Step 2: Wire the new helpers into the request handler**

In the same file, find the block that builds and sends the merchant email (`const { html, text, subject } = buildOrderEmail(session);` through the `return new Response('OK', { status: 200 });`). Replace it with:

```javascript
  // Build the normalized order object (used for both D1 insert and customer email)
  const order = sessionToOrder(session);

  // Insert into D1 — idempotent on session id (INSERT OR IGNORE)
  let isNewOrder = false;
  if (env.DB) {
    try {
      isNewOrder = await insertOrderIfNew(env.DB, order);
    } catch (e) {
      console.error('D1 insert failed', e);
    }
  } else {
    console.warn('env.DB not bound — skipping order persistence');
  }

  // Build and send the MERCHANT notification (existing behavior, keep working)
  const { html, text, subject } = buildOrderEmail(session);
  const fromAddr = env.ORDER_EMAIL_FROM || 'Choice Tactical Orders <onboarding@resend.dev>';
  const toAddr   = env.ORDER_EMAIL_TO   || 'orders@choice-tactical.com';

  if (!env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY not set — cannot send email');
    return new Response('Email not configured', { status: 500 });
  }

  const er = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from: fromAddr, to: [toAddr], subject, html, text })
  });
  if (!er.ok) {
    const errText = await er.text();
    console.error('Resend merchant send failed', er.status, errText);
    // Continue — we still want to try the customer email
  }

  // Send CUSTOMER confirmation email (only on NEW order, not on webhook retries)
  if (isNewOrder && order.customer_email) {
    try {
      await sendCustomerConfirmation(env, order);
    } catch (e) {
      console.error('Customer confirmation threw', e);
    }
  }

  return new Response('OK', { status: 200 });
```

- [ ] **Step 3: Verify the modified file is syntactically valid**

Run:
```bash
node --check functions/api/stripe-webhook.js
```
Expected: no output (exit 0).

- [ ] **Step 4: Re-run the full test suite — should still pass**

Run: `npx vitest run`
Expected: all existing tests + the 3 new test files pass.

- [ ] **Step 5: Commit**

```bash
git add functions/api/stripe-webhook.js
git commit -m "feat(orders): persist orders to D1 and send customer confirmation"
```

---

## Task 7: Admin API — list orders endpoint

**Files:**
- Create: `functions/api/orders/list.js`

- [ ] **Step 1: Create the endpoint**

Create `functions/api/orders/list.js`:

```javascript
// functions/api/orders/list.js
// GET /api/orders/list?status=pending&limit=50&key=<ADMIN_KEY>
// Returns recent orders for the admin UI. Token-gated.
import { verifyAdminKey } from '../../_lib/admin-auth.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!verifyAdminKey(request, env)) {
    return new Response('Forbidden', { status: 403 });
  }
  if (!env.DB) {
    return new Response('DB not bound', { status: 500 });
  }

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get('status'); // pending | shipped | null
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 200);

  let sql = `SELECT id, short_id, customer_email, customer_name,
                    amount_total, currency, status, carrier, tracking_number,
                    paid_at, shipped_at, line_items_json, shipping_address_json,
                    shipping_rate_name
             FROM orders`;
  const params = [];
  if (statusFilter) {
    sql += ` WHERE status = ?`;
    params.push(statusFilter);
  }
  sql += ` ORDER BY paid_at DESC LIMIT ?`;
  params.push(limit);

  const stmt = env.DB.prepare(sql).bind(...params);
  const { results } = await stmt.all();

  // Decode JSON columns so the client doesn't have to.
  const orders = (results || []).map(r => ({
    ...r,
    line_items: safeJson(r.line_items_json, []),
    shipping_address: safeJson(r.shipping_address_json, {}),
  }));

  return new Response(JSON.stringify({ orders }), {
    headers: { 'content-type': 'application/json' },
  });
}

function safeJson(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}
```

- [ ] **Step 2: Syntax check**

Run: `node --check functions/api/orders/list.js`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add functions/api/orders/list.js
git commit -m "feat(orders): add admin list-orders endpoint"
```

---

## Task 8: Admin API — ship order endpoint

**Files:**
- Create: `functions/api/orders/ship.js`

- [ ] **Step 1: Create the endpoint**

Create `functions/api/orders/ship.js`:

```javascript
// functions/api/orders/ship.js
// POST /api/orders/ship  body: { order_id, carrier, tracking_number }
// Header: x-admin-key: <ADMIN_KEY>  (or ?key=<...> on the URL)
// Updates the D1 row, then sends the customer the shipping email.
import { verifyAdminKey } from '../../_lib/admin-auth.js';
import { buildOrderShippedEmail } from '../../_lib/email-order-shipped.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!verifyAdminKey(request, env)) {
    return new Response('Forbidden', { status: 403 });
  }
  if (!env.DB) {
    return new Response('DB not bound', { status: 500 });
  }
  if (!env.RESEND_API_KEY) {
    return new Response('Email not configured', { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const orderId = String(body.order_id || '').trim();
  const carrier = String(body.carrier || '').trim();
  const trackingNumber = String(body.tracking_number || '').trim();

  if (!orderId || !carrier || !trackingNumber) {
    return new Response('Missing order_id, carrier, or tracking_number', { status: 400 });
  }
  if (!['USPS', 'UPS'].includes(carrier.toUpperCase())) {
    return new Response('Unsupported carrier (USPS or UPS only)', { status: 400 });
  }

  // Update the row only if it's still pending (idempotent — don't re-send if already shipped)
  const now = Date.now();
  const upd = await env.DB.prepare(
    `UPDATE orders
     SET status = 'shipped', carrier = ?, tracking_number = ?, shipped_at = ?
     WHERE id = ? AND status = 'pending'`
  ).bind(carrier.toUpperCase(), trackingNumber, now, orderId).run();

  const changed = (upd && upd.meta && upd.meta.changes) === 1;
  if (!changed) {
    // Either order doesn't exist or it's already shipped/cancelled
    const existing = await env.DB.prepare(
      `SELECT status FROM orders WHERE id = ?`
    ).bind(orderId).first();
    if (!existing) {
      return new Response('Order not found', { status: 404 });
    }
    return new Response(`Order is ${existing.status}, not pending`, { status: 409 });
  }

  // Fetch the updated row to build the email
  const row = await env.DB.prepare(
    `SELECT id, short_id, customer_email, customer_name,
            line_items_json, shipping_address_json,
            carrier, tracking_number
     FROM orders WHERE id = ?`
  ).bind(orderId).first();

  const order = {
    ...row,
    line_items: safeJson(row.line_items_json, []),
    shipping_address: safeJson(row.shipping_address_json, {}),
  };

  // Build + send the shipping email
  const fromAddr = env.CUSTOMER_EMAIL_FROM || 'Choice Tactical <orders@choice-tactical.com>';
  const replyTo  = env.REPLY_TO_EMAIL      || 'orders@choice-tactical.com';
  const { subject, html, text } = buildOrderShippedEmail(order);

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromAddr,
      to: [order.customer_email],
      reply_to: replyTo,
      subject, html, text,
    }),
  });
  if (!r.ok) {
    const errText = await r.text();
    console.error('Resend shipping send failed', r.status, errText);
    return new Response('Email send failed', { status: 502 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'content-type': 'application/json' },
  });
}

function safeJson(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}
```

- [ ] **Step 2: Syntax check**

Run: `node --check functions/api/orders/ship.js`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add functions/api/orders/ship.js
git commit -m "feat(orders): add admin ship-order endpoint with email send"
```

---

## Task 9: Admin page — desktop orders list

**Files:**
- Create: `shop/admin/orders/index.html`

This is a single self-contained HTML page that calls the list/ship endpoints via fetch. The page reads the `?key=` from the URL on load and forwards it to the API calls so the bookmark "just works".

- [ ] **Step 1: Create the desktop list page**

Create `shop/admin/orders/index.html`:

```html
<!doctype html>
<html><head><meta charset="utf-8"><title>Orders — Choice Tactical Admin</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { --gold: #CBB589; --bg: #0e1116; --card: #181d24; --txt: #e4e4e4; --muted: #999; --ok: #4caf50; --err: #f44336; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: var(--bg); color: var(--txt); margin: 0; padding: 24px; }
  h1 { color: var(--gold); margin: 0 0 4px; }
  .sub { color: var(--muted); margin: 0 0 24px; font-size: 14px; }
  .toolbar { display: flex; gap: 12px; margin: 0 0 16px; flex-wrap: wrap; }
  select, input, button {
    background: var(--card); color: var(--txt); border: 1px solid #2a2f38;
    padding: 10px 14px; border-radius: 6px; font-size: 14px;
  }
  button { cursor: pointer; background: var(--gold); color: #12161A; font-weight: 600; border: none; }
  button:hover { filter: brightness(1.1); }
  .order { background: var(--card); border-radius: 10px; padding: 18px; margin: 0 0 14px; }
  .order-header { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; flex-wrap: wrap; margin: 0 0 10px; }
  .order-id { font-family: monospace; color: var(--gold); font-size: 13px; }
  .order-cust { font-weight: 600; }
  .order-total { font-size: 18px; font-weight: 700; }
  .status { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
  .status.pending { background: #4a3c12; color: #ffd866; }
  .status.shipped { background: #1b3d20; color: #6bd97a; }
  .items, .addr { color: #bbb; font-size: 13px; margin: 4px 0; }
  .ship-form { display: flex; gap: 8px; margin: 12px 0 0; flex-wrap: wrap; align-items: center; }
  .ship-form select { min-width: 100px; }
  .ship-form input { flex: 1; min-width: 200px; }
  .msg { margin: 8px 0 0; font-size: 13px; }
  .msg.ok { color: var(--ok); } .msg.err { color: var(--err); }
  .empty { color: var(--muted); text-align: center; padding: 60px 20px; }
</style></head>
<body>
  <h1>Orders</h1>
  <p class="sub">Choice Tactical admin · <a href="ship.html" style="color:var(--gold)">Phone-friendly form →</a></p>

  <div class="toolbar">
    <select id="filter">
      <option value="pending">Pending (need to ship)</option>
      <option value="shipped">Shipped</option>
      <option value="">All</option>
    </select>
    <button onclick="loadOrders()">Refresh</button>
  </div>

  <div id="orders"><div class="empty">Loading…</div></div>

<script>
  const urlParams = new URLSearchParams(location.search);
  const adminKey = urlParams.get('key') || '';
  if (!adminKey) {
    document.getElementById('orders').innerHTML =
      '<div class="empty">Missing ?key=… in URL. Use the bookmarked admin URL.</div>';
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, m =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function fmtMoney(cents) { return '$' + (cents / 100).toFixed(2); }
  function fmtDate(ms) { return new Date(ms).toLocaleString(); }

  async function loadOrders() {
    if (!adminKey) return;
    const status = document.getElementById('filter').value;
    const qs = new URLSearchParams({ key: adminKey });
    if (status) qs.set('status', status);
    const r = await fetch('/api/orders/list?' + qs.toString());
    if (!r.ok) {
      document.getElementById('orders').innerHTML =
        '<div class="empty">Failed to load: ' + r.status + '</div>';
      return;
    }
    const { orders } = await r.json();
    renderOrders(orders);
  }

  function renderOrders(orders) {
    if (!orders.length) {
      document.getElementById('orders').innerHTML = '<div class="empty">No orders.</div>';
      return;
    }
    document.getElementById('orders').innerHTML = orders.map(o => {
      const addr = o.shipping_address || {};
      const itemsText = (o.line_items || [])
        .map(i => `${i.qty}× ${i.name}${i.meta ? ` (${i.meta})` : ''}`).join(', ');
      const isPending = o.status === 'pending';
      const trackingLine = isPending ? '' : `
        <div class="items">Tracking: <strong>${esc(o.carrier || '')}</strong> ${esc(o.tracking_number || '')} — shipped ${o.shipped_at ? fmtDate(o.shipped_at) : ''}</div>`;
      const shipForm = isPending ? `
        <form class="ship-form" onsubmit="event.preventDefault(); shipIt(this, '${esc(o.id)}')">
          <select name="carrier" required>
            <option value="">Carrier…</option>
            <option value="USPS">USPS</option>
            <option value="UPS">UPS</option>
          </select>
          <input name="tracking" placeholder="Tracking number" required autocomplete="off">
          <button type="submit">Mark Shipped + Email Customer</button>
          <span class="msg"></span>
        </form>` : '';
      return `
        <div class="order">
          <div class="order-header">
            <div>
              <div class="order-id">${esc(o.short_id)} · ${fmtDate(o.paid_at)}</div>
              <div class="order-cust">${esc(o.customer_name)} &lt;${esc(o.customer_email)}&gt;</div>
            </div>
            <div style="text-align:right">
              <span class="status ${esc(o.status)}">${esc(o.status)}</span>
              <div class="order-total">${fmtMoney(o.amount_total)}</div>
            </div>
          </div>
          <div class="items">${esc(itemsText)}</div>
          <div class="addr">Ship to: ${esc(addr.line1 || '')}${addr.line2 ? ', ' + esc(addr.line2) : ''}, ${esc(addr.city || '')}, ${esc(addr.state || '')} ${esc(addr.postal_code || '')} ${esc(addr.country || '')}</div>
          ${trackingLine}
          ${shipForm}
        </div>`;
    }).join('');
  }

  async function shipIt(form, orderId) {
    const carrier = form.carrier.value;
    const tracking = form.tracking.value.trim();
    const msg = form.querySelector('.msg');
    msg.className = 'msg'; msg.textContent = 'Sending…';
    const r = await fetch('/api/orders/ship', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({ order_id: orderId, carrier, tracking_number: tracking }),
    });
    if (r.ok) {
      msg.className = 'msg ok';
      msg.textContent = 'Shipped and emailed.';
      setTimeout(loadOrders, 800);
    } else {
      const t = await r.text();
      msg.className = 'msg err';
      msg.textContent = 'Failed: ' + t;
    }
  }

  document.getElementById('filter').addEventListener('change', loadOrders);
  loadOrders();
</script>
</body></html>
```

- [ ] **Step 2: Commit**

```bash
git add shop/admin/orders/index.html
git commit -m "feat(orders): add desktop orders admin list page"
```

---

## Task 10: Admin page — phone-friendly ship form

**Files:**
- Create: `shop/admin/orders/ship.html`

- [ ] **Step 1: Create the phone form**

Create `shop/admin/orders/ship.html`:

```html
<!doctype html>
<html><head><meta charset="utf-8"><title>Ship Order — Choice Tactical</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { --gold: #CBB589; --bg: #0e1116; --card: #181d24; --txt: #e4e4e4; --muted: #999; --ok: #4caf50; --err: #f44336; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: var(--bg); color: var(--txt); margin: 0; padding: 20px; }
  h1 { color: var(--gold); margin: 0 0 4px; font-size: 22px; }
  .sub { color: var(--muted); margin: 0 0 24px; font-size: 14px; }
  label { display: block; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; margin: 16px 0 4px; }
  input, select, button {
    width: 100%; background: var(--card); color: var(--txt); border: 1px solid #2a2f38;
    padding: 14px; border-radius: 8px; font-size: 16px;
  }
  button { background: var(--gold); color: #12161A; font-weight: 700; border: none; margin-top: 18px; }
  .order-card { background: var(--card); border-radius: 10px; padding: 14px; margin: 0 0 6px; font-size: 14px; }
  .order-card .id { color: var(--gold); font-family: monospace; font-size: 13px; }
  .order-card .cust { font-weight: 600; margin: 4px 0; }
  .order-card .addr { color: #bbb; font-size: 13px; }
  .msg { margin: 14px 0 0; font-size: 14px; padding: 10px; border-radius: 6px; display: none; }
  .msg.ok { display: block; background: #1b3d20; color: var(--ok); }
  .msg.err { display: block; background: #3d1b1b; color: var(--err); }
</style></head>
<body>
  <h1>Ship an order</h1>
  <p class="sub"><a href="index.html" style="color:var(--gold)">← Desktop list view</a></p>

  <label for="order">Pending order</label>
  <select id="order">
    <option value="">Loading orders…</option>
  </select>

  <div id="orderInfo"></div>

  <label for="carrier">Carrier</label>
  <select id="carrier">
    <option value="USPS">USPS</option>
    <option value="UPS">UPS</option>
  </select>

  <label for="tracking">Tracking number</label>
  <input id="tracking" autocomplete="off" autocapitalize="characters" inputmode="text" placeholder="9400 1118 9922 …">

  <button id="shipBtn">Mark Shipped + Email Customer</button>

  <div class="msg" id="msg"></div>

<script>
  const urlParams = new URLSearchParams(location.search);
  const adminKey = urlParams.get('key') || '';
  let pendingOrders = [];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, m =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function fmtMoney(cents) { return '$' + (cents / 100).toFixed(2); }

  async function loadPending() {
    const r = await fetch('/api/orders/list?status=pending&key=' + encodeURIComponent(adminKey));
    if (!r.ok) {
      document.getElementById('order').innerHTML = '<option value="">Failed to load (' + r.status + ')</option>';
      return;
    }
    const { orders } = await r.json();
    pendingOrders = orders;
    const sel = document.getElementById('order');
    if (!orders.length) {
      sel.innerHTML = '<option value="">No pending orders</option>';
      return;
    }
    sel.innerHTML = '<option value="">— pick an order —</option>' + orders.map(o =>
      `<option value="${esc(o.id)}">${esc(o.short_id)} · ${esc(o.customer_name)} · ${fmtMoney(o.amount_total)}</option>`
    ).join('');
  }

  document.getElementById('order').addEventListener('change', () => {
    const id = document.getElementById('order').value;
    const o = pendingOrders.find(x => x.id === id);
    const info = document.getElementById('orderInfo');
    if (!o) { info.innerHTML = ''; return; }
    const a = o.shipping_address || {};
    const items = (o.line_items || []).map(i => `${i.qty}× ${i.name}`).join(', ');
    info.innerHTML = `
      <div class="order-card">
        <div class="id">${esc(o.short_id)}</div>
        <div class="cust">${esc(o.customer_name)} &lt;${esc(o.customer_email)}&gt;</div>
        <div>${esc(items)}</div>
        <div class="addr">${esc(a.line1 || '')}${a.line2 ? ', ' + esc(a.line2) : ''}, ${esc(a.city || '')}, ${esc(a.state || '')} ${esc(a.postal_code || '')}</div>
      </div>`;
  });

  document.getElementById('shipBtn').addEventListener('click', async () => {
    const orderId = document.getElementById('order').value;
    const carrier = document.getElementById('carrier').value;
    const tracking = document.getElementById('tracking').value.trim();
    const msg = document.getElementById('msg');
    msg.className = 'msg';
    if (!orderId || !tracking) {
      msg.className = 'msg err'; msg.textContent = 'Pick an order and enter a tracking number.';
      return;
    }
    msg.className = 'msg'; msg.textContent = '';
    document.getElementById('shipBtn').disabled = true;

    const r = await fetch('/api/orders/ship', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({ order_id: orderId, carrier, tracking_number: tracking }),
    });
    document.getElementById('shipBtn').disabled = false;
    if (r.ok) {
      msg.className = 'msg ok';
      msg.textContent = 'Shipped and customer emailed.';
      document.getElementById('tracking').value = '';
      document.getElementById('orderInfo').innerHTML = '';
      loadPending();
    } else {
      const t = await r.text();
      msg.className = 'msg err';
      msg.textContent = 'Failed: ' + t;
    }
  });

  if (!adminKey) {
    document.getElementById('msg').className = 'msg err';
    document.getElementById('msg').textContent = 'Missing ?key=… in URL. Use the bookmarked admin URL.';
  } else {
    loadPending();
  }
</script>
</body></html>
```

- [ ] **Step 2: Commit**

```bash
git add shop/admin/orders/ship.html
git commit -m "feat(orders): add phone-friendly ship-order form"
```

---

## Task 11: Apply migration to remote, set env vars, deploy, end-to-end test

This is the rollout step. Each sub-step is irreversible against production — pause and verify between sub-steps.

- [ ] **Step 1: Apply migration to REMOTE D1**

Run:
```bash
cd ~/choice-tactical-website
npx wrangler d1 execute customer_pictures --remote --file=migrations/0002_create_orders.sql
```

Expected: `🌀 Executing on remote database ... ✅ Executed 3 commands`.

Verify with:
```bash
npx wrangler d1 execute customer_pictures --remote --command="SELECT name FROM sqlite_master WHERE type='table';"
```
Expected output includes both `customer_pictures` and `orders`.

- [ ] **Step 2: Generate a long random ADMIN_KEY**

Run:
```bash
openssl rand -base64 36 | tr -d '/+=' | head -c 40
```

Copy the output. Save it to a password manager. You'll need it for every admin URL.

- [ ] **Step 3: Set the new Cloudflare Pages secrets**

Run, replacing the value after `=` with the key you generated:
```bash
npx wrangler pages secret put ADMIN_KEY --project-name=choice-tactical-website
# paste the key, hit enter
```

Then set the customer-facing from address (only if you've verified the domain in Resend; otherwise leave default in code):
```bash
npx wrangler pages secret put CUSTOMER_EMAIL_FROM --project-name=choice-tactical-website
# value: Choice Tactical <orders@choice-tactical.com>
```

And the reply-to:
```bash
npx wrangler pages secret put REPLY_TO_EMAIL --project-name=choice-tactical-website
# value: orders@choice-tactical.com
```

Verify all secrets are set:
```bash
npx wrangler pages secret list --project-name=choice-tactical-website
```
Expected: list includes `ADMIN_KEY`, `CUSTOMER_EMAIL_FROM`, `REPLY_TO_EMAIL`, plus the pre-existing `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `ORDER_EMAIL_FROM`, `ORDER_EMAIL_TO`.

- [ ] **Step 4: Deploy**

Run:
```bash
npx wrangler pages deploy . --project-name=choice-tactical-website --commit-dirty=true
```

Expected: a deployment URL printed. Site goes live in ~30 seconds.

- [ ] **Step 5: End-to-end test — Stripe TEST mode order**

1. Switch the Stripe Dashboard to **Test mode** (top-right toggle).
2. Go to your live site and click any product → Buy → checkout.
3. Use Stripe test card `4242 4242 4242 4242`, any future expiry, any CVC, any postal.
4. Use a **real email address you control** (so you can read the customer email).
5. Submit the order.

Expected:
- You (merchant) receive the existing "New order …" email at `orders@choice-tactical.com`.
- The test email address receives the **new** "Choice Tactical order … — thanks for your order" branded email.
- The order appears in the admin list at `https://choice-tactical.com/shop/admin/orders/?key=<ADMIN_KEY>`.

If the customer email does NOT arrive:
- Check Resend logs at `resend.com` → Emails. If the send failed, the error message tells you why (most common: domain not verified, or `CUSTOMER_EMAIL_FROM` uses an unverified domain).
- Check Cloudflare Pages logs: `npx wrangler pages deployment tail --project-name=choice-tactical-website` — look for `Customer confirmation send failed` lines.

- [ ] **Step 6: End-to-end test — Ship the test order**

1. Open `https://choice-tactical.com/shop/admin/orders/?key=<ADMIN_KEY>` on desktop.
2. Verify the test order appears with status PENDING.
3. In the inline form: pick **USPS**, paste any 20-digit string (e.g., `9400100000000000000000`), click **Mark Shipped + Email Customer**.
4. Verify the test customer email receives the "Your order has shipped" email with a clickable USPS tracking button.
5. Refresh the admin page — the order's status should now be `shipped` with the carrier + tracking number visible.

- [ ] **Step 7: Phone-form smoke test**

1. On your iPhone, open `https://choice-tactical.com/shop/admin/orders/ship.html?key=<ADMIN_KEY>`.
2. Verify it loads (or shows "No pending orders" if you shipped them all).
3. Place another test order, then return to the phone form. Confirm the order appears in the dropdown and shipping works.

- [ ] **Step 8: Final commit + record env-var changes**

Nothing to commit if all code was already committed in earlier tasks. Run:
```bash
git status
```
Expected: clean working tree.

If status shows uncommitted files (e.g., wrangler-related), review and decide. Do NOT commit anything that contains the `ADMIN_KEY` value.

- [ ] **Step 9: Flip on Stripe's built-in receipts (belt + suspenders)**

Manual step, not code:
- Stripe Dashboard → Search "customer emails" → Settings page
- Or direct: `https://dashboard.stripe.com/settings/emails`
- Toggle **Successful payments** ON in **Live mode**.

This means future paying customers receive BOTH the branded Choice Tactical email AND a Stripe receipt with card last-4. The Stripe receipt is the official financial record; yours is the brand layer.

---

## Done when

- [ ] Test order produced both merchant email AND customer confirmation email
- [ ] Test order appears in admin list with pending status
- [ ] Shipping the test order produced the shipping email with working tracking link
- [ ] Phone form is reachable and functional
- [ ] Stripe built-in receipts toggle is ON in live mode
- [ ] No `ADMIN_KEY` value committed to git
