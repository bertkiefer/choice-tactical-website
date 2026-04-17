# Precision Gear Store — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a top-level splash page (App Development vs Precision Gear) and a working Precision Gear storefront with cart + Stripe Checkout, all on `www.choice-tactical.com`.

**Architecture:** Keep the site static HTML/CSS/JS, but migrate hosting from GitHub Pages to Cloudflare Pages so a single serverless function (`/api/create-checkout`) can talk to Stripe. Cart lives in `localStorage`. Products are defined in a single `shop/products.json` file. Stripe Checkout handles payment, tax, shipping address, and receipts. Pages have zero build step — `git push` auto-deploys.

**Tech Stack:** HTML / CSS / vanilla JS · Cloudflare Pages + Pages Functions · Stripe API (Checkout Sessions) · `wrangler` CLI for local dev and preview deploys.

---

## Verification Strategy

This is a static HTML site with no unit-test harness. Every task ends with a **manual verification** step run against `wrangler pages dev .` (serves static files plus the serverless function locally). Each task commits only after the verification passes.

Install `wrangler` once at the top of the repo:

```bash
cd /Users/bert_kiefer_cp_home/choice-tactical-website
npm init -y
npm install --save-dev wrangler
```

Add this to `package.json` scripts so every task uses the same command:

```json
"scripts": {
  "dev": "wrangler pages dev . --compatibility-date=2025-01-01"
}
```

Run dev server: `npm run dev` (serves on `http://localhost:8788`).

---

## File Structure (target after all tasks)

```
choice-tactical-website/
├── _redirects                          # Cloudflare redirects (new)
├── CNAME                               # (unchanged — www.choice-tactical.com)
├── index.html                          # REPLACED → splash page
├── privacy.html                        # UNCHANGED — App Store dependency
├── package.json                        # NEW — wrangler dev dep
├── wrangler.toml                       # NEW — Pages config hints
├── apps/                               # NEW dir — moved app-side pages
│   ├── index.html                      # (was /index.html content)
│   ├── precisionload.html              # moved
│   ├── rangecommand.html               # moved
│   ├── contact.html                    # moved
│   └── screenshots.html                # moved
├── shop/                               # NEW dir
│   ├── index.html                      # product grid
│   ├── product.html                    # detail template (reads ?slug=)
│   ├── cart/index.html                 # cart review
│   ├── thanks/index.html               # post-purchase
│   ├── products.json                   # product catalog
│   └── images/                         # placeholder + real product images
├── css/
│   ├── style.css                       # unchanged
│   ├── components.css                  # unchanged
│   ├── animations.css                  # unchanged
│   └── shop.css                        # NEW — shop-specific styles
├── js/
│   ├── main.js                         # unchanged
│   ├── carousel.js                     # unchanged
│   ├── gallery.js                      # unchanged
│   ├── interactions.js                 # unchanged
│   └── shop.js                         # NEW — cart + checkout
├── includes/
│   ├── nav.html                        # UPDATED — cart badge, logo → /
│   └── footer.html                     # unchanged
└── functions/
    └── api/
        └── create-checkout.js          # NEW — Cloudflare Pages Function
```

**Each file has one purpose.** `shop.js` owns cart state + UI updates. `create-checkout.js` owns Stripe integration. `products.json` owns catalog data. Splitting by responsibility, not layer.

---

## Task 0: Repo dev environment + Cloudflare scaffolding

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `wrangler.toml`

- [ ] **Step 1: Initialize npm and install wrangler**

```bash
cd /Users/bert_kiefer_cp_home/choice-tactical-website
npm init -y
npm install --save-dev wrangler
```

Expected: creates `package.json`, `package-lock.json`, and `node_modules/`.

- [ ] **Step 2: Add dev script to `package.json`**

Open `package.json` and set the `scripts` block:

```json
"scripts": {
  "dev": "wrangler pages dev . --compatibility-date=2025-01-01"
}
```

- [ ] **Step 3: Create `.gitignore`**

Create `.gitignore` at repo root:

```
node_modules/
.wrangler/
.dev.vars
```

- [ ] **Step 4: Create `wrangler.toml`**

Create `wrangler.toml` at repo root:

```toml
name = "choice-tactical-website"
compatibility_date = "2025-01-01"
pages_build_output_dir = "."
```

- [ ] **Step 5: Verify dev server starts**

Run:
```bash
npm run dev
```

Open `http://localhost:8788/` — the current homepage should render. `Ctrl+C` to stop.
Expected: site loads with no console errors.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore wrangler.toml
git commit -m "chore: add wrangler dev dependency + Cloudflare Pages config"
```

---

## Task 1: Move app-side pages under `/apps/`

**Files:**
- Create dir: `apps/`
- Move: `precisionload.html` → `apps/precisionload.html`
- Move: `rangecommand.html` → `apps/rangecommand.html`
- Move: `contact.html` → `apps/contact.html`
- Move: `screenshots.html` → `apps/screenshots.html`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p apps
```

- [ ] **Step 2: Move the four pages**

```bash
git mv precisionload.html apps/precisionload.html
git mv rangecommand.html  apps/rangecommand.html
git mv contact.html       apps/contact.html
git mv screenshots.html   apps/screenshots.html
```

- [ ] **Step 3: Fix internal links within the moved pages**

Each moved page has `href="..."` references to sibling pages plus shared assets. Pages now sit one level deeper, so relative paths break. Rewrite them to absolute paths.

For each of the four files (`apps/precisionload.html`, `apps/rangecommand.html`, `apps/contact.html`, `apps/screenshots.html`), run these replacements:

```bash
for f in apps/precisionload.html apps/rangecommand.html apps/contact.html apps/screenshots.html; do
  sed -i '' \
    -e 's|href="css/|href="/css/|g' \
    -e 's|src="js/|src="/js/|g' \
    -e 's|src="images/|src="/images/|g' \
    -e 's|href="images/|href="/images/|g' \
    -e 's|data-include="includes/|data-include="/includes/|g' \
    -e 's|href="precisionload.html"|href="/apps/precisionload.html"|g' \
    -e 's|href="rangecommand.html"|href="/apps/rangecommand.html"|g' \
    -e 's|href="contact.html"|href="/apps/contact.html"|g' \
    -e 's|href="screenshots.html"|href="/apps/screenshots.html"|g' \
    -e 's|href="privacy.html"|href="/privacy.html"|g' \
    "$f"
done
```

- [ ] **Step 4: Verify**

Run:
```bash
npm run dev
```

Open `http://localhost:8788/apps/precisionload.html` — page should render with images and styles intact. Repeat for `/apps/rangecommand.html`, `/apps/contact.html`, `/apps/screenshots.html`.

Expected: all four pages render correctly, nav appears, all images visible.

- [ ] **Step 5: Commit**

```bash
git add apps/
git commit -m "refactor: move app-side pages under /apps/ directory"
```

---

## Task 2: Create `/apps/index.html` from current homepage

**Files:**
- Create: `apps/index.html` (copy of current `index.html` with adjusted links)

