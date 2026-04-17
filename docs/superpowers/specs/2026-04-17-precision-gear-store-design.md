# Choice Tactical Website — Splash + Precision Gear Store

**Date:** 2026-04-17
**Repo:** `bertkiefer/choice-tactical-website`
**Domain:** `www.choice-tactical.com`

## Context

The current site is a static HTML/CSS/JS marketing site for two software products (PrecisionLoad Suite, Range Command), deployed via GitHub Pages. The owner is launching a line of physical precision-shooting products under the label **"Precision Gear"** and wants:

1. A top-level splash page that lets visitors choose between **App Development** (existing software side) and **Precision Gear** (new storefront).
2. A complete storefront for 1–5 mid-size physical products with a real shopping cart and Stripe-powered credit card checkout.

Existing products, App Store privacy-policy dependencies, and the site's current visual language must be preserved.

## Goals

- Ship a functional storefront with Stripe Checkout for 1–5 mid-size products.
- Preserve `/privacy.html` URL (App Store submission references it).
- Reuse existing CSS (`style.css`, `components.css`, `animations.css`) — no new design system.
- Zero monthly hosting cost.
- Owner can edit products without code changes after launch.

## Non-Goals (out of scope for v1)

- Multi-currency pricing (USD only).
- International shipping (US only for v1; set Stripe shipping to US destinations).
- Inventory automation — `inStock` flag toggled manually in `products.json`.
- Customer accounts / login — guest checkout only, Stripe handles receipts.
- Subscription products.
- Blog or marketing CMS.
- Product reviews / ratings.

## Architecture

Three moving parts, all on free tiers:

1. **Static site** — Cloudflare Pages, served from the same GitHub repo. HTML/CSS/JS only.
2. **One serverless function** — Cloudflare Pages Function at `/functions/api/create-checkout.js`. Receives cart JSON, creates a Stripe Checkout Session, returns the redirect URL.
3. **Stripe Dashboard** — product catalog, tax config, shipping rates, order notifications. Owner-managed, not in code.

```
www.choice-tactical.com (Cloudflare Pages)
├── /                     splash (two cards)
├── /apps/                App Development landing (existing homepage, moved)
├── /apps/precisionload   was /precisionload.html
├── /apps/rangecommand    was /rangecommand.html
├── /apps/contact         was /contact.html
├── /apps/screenshots     was /screenshots.html
├── /privacy.html         UNCHANGED — App Store link dependency
├── /shop/                Precision Gear storefront (product grid)
├── /shop/<slug>/         product detail page
├── /shop/cart/           cart review + Checkout button
├── /shop/thanks/         post-purchase landing
└── /api/create-checkout  Cloudflare Pages Function → Stripe
                          ↓ redirect
                    checkout.stripe.com (hosted)
                          ↓ after payment
                    /shop/thanks
```

## Hosting Migration

Current: GitHub Pages. Target: Cloudflare Pages (free, same repo, same domain, adds serverless functions).

**Owner does once:**
1. Sign up at cloudflare.com (free).
2. Cloudflare Pages → "Create project" → connect GitHub → pick `choice-tactical-website` repo → default settings.
3. Add custom domain `www.choice-tactical.com` in Cloudflare Pages.
4. Update DNS: change the `www` record to CNAME `choice-tactical.pages.dev` (Cloudflare shows the exact value in the UI).
5. Wait for DNS propagation (typically minutes, max 24h).

`CNAME` file in repo stays as `www.choice-tactical.com` — Cloudflare honors it the same way GitHub Pages did.

**Deployment unchanged in day-to-day use:** `git push` auto-deploys as before.

## URL Redirects

File: `_redirects` in repo root (Cloudflare Pages native format).

```
/precisionload.html   /apps/precisionload   301
/rangecommand.html    /apps/rangecommand    301
/contact.html         /apps/contact         301
/screenshots.html     /apps/screenshots     301
```

`privacy.html` has NO redirect entry — it stays at its original URL forever.

Old shared links keep working via 301.

## Splash Page (`/`)

Reuses the current homepage's `.product-paths` card pattern but at the top level.

**Content blocks (top to bottom):**

