# Precision Gear Store — Status & Next Steps

**Branch:** `feat/precision-gear-store` (pushed to GitHub)
**PR URL:** https://github.com/bertkiefer/choice-tactical-website/pull/new/feat/precision-gear-store
**Date:** 2026-04-17

## What's Done

All 14 planned tasks are implemented and committed. 16 commits on the branch. Site is functional end-to-end with placeholder products.

### Verified working (automated smoke test passed 12/12 checks after null-body bug fix):

- `/` — splash page with App Development vs Precision Gear choice
- `/apps/` — App Development landing (moved from old `/`)
- `/apps/precisionload.html`, `/apps/rangecommand.html`, `/apps/contact.html`, `/apps/screenshots.html` — moved
- `/privacy.html` — UNCHANGED (App Store dependency preserved)
- Old URLs 301-redirect to new `/apps/` locations
- `/shop/` — product grid renders from `shop/products.json`
- `/shop/<slug>/` — pretty URL rewrites to `/shop/product.html?slug=<slug>`
- `/shop/cart/` — cart UI with qty editing, line removal, subtotal
- `/shop/thanks/?session=...` — clears cart, shows session reference
- `/api/create-checkout` — Cloudflare Function creates Stripe Checkout Sessions, validates input properly

### Files added/changed:

- New: `index.html` (splash), `apps/index.html` (+ 4 moved pages), `shop/index.html`, `shop/product.html`, `shop/cart/index.html`, `shop/thanks/index.html`, `shop/products.json`, 3 SVG placeholders
- New: `css/shop.css`, `js/shop.js`
- New: `functions/api/create-checkout.js` (Stripe integration)
- New: `_redirects` (Cloudflare rewrites)
- New: `package.json`, `wrangler.toml`, `.gitignore` (dev tooling)
- Modified: `includes/nav.html` (Shop + Cart entries, badge)

## What You Need To Do (when back)

### 1. Test locally

```bash
cd ~/choice-tactical-website
git checkout feat/precision-gear-store
npm install            # pulls wrangler (first time only)
npm run dev            # serves on http://localhost:8788
```

Walk through:
- Open http://localhost:8788 → splash with two cards
- Click "App Development" → your current site (now at `/apps/`)
- Click "Precision Gear" → shop with 3 placeholder products
- Add 2 of Sample Product One to cart, add 1 of Sample Product Two
- Click cart → subtotal $189.97
- Change qty, remove items — all works client-side
- Click Checkout → expected: red error banner ("Invalid API Key…") because `.dev.vars` has a placeholder. This proves the Function is reachable and talking to Stripe.

### 2. Hook up Stripe test mode (still local)

a. Create a Stripe account (free, skip business details for now — test mode doesn't need them).

b. In Stripe Dashboard → Products:
   - Create "Sample Product One" with a one-time $49.99 Price. Copy the `price_...` ID.
   - Create "Sample Product Two" with a one-time $89.99 Price. Copy the `price_...` ID.
   - You can skip creating Sample Product Three (it's marked out-of-stock, won't hit Stripe).

c. Edit `shop/products.json` — replace `price_PLACEHOLDER_ONE` and `price_PLACEHOLDER_TWO` with your real IDs.

d. In Stripe Dashboard → Settings → Tax → Enable Stripe Tax + set your origin address.

e. In Stripe Dashboard → Shipping → Create a shipping rate (e.g., "Standard Ground $8.00"). Copy its `shr_...` ID.

f. In Stripe Dashboard → Developers → API Keys → copy your **test** Secret key (starts with `sk_test_`).

g. Edit `.dev.vars` at repo root (NOT committed, in .gitignore):
   ```
   STRIPE_SECRET_KEY=sk_test_your_real_test_key
   STRIPE_SHIPPING_RATE_IDS=shr_your_shipping_rate_id
   ```

h. `npm run dev` again. Go through the flow. Use test card `4242 4242 4242 4242`, any future expiry, any CVC, any address. You should reach Stripe's hosted page, complete payment, return to `/shop/thanks`.

### 3. Deploy to Cloudflare Pages

a. Sign up at cloudflare.com (free).

b. Cloudflare Pages → Create project → Connect to Git → pick `bertkiefer/choice-tactical-website` → pick branch `feat/precision-gear-store` for preview (or merge to `main` first and use `main`).

c. Build settings: leave everything default (no build command, no build output dir — wrangler.toml handles it).

d. Deploy. First deploy takes ~30s.

e. Settings → Environment Variables → Preview (and Production when you're ready):
   - `STRIPE_SECRET_KEY` = your test key (for preview) / live key (for production)
   - `STRIPE_SHIPPING_RATE_IDS` = your shipping rate IDs (comma-separated)

f. Test on the preview URL (Cloudflare gives you `feat-precision-gear-store.choice-tactical-website.pages.dev` or similar).

### 4. DNS swap (when preview looks good)

In your DNS provider for `choice-tactical.com`:
- Change `www` record → CNAME to `choice-tactical-website.pages.dev` (Cloudflare shows exact target in dashboard).

Wait for propagation. Your domain now hits Cloudflare Pages, not GitHub Pages.

### 5. Merge and ship

```bash
git checkout main
git merge feat/precision-gear-store
git push
```

Cloudflare Pages auto-deploys from `main`. Production environment variables kick in. Set them with your **live** Stripe keys.

### 6. Go live

1. Replace test `price_...` in `products.json` with live `price_...`.
2. Replace test shipping rate ID with live one.
3. Make a real $0.01 purchase yourself, verify the whole flow. Refund yourself in Stripe Dashboard.
4. Ship. 🎯

---

## Known Quirks

- `wrangler pages dev` locally strips `.html` extensions (issues 308s). This is Cloudflare's normal behavior; production serves correctly.
- `_redirects` has explicit carve-outs for `/shop/cart/` and `/shop/thanks/` that must stay BEFORE the `/shop/:slug/` wildcard. If you add more non-product subpages to `/shop/` (e.g., `/shop/shipping/`), add explicit rules for them too.
- The Cloudflare Function rejects `null`/non-object bodies with a clean 400 (caught in integration testing).

## Commits

```
c737f2c fix: reject null / non-object request body with 400 instead of crashing
153dd05 feat: thanks page clears cart and displays Stripe session reference
e5ddb19 feat: wire cart checkout button to /api/create-checkout
a1d84ec feat: Cloudflare Pages Function to create Stripe Checkout sessions
c952f6a feat: cart page with qty editing, line removal, and subtotal
85f6487 feat: cart storage in localStorage + add-to-cart + nav badge
631f898 feat: product detail page with quantity selector and add-to-cart
795568c feat: shop landing page renders product grid from products.json
cad4cba feat: add product catalog JSON with placeholder products
92625bc feat: add _redirects for old app URLs + shop pretty URLs
6b33688 feat: update nav with Apps, Shop, and cart badge entry
5a0e98d feat: replace root index with App Development vs Precision Gear splash
1944294 fix: rewrite absolute sibling links inside /apps/ to /apps/ paths
988139a feat: add /apps/ landing page (App Development hub)
72c99f7 refactor: move app-side pages under /apps/ directory
61fc6a9 chore: add wrangler dev dependency + Cloudflare Pages config
```