- [ ] **Step 1: Copy current index to apps/**

```bash
cp index.html apps/index.html
```

- [ ] **Step 2: Fix internal links in `apps/index.html`**

```bash
sed -i '' \
  -e 's|href="css/|href="/css/|g' \
  -e 's|src="js/|src="/js/|g' \
  -e 's|src="images/|src="/images/|g' \
  -e 's|href="images/|href="/images/|g' \
  -e 's|data-include="includes/|data-include="/includes/|g' \
  -e 's|href="precisionload.html"|href="/apps/precisionload.html"|g' \
  -e 's|href="rangecommand.html"|href="/apps/rangecommand.html"|g' \
  -e 's|href="contact.html"|href="/apps/contact.html"|g' \
  -e 's|href="screenshots.html"|href="/apps/screenshots.html"|g' \
  apps/index.html
```

- [ ] **Step 3: Update `data-page` attribute**

Open `apps/index.html` and find `<body data-page="home">`. Change to:

```html
<body data-page="apps">
```

(So the nav doesn't mark "Home" as active when the visitor is on the apps landing.)

- [ ] **Step 4: Verify**

Run:
```bash
npm run dev
```

Open `http://localhost:8788/apps/` — should render the current homepage content (PrecisionLoad + Range Command cards) correctly.

- [ ] **Step 5: Commit**

```bash
git add apps/index.html
git commit -m "feat: add /apps/ landing page (App Development hub)"
```

---

## Task 3: Replace root `index.html` with the splash page

**Files:**
- Modify: `index.html` (full rewrite)

- [ ] **Step 1: Overwrite `index.html`**

Replace the entire contents of `/Users/bert_kiefer_cp_home/choice-tactical-website/index.html` with:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Choice Tactical — Precision Software and Gear for Shooters</title>
  <meta name="description" content="Choice Tactical builds precision software and gear for serious shooters. PrecisionLoad Suite and Range Command apps, plus the Precision Gear store.">
  <link rel="icon" type="image/png" href="/images/favicon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/style.css">
  <link rel="stylesheet" href="/css/components.css">
  <link rel="stylesheet" href="/css/animations.css">
</head>
<body data-page="splash">

  <main>
    <section class="hero">
      <div class="hero-content">
        <img src="/images/logo-main.png" alt="Choice Tactical" class="hero-logo">
        <h1 class="hero-title">Precision Software and Gear<br>for Shooters</h1>
        <p class="hero-subtitle">Choose your path.</p>

        <div class="product-paths fade-in">
          <a class="product-path hover-glow" href="/apps/">
            <div class="product-path-logo-large">
              <img src="/images/logo-precisionload-cropped.png" alt="Apps">
            </div>
            <h2 class="product-path-name">App Development</h2>
            <p class="product-path-audience">For Shooters &amp; Range Operators</p>
            <p class="product-path-description">PrecisionLoad Suite and Range Command — precision software built for real-world use.</p>
            <span class="product-path-cta">Explore Apps →</span>
          </a>

          <a class="product-path hover-glow" href="/shop/">
            <div class="product-path-logo-large">
              <img src="/images/logo-main.png" alt="Precision Gear">
            </div>
            <h2 class="product-path-name">Precision Gear</h2>
            <p class="product-path-audience">Purpose-built shooting gear</p>
            <p class="product-path-description">Purpose-built gear for serious shooters — designed and tested by the Choice Tactical team.</p>
            <span class="product-path-cta">Shop Now →</span>
          </a>
        </div>
      </div>
    </section>
  </main>

  <div data-include="/includes/footer.html"></div>

  <script src="/js/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: Verify**

Run:
```bash
npm run dev
```

Open `http://localhost:8788/` — should now show the splash page with two cards. Clicking "Explore Apps →" navigates to `/apps/`. Clicking "Shop Now →" goes to `/shop/` which will 404 until Task 5.

Expected: splash renders with existing styles, two cards visible, links work.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: replace root index with App Development vs Precision Gear splash"
```

---

## Task 4: Update navigation for new structure

**Files:**
- Modify: `includes/nav.html`

- [ ] **Step 1: Replace nav contents**

Overwrite `/Users/bert_kiefer_cp_home/choice-tactical-website/includes/nav.html` with:

```html
<nav id="navbar" class="navbar">
  <div class="nav-container">
    <a href="/" class="nav-logo">
      <img src="/images/logo-main.png" alt="Choice Tactical" class="nav-logo-img">
    </a>
    <button class="nav-toggle" id="navToggle" aria-label="Toggle navigation">
      <span class="hamburger"></span>
    </button>
    <ul class="nav-links" id="navLinks">
      <li><a href="/" class="nav-link" data-page="splash">Home</a></li>
      <li><a href="/apps/" class="nav-link" data-page="apps">Apps</a></li>
      <li><a href="/shop/" class="nav-link" data-page="shop">Shop</a></li>
      <li><a href="/apps/contact.html" class="nav-link" data-page="contact">Contact</a></li>
      <li>
        <a href="/shop/cart/" class="nav-link nav-cart" data-page="cart" aria-label="Cart">
          <span class="nav-cart-icon">🛒</span>
          <span class="nav-cart-badge" id="navCartBadge" hidden>0</span>
        </a>
      </li>
    </ul>
  </div>
</nav>
```

- [ ] **Step 2: Verify nav renders**

Run:
```bash
npm run dev
```

Open `http://localhost:8788/` and `http://localhost:8788/apps/`. Nav should show Home / Apps / Shop / Contact / Cart with no layout regressions. The cart badge is hidden (cart is empty).

- [ ] **Step 3: Commit**

```bash
git add includes/nav.html
git commit -m "feat: update nav with Apps, Shop, and cart badge entry"
```

---

## Task 5: Create `_redirects` file

**Files:**
- Create: `_redirects`

- [ ] **Step 1: Create `_redirects` at repo root**

```
# Old app-page URLs → new /apps/ location (301 permanent)
/precisionload.html   /apps/precisionload.html   301
/rangecommand.html    /apps/rangecommand.html    301
/contact.html         /apps/contact.html         301
/screenshots.html     /apps/screenshots.html     301

# Pretty shop product URLs → template with slug query param (200 rewrite)
/shop/:slug/          /shop/product.html?slug=:slug   200
```

- [ ] **Step 2: Verify redirects**

Run:
```bash
npm run dev
```

In a separate terminal test each:

```bash
curl -sI http://localhost:8788/precisionload.html | head -3
# Expected: HTTP/1.1 301 Moved Permanently
#           Location: /apps/precisionload.html
```

Also test the shop rewrite (returns the product.html file even though it doesn't exist yet — should be a 404 at this point since `product.html` isn't created; that's fine — re-verify after Task 8).

```bash
curl -sI http://localhost:8788/rangecommand.html | head -3
curl -sI http://localhost:8788/contact.html | head -3
curl -sI http://localhost:8788/screenshots.html | head -3
```

Expected: each returns `301` with `Location: /apps/...`.

- [ ] **Step 3: Commit**

```bash
git add _redirects
git commit -m "feat: add _redirects for old app URLs + shop pretty URLs"
```

---

## Task 6: Create product catalog JSON with placeholder products

**Files:**
- Create: `shop/products.json`
- Create: `shop/images/placeholder-1.svg`
- Create: `shop/images/placeholder-2.svg`
- Create: `shop/images/placeholder-3.svg`

- [ ] **Step 1: Create `shop/` directory**

```bash
mkdir -p shop/images
```

- [ ] **Step 2: Create three SVG placeholder images**

Create `shop/images/placeholder-1.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" role="img">
  <rect width="600" height="600" fill="#1a1a1a"/>
  <text x="300" y="310" font-family="Inter, sans-serif" font-size="36" font-weight="700" fill="#CBB589" text-anchor="middle">Product 1 (placeholder)</text>
</svg>
```

Create `shop/images/placeholder-2.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" role="img">
  <rect width="600" height="600" fill="#1a1a1a"/>
  <text x="300" y="310" font-family="Inter, sans-serif" font-size="36" font-weight="700" fill="#CBB589" text-anchor="middle">Product 2 (placeholder)</text>
</svg>
```

Create `shop/images/placeholder-3.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" role="img">
  <rect width="600" height="600" fill="#1a1a1a"/>
  <text x="300" y="310" font-family="Inter, sans-serif" font-size="36" font-weight="700" fill="#CBB589" text-anchor="middle">Product 3 (placeholder)</text>
</svg>
```

- [ ] **Step 3: Create `shop/products.json`**

```json
{
  "products": [
    {
      "slug": "sample-product-1",
      "name": "Sample Product One",
      "tagline": "Placeholder tagline for the first product.",
      "description": "This is placeholder text. Replace with the real description once the product is finalized. Keep it short — two or three sentences is plenty.",
      "priceUsd": 49.99,
      "stripePriceId": "price_PLACEHOLDER_ONE",
      "images": ["/shop/images/placeholder-1.svg"],
      "weightOz": 24,
      "inStock": true
    },
    {
      "slug": "sample-product-2",
      "name": "Sample Product Two",
      "tagline": "Placeholder tagline for the second product.",
      "description": "Lorem ipsum dolor sit amet. Replace with real content when your product is ready to ship.",
      "priceUsd": 89.99,
      "stripePriceId": "price_PLACEHOLDER_TWO",
      "images": ["/shop/images/placeholder-2.svg"],
      "weightOz": 32,
      "inStock": true
    },
    {
      "slug": "sample-product-3",
      "name": "Sample Product Three",
      "tagline": "Out-of-stock demo item.",
      "description": "This product demonstrates how out-of-stock behavior renders on the grid and detail pages.",
      "priceUsd": 129.99,
      "stripePriceId": "price_PLACEHOLDER_THREE",
      "images": ["/shop/images/placeholder-3.svg"],
      "weightOz": 48,
      "inStock": false
    }
  ]
}
```

- [ ] **Step 4: Commit**

```bash
git add shop/products.json shop/images/
git commit -m "feat: add product catalog JSON with placeholder products"
```

---

## Task 7: Build the shop landing page (product grid)

**Files:**
- Create: `shop/index.html`
- Create: `css/shop.css`
- Create: `js/shop.js` (minimal — just the grid renderer for now)

- [ ] **Step 1: Create `css/shop.css`**

```css
/* Shop-specific styles — reuses CSS variables from style.css */