1. Choice Tactical logo (existing `images/logo-main.png`).
2. Tagline: `Precision Software and Gear for Shooters`.
3. Two-card row:
   - **App Development** — icon + "PrecisionLoad Suite + Range Command" + "Explore →" button linking to `/apps/`.
   - **Precision Gear** — icon + "Purpose-built gear for serious shooters" + "Shop Now →" button linking to `/shop/`.
4. Footer (`includes/footer.html` reused).

**Images needed:**
- A small icon or hero representing "apps" (reuse an existing App Store screenshot thumbnail or a generic "laptop/phone" gold-tinted mark).
- A small icon or hero representing "gear" (stock photo of a rifle/accessory or branded graphic — user to supply, placeholder until then).

## App Development Landing (`/apps/`)

Content is a straight move of the existing `/index.html` body. File split:

- `/apps/index.html` gets the current hero + product-paths section minus the outermost "two-choice splash" metaphor (because the splash now lives at `/`).
- Navigation in `includes/nav.html` updated so clicking the logo from anywhere goes to `/` (splash), and a "← Back" style link at the top of `/apps/` returns to splash.
- Existing sub-pages (`precisionload`, `rangecommand`, `contact`, `screenshots`) move into `/apps/` and update their relative links.

## Shop Landing (`/shop/`)

**Data source:** `/shop/products.json` — single file, 1–5 entries.

```json
{
  "products": [
    {
      "slug": "sample-product-1",
      "name": "Sample Product One",
      "tagline": "One-line pitch.",
      "description": "Longer paragraph-form description.",
      "priceUsd": 89.99,
      "stripePriceId": "price_TEST_PLACEHOLDER_1",
      "images": ["/shop/images/product-1-hero.jpg"],
      "weightOz": 24,
      "inStock": true
    }
  ]
}
```

**Rendering:** Client-side JS (`shop.js`) fetches `products.json` on `/shop/` load and injects a grid of tiles. Each tile links to `/shop/<slug>/`.

**Out-of-stock behavior:** Tile shows "Sold Out" badge, no add-to-cart button.

**Placeholder content:** Ships with 3 sample products using lorem-ipsum copy and a stock placeholder image so the flow can be demonstrated end-to-end before real products are ready.

## Product Detail (`/shop/<slug>/`)

**Implementation choice:** One template (`/shop/product.html`) that reads slug from URL query param (`?slug=bullet-sled-v1`) and renders details from `products.json`. Simpler than generating N static pages; fine for 1–5 products.

Pretty URLs (`/shop/<slug>/`) handled via `_redirects`:
```
/shop/:slug/          /shop/product.html?slug=:slug   200
```
(200, not 301 — rewrites without changing the visible URL.)

**Page content:**
- Breadcrumb: `Shop › Product Name`
- Image (first from `images[]`; carousel if >1, reuse existing `carousel.js`)
- Name, tagline, price
- Description
- Quantity selector (1–10)
- Add-to-cart button → adds `{stripePriceId, slug, qty}` to `localStorage.ct_cart`, shows toast "Added to cart", updates cart badge in nav.

## Cart (`/shop/cart/`)

Pure client-side — reads `localStorage.ct_cart`, renders line items.

- Per line: thumbnail · name · qty controls · subtotal · remove button.
- Subtotal only (no tax/shipping preview — "calculated at checkout").
- Two buttons: "Continue Shopping" (→ `/shop/`) and "Checkout" (→ create-checkout flow).
- Empty state: "Your cart is empty" + "Browse Precision Gear" button.

## Checkout Flow

**Frontend (`shop.js`):**
```js
const res = await fetch('/api/create-checkout', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({ items: cart })
});
const { url, error } = await res.json();
if (error) return showError(error);
window.location = url;
```

**Backend (`functions/api/create-checkout.js`):**
- Validates `items` array: each needs non-empty `stripePriceId` and integer `qty` 1–99.
- Calls Stripe API with:
  - `mode: 'payment'`
  - `line_items`: mapped from cart
  - `automatic_tax: { enabled: true }`
  - `shipping_address_collection: { allowed_countries: ['US'] }`
  - `shipping_options`: Stripe shipping-rate IDs configured in Dashboard (owner supplies via env var `STRIPE_SHIPPING_RATE_IDS`)
  - `success_url: https://www.choice-tactical.com/shop/thanks?session={CHECKOUT_SESSION_ID}`
  - `cancel_url: https://www.choice-tactical.com/shop/cart`