.shop-main {
  max-width: 1200px;
  margin: 0 auto;
  padding: 120px 24px 80px;
}

.shop-header {
  text-align: center;
  margin-bottom: 48px;
}

.shop-title {
  font-size: 48px;
  font-weight: 800;
  color: #fff;
  margin-bottom: 12px;
}

.shop-subtitle {
  font-size: 18px;
  color: #B0B0B0;
}

.product-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 28px;
}

.product-card {
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 12px;
  overflow: hidden;
  text-decoration: none;
  color: #fff;
  display: flex;
  flex-direction: column;
  transition: transform 0.2s ease, border-color 0.2s ease;
}

.product-card:hover {
  transform: translateY(-4px);
  border-color: #CBB589;
}

.product-card-image {
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  background: #0c0c0c;
}

.product-card-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}

.product-card-name {
  font-size: 20px;
  font-weight: 700;
  color: #fff;
  margin: 0;
}

.product-card-tagline {
  font-size: 14px;
  color: #B0B0B0;
  margin: 0;
  flex: 1;
}

.product-card-price {
  font-size: 22px;
  font-weight: 800;
  color: #CBB589;
  margin: 8px 0 0;
}

.product-card-sold-out {
  display: inline-block;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: #FF5722;
  border: 1px solid #FF5722;
  border-radius: 4px;
  padding: 4px 10px;
  margin-top: 8px;
  text-transform: uppercase;
}

/* Product detail */
.product-detail {
  max-width: 1000px;
  margin: 0 auto;
  padding: 120px 24px 80px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 48px;
}

@media (max-width: 720px) {
  .product-detail { grid-template-columns: 1fr; gap: 24px; }
}

.product-detail-image {
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  background: #0c0c0c;
  border-radius: 12px;
}

.product-detail-name {
  font-size: 36px;
  font-weight: 800;
  color: #fff;
  margin: 0 0 8px;
}

.product-detail-tagline {
  font-size: 16px;
  color: #B0B0B0;
  margin: 0 0 24px;
}

.product-detail-price {
  font-size: 32px;
  font-weight: 800;
  color: #CBB589;
  margin: 0 0 24px;
}

.product-detail-description {
  font-size: 16px;
  color: #E0E0E0;
  line-height: 1.6;
  margin: 0 0 32px;
}

.qty-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.qty-label {
  font-size: 14px;
  color: #B0B0B0;
  font-weight: 600;
}

.qty-input {
  width: 72px;
  padding: 10px;
  background: #0c0c0c;
  border: 1px solid #2a2a2a;
  border-radius: 6px;
  color: #fff;
  font-size: 16px;
  text-align: center;
}

.add-to-cart-btn {
  background: #CBB589;
  color: #000;
  border: none;
  padding: 14px 32px;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s ease;
}

.add-to-cart-btn:hover { background: #D9CBA4; }
.add-to-cart-btn:disabled { background: #555; color: #999; cursor: not-allowed; }

/* Cart */
.cart-main {
  max-width: 900px;
  margin: 0 auto;
  padding: 120px 24px 80px;
}

.cart-empty {
  text-align: center;
  padding: 40px 0;
  color: #B0B0B0;
}

.cart-row {
  display: grid;
  grid-template-columns: 80px 1fr auto auto auto;
  gap: 20px;
  align-items: center;
  padding: 16px 0;
  border-bottom: 1px solid #2a2a2a;
}

.cart-row-image {
  width: 80px; height: 80px; object-fit: cover;
  border-radius: 6px; background: #0c0c0c;
}

.cart-row-name {
  font-size: 16px; font-weight: 700; color: #fff;
  text-decoration: none;
}

.cart-row-qty {
  width: 64px; padding: 6px; text-align: center;
  background: #0c0c0c; border: 1px solid #2a2a2a;
  border-radius: 4px; color: #fff;
}

.cart-row-subtotal {
  font-weight: 700; color: #CBB589;
  min-width: 80px; text-align: right;
}

.cart-row-remove {
  background: none; border: none; color: #FF5722;
  font-size: 24px; cursor: pointer; padding: 0 8px;
}

.cart-total {
  text-align: right;
  font-size: 24px;
  font-weight: 800;
  color: #fff;
  margin: 24px 0;
}

.cart-total-label { color: #B0B0B0; font-weight: 400; margin-right: 12px; }
.cart-total-amount { color: #CBB589; }

.cart-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-top: 24px;
  flex-wrap: wrap;
}

.btn-secondary {
  background: transparent;
  color: #fff;
  border: 1px solid #2a2a2a;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}

.btn-primary {
  background: #CBB589;
  color: #000;
  border: none;
  padding: 14px 32px;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  text-decoration: none;
  display: inline-block;
}

.btn-primary:disabled { background: #555; color: #999; cursor: not-allowed; }

.cart-note {
  font-size: 13px;
  color: #B0B0B0;
  text-align: right;
  margin-top: 8px;
}

/* Cart badge in nav */
.nav-cart-badge {
  display: inline-block;
  background: #CBB589;
  color: #000;
  font-size: 11px;
  font-weight: 800;
  padding: 2px 7px;
  border-radius: 99px;
  margin-left: 4px;
  min-width: 18px;
  text-align: center;
}
.nav-cart-badge[hidden] { display: none; }

/* Toast */
.shop-toast {
  position: fixed;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%) translateY(100px);
  background: #1a1a1a;
  color: #CBB589;
  padding: 14px 24px;
  border: 1px solid #CBB589;
  border-radius: 8px;
  font-weight: 600;
  opacity: 0;
  transition: transform 0.3s ease, opacity 0.3s ease;
  pointer-events: none;
  z-index: 1000;
}

.shop-toast.visible {
  transform: translateX(-50%) translateY(0);
  opacity: 1;
}

/* Error banner */
.shop-error {
  background: #2a0000;
  border: 1px solid #FF5722;
  color: #FF9980;
  padding: 12px 16px;
  border-radius: 8px;
  margin: 16px 0;
  font-size: 14px;
}
```

- [ ] **Step 2: Create `js/shop.js` (minimal — grid rendering only)**

```js
/* ═══════════════════════════════════════════════
   CHOICE TACTICAL — Shop & Cart
   ═══════════════════════════════════════════════ */

(function () {
  'use strict';

  var CART_KEY = 'ct_cart';
  var PRODUCTS_URL = '/shop/products.json';

  // ── Utilities ──────────────────────────────────
  function formatUSD(cents) {
    return '$' + cents.toFixed(2);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getQueryParam(name) {
    var m = new URLSearchParams(window.location.search).get(name);
    return m || '';
  }

  // ── Catalog ────────────────────────────────────
  var _productsCache = null;
  function loadProducts() {
    if (_productsCache) return Promise.resolve(_productsCache);
    return fetch(PRODUCTS_URL)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        _productsCache = data.products || [];
        return _productsCache;
      });
  }

  function findProductBySlug(products, slug) {
    for (var i = 0; i < products.length; i++) {
      if (products[i].slug === slug) return products[i];
    }
    return null;
  }

  function findProductByStripePriceId(products, priceId) {
    for (var i = 0; i < products.length; i++) {
      if (products[i].stripePriceId === priceId) return products[i];
    }
    return null;
  }

  // ── Grid rendering ─────────────────────────────
  function renderProductGrid(container, products) {
    if (!products.length) {
      container.innerHTML = '<p style="text-align:center;color:#B0B0B0">' +
        'No products available yet. Check back soon.</p>';
      return;
    }
    container.innerHTML = products.map(function (p) {
      var img = (p.images && p.images[0]) || '/shop/images/placeholder-1.svg';
      var soldOut = !p.inStock
        ? '<span class="product-card-sold-out">Sold Out</span>' : '';
      return '' +
        '<a class="product-card" href="/shop/' + escapeHtml(p.slug) + '/">' +
          '<img class="product-card-image" src="' + escapeHtml(img) + '" alt="' + escapeHtml(p.name) + '">' +
          '<div class="product-card-body">' +
            '<h3 class="product-card-name">' + escapeHtml(p.name) + '</h3>' +
            '<p class="product-card-tagline">' + escapeHtml(p.tagline) + '</p>' +
            '<p class="product-card-price">' + formatUSD(p.priceUsd) + '</p>' +
            soldOut +
          '</div>' +
        '</a>';
    }).join('');
  }

  // ── Page init ──────────────────────────────────
  function initShopGrid() {
    var container = document.getElementById('productGrid');
    if (!container) return;
    loadProducts()
      .then(function (products) { renderProductGrid(container, products); })
      .catch(function (err) {
        console.error('Failed to load products', err);
        container.innerHTML = '<p style="color:#FF5722">Unable to load products. Please refresh.</p>';
      });
  }

  // Expose for later tasks
  window.ShopApp = {
    init: function () { initShopGrid(); },
    loadProducts: loadProducts,
    findProductBySlug: findProductBySlug,
    findProductByStripePriceId: findProductByStripePriceId,
    formatUSD: formatUSD,
    escapeHtml: escapeHtml,
    getQueryParam: getQueryParam
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initShopGrid);
  } else {
    initShopGrid();
  }
})();
```

- [ ] **Step 3: Create `shop/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Precision Gear — Choice Tactical</title>
  <meta name="description" content="Purpose-built precision shooting gear from Choice Tactical.">
  <link rel="icon" type="image/png" href="/images/favicon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/style.css">
  <link rel="stylesheet" href="/css/components.css">
  <link rel="stylesheet" href="/css/animations.css">
  <link rel="stylesheet" href="/css/shop.css">
</head>
<body data-page="shop">

  <div data-include="/includes/nav.html"></div>

  <main class="shop-main">
    <header class="shop-header">
      <h1 class="shop-title">Precision Gear</h1>
      <p class="shop-subtitle">Purpose-built gear for serious shooters.</p>
    </header>

    <div id="productGrid" class="product-grid">
      <p style="color:#B0B0B0; text-align:center;">Loading products…</p>
    </div>
  </main>

  <div data-include="/includes/footer.html"></div>

  <script src="/js/main.js"></script>
  <script src="/js/shop.js"></script>
</body>
</html>
```

- [ ] **Step 4: Verify**

Run:
```bash
npm run dev
```

Open `http://localhost:8788/shop/` — should show the product grid with 3 placeholder tiles. Product 3 should show a "SOLD OUT" badge.

- [ ] **Step 5: Commit**

```bash
git add css/shop.css js/shop.js shop/index.html
git commit -m "feat: shop landing page renders product grid from products.json"
```

---

## Task 8: Product detail page

**Files:**
- Create: `shop/product.html`
- Modify: `js/shop.js` (add detail-page renderer)

- [ ] **Step 1: Extend `js/shop.js` with the detail renderer**

Open `js/shop.js`. After the `renderProductGrid` function, add a new function and wire it into `initShopGrid`:

Replace the block:
```js
  // ── Page init ──────────────────────────────────
  function initShopGrid() {
    var container = document.getElementById('productGrid');
    if (!container) return;
    loadProducts()
      .then(function (products) { renderProductGrid(container, products); })
      .catch(function (err) {
        console.error('Failed to load products', err);
        container.innerHTML = '<p style="color:#FF5722">Unable to load products. Please refresh.</p>';
      });
  }
```

With:

```js
  // ── Detail rendering ───────────────────────────
  function renderProductDetail(container, product) {
    var img = (product.images && product.images[0]) || '/shop/images/placeholder-1.svg';
    var addBtn = product.inStock
      ? '<button type="button" class="add-to-cart-btn" id="addToCartBtn" ' +
        'data-price-id="' + escapeHtml(product.stripePriceId) + '" ' +
        'data-slug="' + escapeHtml(product.slug) + '">Add to Cart</button>'
      : '<span class="product-card-sold-out">Sold Out</span>';
    container.innerHTML = '' +
      '<div>' +
        '<img class="product-detail-image" src="' + escapeHtml(img) + '" alt="' + escapeHtml(product.name) + '">' +
      '</div>' +
      '<div>' +
        '<h1 class="product-detail-name">' + escapeHtml(product.name) + '</h1>' +
        '<p class="product-detail-tagline">' + escapeHtml(product.tagline) + '</p>' +
        '<p class="product-detail-price">' + formatUSD(product.priceUsd) + '</p>' +
        '<p class="product-detail-description">' + escapeHtml(product.description) + '</p>' +
        (product.inStock ? '<div class="qty-row">' +
          '<label class="qty-label" for="qtyInput">Quantity</label>' +
          '<input class="qty-input" id="qtyInput" type="number" min="1" max="10" value="1">' +
        '</div>' : '') +
        addBtn +
      '</div>';
    document.title = product.name + ' — Precision Gear — Choice Tactical';
  }

  // ── Page init ──────────────────────────────────
  function initShopGrid() {
    var container = document.getElementById('productGrid');
    if (!container) return;
    loadProducts()
      .then(function (products) { renderProductGrid(container, products); })
      .catch(function (err) {
        console.error('Failed to load products', err);
        container.innerHTML = '<p style="color:#FF5722">Unable to load products. Please refresh.</p>';
      });
  }

  function initProductDetail() {
    var container = document.getElementById('productDetail');
    if (!container) return;
    var slug = getQueryParam('slug');
    if (!slug) {
      container.innerHTML = '<p class="shop-error">No product specified.</p>';
      return;
    }
    loadProducts().then(function (products) {
      var product = findProductBySlug(products, slug);
      if (!product) {
        container.innerHTML = '<p class="shop-error">Product not found. <a href="/shop/">Back to shop</a></p>';
        return;
      }
      renderProductDetail(container, product);
    });
  }

  function initPage() {
    initShopGrid();
    initProductDetail();
  }
```

Then change the init line at the bottom of the file:

```js
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPage);
  } else {
    initPage();
  }
```

(Replacing the `initShopGrid`-only init.)

- [ ] **Step 2: Create `shop/product.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Product — Precision Gear — Choice Tactical</title>
  <link rel="icon" type="image/png" href="/images/favicon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/style.css">
  <link rel="stylesheet" href="/css/components.css">
  <link rel="stylesheet" href="/css/animations.css">
  <link rel="stylesheet" href="/css/shop.css">
</head>
<body data-page="shop">

  <div data-include="/includes/nav.html"></div>

  <main>
    <div id="productDetail" class="product-detail">
      <p style="color:#B0B0B0">Loading product…</p>
    </div>
  </main>

  <div data-include="/includes/footer.html"></div>

  <script src="/js/main.js"></script>
  <script src="/js/shop.js"></script>
</body>
</html>
```

- [ ] **Step 3: Verify**

Run:
```bash
npm run dev
```

Open `http://localhost:8788/shop/sample-product-1/` — should render the detail page for Sample Product One with image, name, price, description, quantity input, and "Add to Cart" button.

Try `http://localhost:8788/shop/sample-product-3/` — Sample Product Three is out of stock, so no quantity input, only "Sold Out" badge.

Try `http://localhost:8788/shop/does-not-exist/` — should show "Product not found" error.

- [ ] **Step 4: Commit**

```bash
git add js/shop.js shop/product.html
git commit -m "feat: product detail page with quantity selector and add-to-cart"
```

---

## Task 9: Cart state + add-to-cart behavior

**Files:**
- Modify: `js/shop.js` (add cart operations)

- [ ] **Step 1: Add cart operations to `js/shop.js`**

In `js/shop.js`, after the `getQueryParam` function, insert these cart helpers:

```js
  // ── Cart state (localStorage) ──────────────────
  function readCart() {
    try {
      var raw = localStorage.getItem(CART_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function writeCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateCartBadge();
  }

  function cartItemCount() {
    return readCart().reduce(function (sum, i) { return sum + (i.qty || 0); }, 0);
  }

  function addToCart(item) {
    // item = { slug, stripePriceId, qty }
    var cart = readCart();
    var existing = null;
    for (var i = 0; i < cart.length; i++) {
      if (cart[i].stripePriceId === item.stripePriceId) {
        existing = cart[i];
        break;
      }
    }
    if (existing) {
      existing.qty = Math.min(99, (existing.qty || 0) + item.qty);
    } else {
      cart.push({
        slug: item.slug,
        stripePriceId: item.stripePriceId,
        qty: Math.min(99, Math.max(1, item.qty))
      });
    }
    writeCart(cart);
  }

  function updateCartLineQty(stripePriceId, qty) {
    var cart = readCart();
    var out = [];
    for (var i = 0; i < cart.length; i++) {
      if (cart[i].stripePriceId === stripePriceId) {
        if (qty > 0) {
          cart[i].qty = Math.min(99, qty);
          out.push(cart[i]);
        }
      } else {
        out.push(cart[i]);
      }
    }
    writeCart(out);
  }

  function removeCartLine(stripePriceId) {
    var cart = readCart().filter(function (i) {
      return i.stripePriceId !== stripePriceId;
    });
    writeCart(cart);
  }

  function clearCart() {
    localStorage.removeItem(CART_KEY);
    updateCartBadge();
  }

  function updateCartBadge() {
    var badge = document.getElementById('navCartBadge');
    if (!badge) return;
    var count = cartItemCount();
    if (count > 0) {
      badge.textContent = String(count);
      badge.hidden = false;
    } else {
      badge.textContent = '0';
      badge.hidden = true;
    }
  }

  // ── Toast ──────────────────────────────────────
  function showToast(message) {
    var toast = document.getElementById('shopToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'shopToast';
      toast.className = 'shop-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    requestAnimationFrame(function () {
      toast.classList.add('visible');
    });
    setTimeout(function () {
      toast.classList.remove('visible');
    }, 1800);
  }
```

- [ ] **Step 2: Wire the add-to-cart button on the detail page**

In `js/shop.js`, at the end of the `renderProductDetail` function (just before the closing `}`), add a click handler binding:

Change the end of `renderProductDetail` from:

```js
    document.title = product.name + ' — Precision Gear — Choice Tactical';
  }
```

To:

```js
    document.title = product.name + ' — Precision Gear — Choice Tactical';

    var btn = document.getElementById('addToCartBtn');
    if (btn) {
      btn.addEventListener('click', function () {
        var qtyInput = document.getElementById('qtyInput');
        var qty = Math.max(1, Math.min(10, parseInt(qtyInput && qtyInput.value, 10) || 1));
        addToCart({
          slug: product.slug,
          stripePriceId: product.stripePriceId,
          qty: qty
        });
        showToast('Added to cart');
      });
    }
  }
```

- [ ] **Step 3: Update badge on every page load**

At the top of `initPage`, add a badge-refresh call so the nav badge shows the correct count after navigation:

Change:
```js
  function initPage() {
    initShopGrid();
    initProductDetail();
  }
```

To:

```js
  function initPage() {
    // Nav loads asynchronously; delay badge refresh.
    setTimeout(updateCartBadge, 300);
    initShopGrid();
    initProductDetail();
  }
```

Also add `updateCartBadge`, `addToCart`, `readCart`, `writeCart`, `updateCartLineQty`, `removeCartLine`, `clearCart`, `showToast`, `cartItemCount` to the `window.ShopApp` export block at the bottom:

```js
  window.ShopApp = {
    init: function () { initPage(); },
    loadProducts: loadProducts,
    findProductBySlug: findProductBySlug,
    findProductByStripePriceId: findProductByStripePriceId,
    formatUSD: formatUSD,
    escapeHtml: escapeHtml,
    getQueryParam: getQueryParam,
    readCart: readCart,
    writeCart: writeCart,
    addToCart: addToCart,
    updateCartLineQty: updateCartLineQty,
    removeCartLine: removeCartLine,
    clearCart: clearCart,
    cartItemCount: cartItemCount,
    updateCartBadge: updateCartBadge,
    showToast: showToast
  };
```

- [ ] **Step 4: Verify**

Run:
```bash
npm run dev
```

- Open `http://localhost:8788/shop/sample-product-1/`. Click "Add to Cart" twice.
- Verify toast appears.
- Verify nav cart badge shows "2".
- Navigate to `http://localhost:8788/shop/` and back — badge should persist at "2".
- Open browser devtools → Application → Local Storage → `http://localhost:8788` → `ct_cart` should contain the item.

- [ ] **Step 5: Commit**

```bash
git add js/shop.js
git commit -m "feat: cart storage in localStorage + add-to-cart + nav badge"
```

---

## Task 10: Cart page

**Files:**
- Create: `shop/cart/index.html`
- Modify: `js/shop.js` (add cart-page renderer)

- [ ] **Step 1: Add cart-page rendering to `js/shop.js`**

After `initProductDetail` (before `initPage`), add:

```js
  function renderCartPage(container) {
    var cart = readCart();
    if (!cart.length) {
      container.innerHTML = '' +
        '<header class="shop-header">' +
          '<h1 class="shop-title">Your Cart</h1>' +
        '</header>' +
        '<div class="cart-empty">' +
          '<p>Your cart is empty.</p>' +
          '<p><a class="btn-primary" href="/shop/">Browse Precision Gear</a></p>' +
        '</div>';
      return;
    }
    loadProducts().then(function (products) {
      var rows = [];
      var subtotalCents = 0;
      var missing = [];
      cart.forEach(function (line) {
        var p = findProductByStripePriceId(products, line.stripePriceId);
        if (!p) { missing.push(line.stripePriceId); return; }
        var lineTotal = p.priceUsd * line.qty;
        subtotalCents += lineTotal;
        var img = (p.images && p.images[0]) || '/shop/images/placeholder-1.svg';
        rows.push('' +
          '<div class="cart-row" data-price-id="' + escapeHtml(p.stripePriceId) + '">' +
            '<img class="cart-row-image" src="' + escapeHtml(img) + '" alt="' + escapeHtml(p.name) + '">' +
            '<a class="cart-row-name" href="/shop/' + escapeHtml(p.slug) + '/">' + escapeHtml(p.name) + '</a>' +
            '<input class="cart-row-qty" type="number" min="1" max="99" value="' + line.qty + '">' +
            '<span class="cart-row-subtotal">' + formatUSD(lineTotal) + '</span>' +
            '<button class="cart-row-remove" type="button" aria-label="Remove">×</button>' +
          '</div>'
        );
      });
      container.innerHTML = '' +
        '<header class="shop-header">' +
          '<h1 class="shop-title">Your Cart</h1>' +
        '</header>' +
        rows.join('') +
        '<div class="cart-total">' +
          '<span class="cart-total-label">Subtotal</span>' +
          '<span class="cart-total-amount">' + formatUSD(subtotalCents) + '</span>' +
        '</div>' +
        '<p class="cart-note">Shipping &amp; tax calculated at checkout.</p>' +
        '<div class="cart-actions">' +
          '<a class="btn-secondary" href="/shop/">Continue Shopping</a>' +
          '<button class="btn-primary" id="checkoutBtn" type="button">Checkout</button>' +
        '</div>' +
        (missing.length ? '<div class="shop-error">Some items in your cart are no longer available and were skipped.</div>' : '');

      // Wire up line-level events
      container.querySelectorAll('.cart-row').forEach(function (row) {
        var priceId = row.getAttribute('data-price-id');
        var qtyEl = row.querySelector('.cart-row-qty');
        var removeBtn = row.querySelector('.cart-row-remove');
        qtyEl.addEventListener('change', function () {
          var n = parseInt(qtyEl.value, 10);
          if (!isFinite(n) || n < 1) n = 1;
          if (n > 99) n = 99;
          updateCartLineQty(priceId, n);
          renderCartPage(container);
        });
        removeBtn.addEventListener('click', function () {
          removeCartLine(priceId);
          renderCartPage(container);
        });
      });

      // Checkout wiring comes in Task 12.
    });
  }

  function initCartPage() {
    var container = document.getElementById('cartContainer');
    if (!container) return;
    renderCartPage(container);
  }
```

Wire `initCartPage` into `initPage`:

```js
  function initPage() {
    setTimeout(updateCartBadge, 300);
    initShopGrid();
    initProductDetail();
    initCartPage();
  }
```

- [ ] **Step 2: Create `shop/cart/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cart — Precision Gear — Choice Tactical</title>
  <link rel="icon" type="image/png" href="/images/favicon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/style.css">
  <link rel="stylesheet" href="/css/components.css">
  <link rel="stylesheet" href="/css/animations.css">
  <link rel="stylesheet" href="/css/shop.css">
</head>
<body data-page="cart">

  <div data-include="/includes/nav.html"></div>

  <main class="cart-main">
    <div id="cartContainer"></div>
  </main>

  <div data-include="/includes/footer.html"></div>

  <script src="/js/main.js"></script>
  <script src="/js/shop.js"></script>
</body>
</html>
```

- [ ] **Step 3: Verify**

Run:
```bash
npm run dev
```

- Clear any previous cart state: browser devtools → Application → Local Storage → delete `ct_cart`.
- Go to `http://localhost:8788/shop/sample-product-1/`, set quantity to 2, Add to Cart.
- Go to `http://localhost:8788/shop/sample-product-2/`, Add to Cart (qty 1).
- Navigate to `http://localhost:8788/shop/cart/` — should list both products with correct names, thumbnails, qty, and subtotals. Subtotal shows $49.99×2 + $89.99 = $189.97.
- Change qty on product 1 to 3 — subtotal recalcs.
- Click the × on product 2 — it's removed, subtotal updates.
- Empty the cart — page shows "Your cart is empty" and a "Browse Precision Gear" CTA.

- [ ] **Step 4: Commit**

```bash
git add js/shop.js shop/cart/index.html
git commit -m "feat: cart page with qty editing, line removal, and subtotal"
```

---

## Task 11: Cloudflare Pages Function — `/api/create-checkout`

**Files:**
- Create: `functions/api/create-checkout.js`
- Create: `.dev.vars` (local-only; already in `.gitignore`)

- [ ] **Step 1: Create `.dev.vars` for local testing**

Create `/Users/bert_kiefer_cp_home/choice-tactical-website/.dev.vars` (NOT committed — in `.gitignore` from Task 0):

```
STRIPE_SECRET_KEY=sk_test_PLACEHOLDER_REPLACE_ME
STRIPE_SHIPPING_RATE_IDS=
```

(You'll replace `sk_test_PLACEHOLDER_REPLACE_ME` with a real test secret from the Stripe Dashboard when ready to do live integration testing. For now leave it — the function still loads and validates inputs.)

- [ ] **Step 2: Create the Function**

Create `/Users/bert_kiefer_cp_home/choice-tactical-website/functions/api/create-checkout.js`:

```js
/**
 * POST /api/create-checkout
 * Body: { items: [{ stripePriceId, qty }, ...] }
 * Returns: { url } on success, { error } on failure (status 400 or 500).
 *
 * Talks to Stripe directly via fetch (form-encoded body, classic Stripe API).
 * No SDK needed — keeps the Worker small and dependency-free.
 */

export async function onRequestPost(context) {
  const { request, env } = context;

  // ── Parse body ─────────────────────────────────
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) {
    return json({ error: 'Cart is empty' }, 400);
  }

  // Validate each item
  for (const item of items) {
    if (typeof item.stripePriceId !== 'string' || !item.stripePriceId.startsWith('price_')) {
      return json({ error: 'Invalid price ID in cart' }, 400);
    }
    const qty = Number(item.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
      return json({ error: 'Invalid quantity' }, 400);
    }
  }

  // ── Validate env ───────────────────────────────
  const secret = env.STRIPE_SECRET_KEY;
  if (!secret || !secret.startsWith('sk_')) {
    return json({ error: 'Checkout unavailable — server not configured' }, 500);
  }

  // ── Build form-encoded Stripe request ──────────
  const form = new URLSearchParams();
  form.append('mode', 'payment');
  form.append('automatic_tax[enabled]', 'true');
  form.append('shipping_address_collection[allowed_countries][0]', 'US');

  // Shipping options (if configured)
  const shippingIds = (env.STRIPE_SHIPPING_RATE_IDS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  shippingIds.forEach((id, i) => {
    form.append(`shipping_options[${i}][shipping_rate]`, id);
  });

  // Line items
  items.forEach((item, i) => {
    form.append(`line_items[${i}][price]`, item.stripePriceId);
    form.append(`line_items[${i}][quantity]`, String(item.qty));
  });

  const origin = new URL(request.url).origin;
  form.append('success_url', `${origin}/shop/thanks/?session={CHECKOUT_SESSION_ID}`);
  form.append('cancel_url', `${origin}/shop/cart/`);

  // ── Call Stripe ────────────────────────────────
  let resp;
  try {
    resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secret}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: form.toString()
    });
  } catch (e) {
    return json({ error: 'Network error reaching payment provider' }, 502);
  }

  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    // Surface a safe error message. Full detail logged to Worker console.
    console.error('Stripe error', resp.status, payload);
    const msg = (payload && payload.error && payload.error.message) || 'Checkout failed';
    return json({ error: msg }, 502);
  }

  if (!payload.url) {
    return json({ error: 'Unexpected response from payment provider' }, 502);
  }

  return json({ url: payload.url });
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
```

- [ ] **Step 3: Verify the Function loads + validates input**

Run:
```bash
npm run dev
```

In another terminal:

```bash
# Should return 400 "Invalid JSON body"
curl -sX POST http://localhost:8788/api/create-checkout \
  -H 'Content-Type: application/json' -d 'not json'

# Should return 400 "Cart is empty"
curl -sX POST http://localhost:8788/api/create-checkout \
  -H 'Content-Type: application/json' -d '{"items":[]}'

# Should return 400 "Invalid price ID"
curl -sX POST http://localhost:8788/api/create-checkout \
  -H 'Content-Type: application/json' -d '{"items":[{"stripePriceId":"foo","qty":1}]}'

# With a real valid Stripe test price id, would hit Stripe (skip for now — validates with placeholder and returns 500 since secret is placeholder)
```

Expected: each returns the correct 400/500 error. Function is reachable and validating.

- [ ] **Step 4: Commit**

```bash
git add functions/api/create-checkout.js
git commit -m "feat: Cloudflare Pages Function to create Stripe Checkout sessions"
```

---

## Task 12: Wire cart "Checkout" button to `/api/create-checkout`

**Files:**
- Modify: `js/shop.js` (add checkout flow)

- [ ] **Step 1: Extend `js/shop.js` with the checkout call**

In `js/shop.js`, after the `showToast` function, add:

```js
  // ── Checkout ───────────────────────────────────
  function startCheckout(btn) {
    var cart = readCart();
    if (!cart.length) {
      showToast('Cart is empty');
      return;
    }
    if (btn) { btn.disabled = true; btn.textContent = 'Redirecting…'; }

    fetch('/api/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: cart.map(function (i) {
          return { stripePriceId: i.stripePriceId, qty: i.qty };
        })
      })
    })
      .then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); })
      .then(function (res) {
        if (res.status >= 200 && res.status < 300 && res.body.url) {
          window.location = res.body.url;
        } else {
          var msg = (res.body && res.body.error) || 'Checkout failed — please try again.';
          showCheckoutError(msg);
          if (btn) { btn.disabled = false; btn.textContent = 'Checkout'; }
        }
      })
      .catch(function () {
        showCheckoutError('Network error — please check your connection and try again.');
        if (btn) { btn.disabled = false; btn.textContent = 'Checkout'; }
      });
  }

  function showCheckoutError(msg) {
    var container = document.getElementById('cartContainer');
    if (!container) return;
    var existing = container.querySelector('.shop-error');
    if (existing) existing.remove();
    var banner = document.createElement('div');
    banner.className = 'shop-error';
    banner.textContent = msg;
    container.appendChild(banner);
  }
```

- [ ] **Step 2: Bind the checkout button**

Inside the `renderCartPage` function, replace the comment `// Checkout wiring comes in Task 12.` with:

```js
      var checkoutBtn = document.getElementById('checkoutBtn');
      if (checkoutBtn) {
        checkoutBtn.addEventListener('click', function () {
          startCheckout(checkoutBtn);
        });
      }
```

- [ ] **Step 3: Verify the flow fires the API call**

Run:
```bash
npm run dev
```

- Go to `http://localhost:8788/shop/sample-product-1/` → Add to Cart.
- Go to `http://localhost:8788/shop/cart/` → click Checkout.
- Since `.dev.vars` still has the placeholder secret, the Function returns a 500. The cart page should display an error banner and re-enable the Checkout button.

Open the devtools Network tab and confirm the POST to `/api/create-checkout` happened with the cart body.

**For a real test:** replace `.dev.vars` with a real Stripe test key (`sk_test_...` from https://dashboard.stripe.com/test/apikeys), create a test Product+Price in Stripe, copy the `price_...` into `shop/products.json` (replacing the first placeholder), then retry. You'll get redirected to a live Stripe Checkout page.

- [ ] **Step 4: Commit**

```bash
git add js/shop.js
git commit -m "feat: wire cart checkout button to /api/create-checkout"
```

---

## Task 13: Thanks page

**Files:**
- Create: `shop/thanks/index.html`

- [ ] **Step 1: Create `shop/thanks/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Thank You — Precision Gear — Choice Tactical</title>
  <link rel="icon" type="image/png" href="/images/favicon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/style.css">
  <link rel="stylesheet" href="/css/components.css">
  <link rel="stylesheet" href="/css/animations.css">
  <link rel="stylesheet" href="/css/shop.css">
</head>
<body data-page="thanks">

  <div data-include="/includes/nav.html"></div>

  <main class="cart-main">
    <header class="shop-header">
      <h1 class="shop-title">Thank You!</h1>
      <p class="shop-subtitle">Your order is confirmed.</p>
    </header>

    <div style="text-align:center; padding: 24px 0; color:#E0E0E0;">
      <p style="margin: 0 0 12px;">
        You'll receive an email receipt from Stripe shortly.
      </p>
      <p id="orderRef" style="font-family:monospace; color:#B0B0B0; margin:0 0 32px;"></p>
      <div class="cart-actions" style="justify-content: center;">
        <a class="btn-secondary" href="/">Home</a>
        <a class="btn-primary" href="/shop/">Keep Shopping</a>
      </div>
    </div>
  </main>

  <div data-include="/includes/footer.html"></div>

  <script src="/js/main.js"></script>
  <script>
    // Clear cart on arrival; show session ref if provided.
    try { localStorage.removeItem('ct_cart'); } catch (e) {}
    (function () {
      var params = new URLSearchParams(window.location.search);
      var session = params.get('session');
      if (session) {
        var ref = document.getElementById('orderRef');
        if (ref) ref.textContent = 'Order reference: ' + session;
      }
    })();
  </script>
</body>
</html>
```

- [ ] **Step 2: Verify**

Run:
```bash
npm run dev
```

- Add items to cart so badge shows a number.
- Open `http://localhost:8788/shop/thanks/?session=cs_test_fake123` directly.
- Cart should clear (nav badge disappears on refresh).
- "Order reference: cs_test_fake123" should display.
- Nav should still render.

- [ ] **Step 3: Commit**

```bash
git add shop/thanks/index.html
git commit -m "feat: thanks page clears cart and displays Stripe session reference"
```

---

## Task 14: End-to-end test with real Stripe test credentials

**Files:** (no code changes — config + validation only)

- [ ] **Step 1: Set up Stripe test resources in the Stripe Dashboard**

In https://dashboard.stripe.com (test mode):

1. Products → Create product `Sample Product One` · price `$49.99` · one-time. Copy the `price_...` ID.
2. Products → Create product `Sample Product Two` · price `$89.99` · one-time. Copy its `price_...` ID.
3. Settings → Tax → Enable Stripe Tax. Set origin address to your US state.
4. Settings → Shipping rates → Create `Standard Ground $8.00`. Copy the `shr_...` ID.
5. Developers → API keys → copy the **test** secret (`sk_test_...`).

- [ ] **Step 2: Update `shop/products.json` with the real test Price IDs**

Replace `price_PLACEHOLDER_ONE` and `price_PLACEHOLDER_TWO` in `shop/products.json` with the IDs from Step 1.

(Leave `price_PLACEHOLDER_THREE` alone; sample-product-3 is marked out of stock so it won't be checked out.)

- [ ] **Step 3: Update `.dev.vars`**

Replace `.dev.vars` contents:

```
STRIPE_SECRET_KEY=sk_test_...actualTestKey...
STRIPE_SHIPPING_RATE_IDS=shr_...fromStep1...
```

- [ ] **Step 4: Run the end-to-end flow**

```bash
npm run dev
```

1. `http://localhost:8788/` → click "Shop Now" on the splash.
2. Add Sample Product One (qty 2) and Sample Product Two (qty 1) to cart.
3. Go to cart — subtotal should read $189.97.
4. Click Checkout → redirected to Stripe's hosted checkout page.
5. Fill in:
   - Email: your own
   - Card: `4242 4242 4242 4242`
   - Expiry: any future date (e.g., `12/34`)
   - CVC: any 3 digits
   - Address: your real address (tax calc needs a real ZIP)
6. Shipping should show as Standard Ground $8.00.
7. Tax line should calculate based on the entered address.
8. Submit payment → redirected to `http://localhost:8788/shop/thanks/?session=cs_test_...`.
9. Cart is cleared (nav badge empty).
10. Email receipt arrives from Stripe.
11. Stripe Dashboard (Payments) shows the successful test payment with line items, tax, and shipping.

- [ ] **Step 5: Old-URL redirect smoke test**

```bash
curl -sI http://localhost:8788/precisionload.html | head -3
# HTTP/1.1 301 Moved Permanently
# Location: /apps/precisionload.html

curl -sI http://localhost:8788/privacy.html | head -3
# HTTP/1.1 200 OK   (stays put)
```

- [ ] **Step 6: Deploy to Cloudflare Pages (preview)**

Owner performs this in Cloudflare dashboard (detailed steps listed in the spec's "Hosting Migration" section). After preview is live:

```bash
git push origin main
```

Cloudflare auto-deploys. Visit the preview URL (e.g., `https://<branch>.choice-tactical-website.pages.dev`) and repeat the end-to-end flow using the remote URL instead of localhost. Set preview env vars (`STRIPE_SECRET_KEY`, `STRIPE_SHIPPING_RATE_IDS`) in Cloudflare Pages → Settings → Environment Variables → Preview.

- [ ] **Step 7: Switch DNS to Cloudflare + swap to live keys (owner, when ready)**

When the preview URL has passed user acceptance:
1. Update DNS `www` record to point at Cloudflare Pages (CNAME shown in Cloudflare UI).
2. Set Cloudflare Pages → Production env vars with **live** Stripe keys + live shipping rate IDs.
3. Replace test `price_...` IDs in `shop/products.json` with live `price_...` IDs.
4. Do one $0.01 real test purchase; refund it from the Stripe Dashboard.
5. Ship.

---

## Summary of deliverables

- ✅ Splash page at `/` with two choice cards.
- ✅ Current site accessible at `/apps/` with all sub-pages at `/apps/<slug>.html`.
- ✅ `/privacy.html` unchanged (App Store link preserved).
- ✅ Old URLs 301 to new `/apps/` equivalents.
- ✅ Storefront at `/shop/` with product grid from `products.json`.
- ✅ Product detail pages with pretty URLs (`/shop/<slug>/`).
- ✅ Cart page with qty edit + remove, persisted in `localStorage`.
- ✅ Stripe Checkout integration via Cloudflare Pages Function.
- ✅ Thanks page clears cart and shows order reference.
- ✅ End-to-end test passes with Stripe test card.

After launch, updating products = edit `shop/products.json` + push. Zero code changes.