- Returns `{ url }`.
- Errors return `{ error: "<user-facing message>" }` with a 400.

**Environment variables (Cloudflare Pages → Settings → Environment):**
- `STRIPE_SECRET_KEY` — live/test secret.
- `STRIPE_SHIPPING_RATE_IDS` — comma-separated shipping rate IDs (e.g., `shr_abc,shr_xyz`).

Two environments: **Preview** uses test keys, **Production** uses live keys. Cloudflare Pages supports this natively.

## Thanks Page (`/shop/thanks/`)

- Reads `session` query param for display ("Order #abc123 confirmed").
- Clears `localStorage.ct_cart`.
- Shows confirmation message, order ID, "continue shopping" + "return home" links.
- Notes that Stripe sent a receipt to the buyer's email.
- **Does not** fetch the full session from Stripe (no server call needed; Stripe's email is the source of truth).

## Stripe Dashboard Setup (owner, one-time)

1. **Products**: create 1–5 products. Each gets a Price. Copy the `price_...` ID into `products.json`.
2. **Tax** → enable Stripe Tax. Set origin address.
3. **Shipping**: create shipping rates (e.g., `Standard Ground $8.00`, `Express $20.00`). Copy each `shr_...` ID.
4. **API Keys**: copy test & live secret keys.
5. Enter Cloudflare Pages → Settings → Environment Variables:
   - `STRIPE_SECRET_KEY` (Preview = test key, Production = live key)
   - `STRIPE_SHIPPING_RATE_IDS` (comma-separated)

## File Layout (new files, repo root)

```
/_redirects                                new (Cloudflare redirects)
/index.html                                REPLACED (splash)
/apps/index.html                           new (copy of old index.html)
/apps/precisionload.html                   new (move of old file)
/apps/rangecommand.html                    new (move of old file)
/apps/contact.html                         new (move of old file)
/apps/screenshots.html                     new (move of old file)
/privacy.html                              UNCHANGED
/shop/index.html                           new (storefront grid)
/shop/product.html                         new (product detail template)
/shop/cart/index.html                      new
/shop/thanks/index.html                    new
/shop/products.json                        new (placeholder products)
/shop/images/placeholder-*.jpg             new (stock placeholders)
/css/shop.css                              new (shop-specific styles; reuses vars from style.css)
/js/shop.js                                new (cart, rendering, checkout POST)
/functions/api/create-checkout.js          new (Cloudflare Pages Function)
/includes/nav.html                         UPDATED (logo links to /, cart badge)
/includes/footer.html                      UNCHANGED
```

## Testing

- **Local**: `wrangler pages dev .` serves the site plus the function locally against the test Stripe key.
- **End-to-end test purchase**: use Stripe test card `4242 4242 4242 4242` with any future expiry, any CVC, any ZIP.
- **Verify**:
  - Cart persists across refresh.
  - Out-of-stock products show badge, no add-to-cart.
  - Checkout creates a session, redirects to Stripe, returns to `/shop/thanks` after test payment.
  - Old URL redirects (e.g., `/precisionload.html` → `/apps/precisionload`).
  - `/privacy.html` still resolves at its original URL.

## Success Criteria

1. Clicking the site root serves the splash with two card choices.
2. Clicking "App Development" reaches the current site's content unchanged.
3. Clicking "Precision Gear" reaches a working storefront with at least placeholder products.
4. Adding items to cart, viewing cart, and proceeding to checkout successfully completes a Stripe test-mode purchase end-to-end.
5. Stripe Dashboard shows the test order with correct line items, shipping, and tax.
6. Replacing placeholder products with real ones requires editing only `products.json` + Cloudflare environment vars — no code changes.
7. `/privacy.html` continues to resolve at the original URL.

## Open Items

- Owner to supply brand language for "Precision Gear" tagline and card copy on the splash page (current placeholder: "Purpose-built gear for serious shooters").
- Owner to supply hero imagery for the two splash cards when available (placeholders used until then).
- Real Stripe product data (names, prices, images, IDs) filled in by owner post-implementation.
