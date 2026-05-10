# AXIS Laser Variants + Replacement Plate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert The AXIS into a multi-variant product (HITEKK $195 / MIPREZT $175 / No Laser $165) with a conditional plate-size dropdown when "No Laser" is selected, and add a $12 plate-only purchase section to the same product page — no new shop-index card.

**Architecture:** Reuses the existing `options`/`variants` system already wired for The Stack. Plate size is captured as line-item metadata (not as a variant axis), so the no-laser AXIS keeps a single Stripe price ID across all 28 plate sizes. The replacement-plate section is rendered from a new `replacementPlate` block embedded on the AXIS product entry — no separate `products.json` entry. Server-side defenses in `create-checkout.js` validate plate sizes against an allowlist and inject the server-known bundled plate for laser bundles regardless of client input.

**Tech Stack:** Vanilla JS frontend (`js/shop.js`), Cloudflare Pages Functions backend (`functions/api/`), vitest for unit tests on pure helpers, Stripe Checkout for payments, Resend for order emails. No new Cloudflare resources.

**Spec:** `docs/superpowers/specs/2026-05-10-axis-laser-variants-design.md`

---

## File Structure

**New:**
- `functions/_lib/plate-validation.js` — pure helper that validates a plate-size string against an allowlist
- `tests/plate-validation.test.js` — unit tests for the helper

**Modified:**
- `shop/products.json` — restructure the AXIS entry: remove top-level `stripePriceId`/`priceUsd`, add `options`, `variants`, `replacementPlate`
- `js/shop.js` — extend cart line shape with `metadata`; extend variant picker to render plate dropdown when active option value has `plateSelectable: true`; render replacement-plate section when `product.replacementPlate` exists; pass `metadata` through checkout payload; show plate size in cart line display
- `js/main.js` — no change needed (cart UI reads from shop.js helpers)
- `css/shop.css` — append styles for the conditional plate dropdown + replacement-plate section divider
- `shop/product.html` — bump `shop.js` and `shop.css` cache-bust querystrings
- `functions/api/create-checkout.js` — server-side plate-size validation, bundled-plate injection for laser variants
- `functions/api/stripe-webhook.js` — pretty-print `plate_size` metadata in the order email as "Plate: N mm"

**Stripe artifacts (created via dashboard, not committed — done in Task 11):**
- New Price: `price_AXIS_HITEKK` at $195
- New Price: `price_AXIS_NOLASER` at $165
- New Price: `price_AXIS_PLATE_12` at $12
- New Shipping Rate: `shr_FREE_PLATE` at $0
- The MIPREZT variant **reuses** the existing AXIS price `price_1TU8xZIfCMZaSnjC17yZUqDb` (it's still $175)

---

## Task 1: Plate-validation helper (TDD)

**Files:**
- Create: `tests/plate-validation.test.js`
- Create: `functions/_lib/plate-validation.js`

- [ ] **Step 1: Write failing tests**

Write the file `/Users/bert_kiefer_cp_home/choice-tactical-website/tests/plate-validation.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { isValidPlateSize } from '../functions/_lib/plate-validation.js';

const ALLOWED = ['12', '12.5', '13', '20.5', '25', '25.4'];

describe('isValidPlateSize', () => {
  it('accepts a size in the allowlist', () => {
    expect(isValidPlateSize('20.5', ALLOWED)).toBe(true);
  });

  it('accepts the boundary sizes', () => {
    expect(isValidPlateSize('12', ALLOWED)).toBe(true);
    expect(isValidPlateSize('25.4', ALLOWED)).toBe(true);
  });

  it('rejects a size not in the allowlist', () => {
    expect(isValidPlateSize('7.5', ALLOWED)).toBe(false);
    expect(isValidPlateSize('26', ALLOWED)).toBe(false);
  });

  it('rejects empty / null / undefined', () => {
    expect(isValidPlateSize('', ALLOWED)).toBe(false);
    expect(isValidPlateSize(null, ALLOWED)).toBe(false);
    expect(isValidPlateSize(undefined, ALLOWED)).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(isValidPlateSize(20.5, ALLOWED)).toBe(false);
    expect(isValidPlateSize({}, ALLOWED)).toBe(false);
  });

  it('rejects when the allowlist is missing or empty', () => {
    expect(isValidPlateSize('20.5', [])).toBe(false);
    expect(isValidPlateSize('20.5', null)).toBe(false);
    expect(isValidPlateSize('20.5', undefined)).toBe(false);
  });

  it('is exact-match — no whitespace tolerance', () => {
    expect(isValidPlateSize(' 20.5', ALLOWED)).toBe(false);
    expect(isValidPlateSize('20.5 ', ALLOWED)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/bert_kiefer_cp_home/choice-tactical-website
npm test -- tests/plate-validation.test.js
```

Expected: 7 tests FAIL with "Cannot find module '../functions/_lib/plate-validation.js'".

- [ ] **Step 3: Implement the helper**

Write `/Users/bert_kiefer_cp_home/choice-tactical-website/functions/_lib/plate-validation.js`:

```javascript
// functions/_lib/plate-validation.js
// Pure helper: returns true iff `size` is an exact-match string member of `allowed`.
// Used server-side to validate a customer-supplied plate-size before Stripe checkout.

export function isValidPlateSize(size, allowed) {
  if (typeof size !== 'string' || !size.length) return false;
  if (!Array.isArray(allowed) || !allowed.length) return false;
  return allowed.includes(size);
}
```

- [ ] **Step 4: Run tests to verify all pass**

```bash
cd /Users/bert_kiefer_cp_home/choice-tactical-website
npm test -- tests/plate-validation.test.js
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/bert_kiefer_cp_home/choice-tactical-website
git add functions/_lib/plate-validation.js tests/plate-validation.test.js
git commit -m "feat: add plate-size validation helper"
```

---

## Task 2: Restructure The AXIS entry in `products.json`

**Files:**
- Modify: `/Users/bert_kiefer_cp_home/choice-tactical-website/shop/products.json`

This task uses **placeholder Stripe IDs** — they get replaced with real IDs in Task 11 after the user creates them in the Stripe Dashboard.

- [ ] **Step 1: Read the current AXIS entry to confirm structure**

```bash
cd /Users/bert_kiefer_cp_home/choice-tactical-website
sed -n '11,75p' shop/products.json
```

Confirm: lines 12-19 show `"slug": "the-axis"`, top-level `stripePriceId`, `priceUsd: 175`, `shippingRateId`. The block ends with the closing `}` of the AXIS product entry.

- [ ] **Step 2: Edit the AXIS entry — remove top-level price fields and add options/variants/replacementPlate**

Open `/Users/bert_kiefer_cp_home/choice-tactical-website/shop/products.json` in an editor. Find the AXIS entry (begins at the line `"slug": "the-axis"`). The current block has:

```json
"slug": "the-axis",
"name": "The AXIS",
"subtitle": "Wind Flag Alignment System",
"customerPictures": true,
"cardImage": "/shop/images/the-axis/01-gunsmith-1.png",
"stripePriceId": "price_1TU8xZIfCMZaSnjC17yZUqDb",
"priceUsd": 175,
"shippingRateId": "shr_1TTc20IfCMZaSnjCSSpSB0ti",
"images": [ ... ],
"description": [ ... ]
```

Replace these specific lines:

```json
"stripePriceId": "price_1TU8xZIfCMZaSnjC17yZUqDb",
"priceUsd": 175,
"shippingRateId": "shr_1TTc20IfCMZaSnjCSSpSB0ti",
```

with the variant block below (note the leading `,` removed where appropriate; final JSON shown below). After the existing `"description": [ ... ]` array, but before the closing `}` of the AXIS entry, append the `options`, `variants`, and `replacementPlate` blocks.

The full edited AXIS entry should look like this:

```json
{
  "slug": "the-axis",
  "name": "The AXIS",
  "subtitle": "Wind Flag Alignment System",
  "customerPictures": true,
  "cardImage": "/shop/images/the-axis/01-gunsmith-1.png",
  "images": [
    "/shop/images/the-axis/00-hero-branded.png",
    "/shop/images/the-axis/01-gunsmith-1.png",
    "/shop/images/the-axis/02-gunsmith-2.png",
    "/shop/images/the-axis/03-gunsmith-3.png",
    "/shop/images/the-axis/04-gunsmith-5.png",
    "/shop/images/the-axis/05-labeled-features.png",
    "/shop/images/the-axis/06-callouts.png",
    "/shop/images/the-axis/07-marketing.png"
  ],
  "description": [
    /* leave the existing description array unchanged */
  ],
  "options": [
    {
      "id": "laser",
      "name": "Configuration",
      "values": [
        { "id": "hitekk",  "name": "HITEKK 5W Green Laser",  "default": true },
        { "id": "miprezt", "name": "MIPREZT 2W Green Laser" },
        { "id": "none",    "name": "No Laser (use my own)", "plateSelectable": true }
      ]
    }
  ],
  "variants": [
    {
      "selections": { "laser": "hitekk" },
      "priceUsd": 195,
      "stripePriceId": "price_AXIS_HITEKK_PLACEHOLDER",
      "shippingRateId": "shr_1TTc20IfCMZaSnjCSSpSB0ti",
      "bundledPlate": "25.4"
    },
    {
      "selections": { "laser": "miprezt" },
      "priceUsd": 175,
      "stripePriceId": "price_1TU8xZIfCMZaSnjC17yZUqDb",
      "shippingRateId": "shr_1TTc20IfCMZaSnjCSSpSB0ti",
      "bundledPlate": "20.5"
    },
    {
      "selections": { "laser": "none" },
      "priceUsd": 165,
      "stripePriceId": "price_AXIS_NOLASER_PLACEHOLDER",
      "shippingRateId": "shr_1TTc20IfCMZaSnjCSSpSB0ti"
    }
  ],
  "replacementPlate": {
    "stripePriceId": "price_AXIS_PLATE_12_PLACEHOLDER",
    "shippingRateId": "shr_FREE_PLATE_PLACEHOLDER",
    "priceUsd": 12,
    "displayName": "AXIS Replacement Plate",
    "plateSizes": [
      "12", "12.5", "13", "13.5", "14", "14.5", "15", "15.5",
      "16", "16.5", "17", "17.5", "18", "18.5", "19", "19.5",
      "20", "20.5", "21", "21.5", "22", "22.5", "23", "23.5",
      "24", "24.5", "25", "25.4"
    ]
  }
}
```

**Important:** Do NOT touch any other product entries in the file (The Stack, ELEMENT line, etc.). Only edit the AXIS block.

- [ ] **Step 3: Verify JSON is valid**

```bash
cd /Users/bert_kiefer_cp_home/choice-tactical-website
node -e "JSON.parse(require('fs').readFileSync('shop/products.json','utf8'))" && echo OK
```

Expected: prints `OK`. If you see a `SyntaxError`, fix the trailing comma or brace and re-run.

- [ ] **Step 4: Commit**

```bash
cd /Users/bert_kiefer_cp_home/choice-tactical-website
git add shop/products.json
git commit -m "shop: AXIS multi-variant + replacement plate (placeholder Stripe IDs)"
```

---

## Task 3: Extend cart line shape in `js/shop.js` to carry metadata

**Files:**
- Modify: `/Users/bert_kiefer_cp_home/choice-tactical-website/js/shop.js`

The cart-line shape currently is `{ slug, stripePriceId, qty, selections? }`. We need to add an optional `metadata` field (e.g. `{ plate_size: "20.5" }`) and include it in the line key so different metadata values become distinct cart lines.

- [ ] **Step 1: Replace `lineKey` and `addToCart` to include metadata**

Open `/Users/bert_kiefer_cp_home/choice-tactical-website/js/shop.js`. Find this existing block (currently around lines 49-75):

```javascript
  function lineKey(line) {
    return (line.stripePriceId || '') + '|' + JSON.stringify(line.selections || {});
  }

  function addToCart(item) {
    // item = { slug, stripePriceId, qty, selections? }
    var cart = readCart();
    var newKey = lineKey(item);
    var existing = null;
    for (var i = 0; i < cart.length; i++) {
      if (lineKey(cart[i]) === newKey) {
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
        selections: item.selections || null,
        qty: Math.min(99, Math.max(1, item.qty))
      });
    }
    writeCart(cart);
  }
```

Replace with:

```javascript
  function lineKey(line) {
    return (line.stripePriceId || '')
      + '|' + JSON.stringify(line.selections || {})
      + '|' + JSON.stringify(line.metadata || {});
  }

  function addToCart(item) {
    // item = { slug, stripePriceId, qty, selections?, metadata? }
    var cart = readCart();
    var newKey = lineKey(item);
    var existing = null;
    for (var i = 0; i < cart.length; i++) {
      if (lineKey(cart[i]) === newKey) {
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
        selections: item.selections || null,
        metadata: item.metadata || null,
        qty: Math.min(99, Math.max(1, item.qty))
      });
    }
    writeCart(cart);
  }
```

- [ ] **Step 2: Verify the file still parses (no JS errors)**

```bash
cd /Users/bert_kiefer_cp_home/choice-tactical-website
node --check js/shop.js && echo OK
```

Expected: prints `OK`.

- [ ] **Step 3: Commit**

```bash
cd /Users/bert_kiefer_cp_home/choice-tactical-website
git add js/shop.js
git commit -m "shop: extend cart-line shape to carry per-line metadata"
```

---

## Task 4: Render plate dropdown when active option value is `plateSelectable`

**Files:**
- Modify: `/Users/bert_kiefer_cp_home/choice-tactical-website/js/shop.js`

The existing variant picker for The Stack renders one `<select>` per `option`. We're extending it so that when the customer picks an option value flagged with `plateSelectable: true`, a second dropdown appears with the plate sizes. The plate dropdown is NOT a variant axis — its value flows as cart-line metadata.

- [ ] **Step 1: Find and read the current variant picker block**

```bash
cd /Users/bert_kiefer_cp_home/choice-tactical-website
sed -n '383,510p' js/shop.js
```

This shows the `hasOptions` / `hasFlatVariants` rendering and the `applyVariant` function. The variant picker output `variantPicker` is an HTML string built from `product.options`.

- [ ] **Step 2: Add a `plateSizes` lookup and conditional plate dropdown**

In `js/shop.js`, locate the `if (hasOptions) { ... }` block (around line 383). After the existing `variantPicker = '<div class="variant-picker">' + ... + '</div>';` assignment, append the plate-dropdown markup:

Find this section:

```javascript
        variantPicker = '<div class="variant-picker">' +
          product.options.map(function (opt) {
            return '<div class="variant-option-group">' +
              '<label class="variant-option-label" for="opt_' + escapeHtml(opt.id) + '">' +
                escapeHtml(opt.name) +
              '</label>' +
              '<select class="variant-option-select" id="opt_' + escapeHtml(opt.id) + '" ' +
                'data-option-id="' + escapeHtml(opt.id) + '">' +
                (opt.values || []).map(function (val, i) {
                  var label = val.name + (val.subtitle ? ' (' + val.subtitle + ')' : '');
                  return '<option value="' + escapeHtml(val.id) + '"' +
                    (i === 0 ? ' selected' : '') + '>' + escapeHtml(label) + '</option>';
                }).join('') +
              '</select>' +
            '</div>';
          }).join('') +
        '</div>';
```

Modify the value-rendering inside to honor `default: true` instead of always selecting the first item, and replace the entire block with:

```javascript
        // Pick the default-flagged value, or fall back to the first one
        var defaultValueIdByOption = {};
        product.options.forEach(function (opt) {
          var def = (opt.values || []).find(function (v) { return v.default; });
          defaultValueIdByOption[opt.id] = def ? def.id : (opt.values && opt.values[0] && opt.values[0].id);
        });

        variantPicker = '<div class="variant-picker">' +
          product.options.map(function (opt) {
            var defId = defaultValueIdByOption[opt.id];
            return '<div class="variant-option-group">' +
              '<label class="variant-option-label" for="opt_' + escapeHtml(opt.id) + '">' +
                escapeHtml(opt.name) +
              '</label>' +
              '<select class="variant-option-select" id="opt_' + escapeHtml(opt.id) + '" ' +
                'data-option-id="' + escapeHtml(opt.id) + '">' +
                (opt.values || []).map(function (val) {
                  var label = val.name + (val.subtitle ? ' (' + val.subtitle + ')' : '');
                  return '<option value="' + escapeHtml(val.id) + '"' +
                    (val.id === defId ? ' selected' : '') + '>' + escapeHtml(label) + '</option>';
                }).join('') +
              '</select>' +
            '</div>';
          }).join('') +
          // Plate-size dropdown — hidden by default, shown when active option value has plateSelectable
          '<div class="variant-option-group plate-size-group" id="plateSizeGroup" style="display:none">' +
            '<label class="variant-option-label" for="opt_plate_size">Plate Size — match your laser\'s diameter</label>' +
            '<select class="variant-option-select" id="opt_plate_size" data-plate-size="1">' +
              '<option value="">Pick a size</option>' +
              ((product.replacementPlate && product.replacementPlate.plateSizes) || []).map(function (s) {
                return '<option value="' + escapeHtml(s) + '">' + escapeHtml(s) + ' mm</option>';
              }).join('') +
            '</select>' +
          '</div>' +
        '</div>';

        // Initial variant lookup honoring the new defaults
        var initialSelections = {};
        Object.keys(defaultValueIdByOption).forEach(function (k) {
          initialSelections[k] = defaultValueIdByOption[k];
        });
        initialVariant = findVariantBySelections(product, initialSelections) || product.variants[0];
        initialPrice = initialVariant.priceUsd;
        initialPriceId = initialVariant.stripePriceId;
```

- [ ] **Step 3: Update the variant-change wiring to show/hide the plate dropdown and gate Add to Cart**

Find the `applyVariant` function (around line 457-490) — the function that runs when a `variant-option-select` changes. Replace its body and the surrounding handler-attachment block. The existing block:

```javascript
      function applyVariant(v) {
        if (!v) return;
        if (priceLabel) {
          priceLabel.innerHTML = '<span class="price-from">from</span> ' + formatUSD(v.priceUsd);
        }
        if (addBtnEl) addBtnEl.setAttribute('data-price-id', v.stripePriceId);
      }

      selects.forEach(function (sel) {
        sel.addEventListener('change', function () {
          // Build current selections from all selects
          var sels = {};
          selects.forEach(function (s) { sels[s.getAttribute('data-option-id')] = s.value; });
          var v = findVariantBySelections(product, sels);
          applyVariant(v);
        });
      });
```

Replace with:

```javascript
      var plateGroup = container.querySelector('#plateSizeGroup');
      var plateSelect = container.querySelector('#opt_plate_size');
      var allowedPlates = (product.replacementPlate && product.replacementPlate.plateSizes) || [];

      function activeOptionValue(optId, sels) {
        var opt = (product.options || []).find(function (o) { return o.id === optId; });
        if (!opt) return null;
        return (opt.values || []).find(function (v) { return v.id === sels[optId]; });
      }

      function applyVariant(v) {
        if (!v) return;
        if (priceLabel) {
          priceLabel.innerHTML = '<span class="price-from">from</span> ' + formatUSD(v.priceUsd);
        }
        if (addBtnEl) addBtnEl.setAttribute('data-price-id', v.stripePriceId);
      }

      function refreshPlateGate() {
        var sels = {};
        selects.forEach(function (s) { sels[s.getAttribute('data-option-id')] = s.value; });
        var v = findVariantBySelections(product, sels);
        applyVariant(v);

        // Decide whether plate dropdown is required
        var plateRequired = false;
        Object.keys(sels).forEach(function (optId) {
          var val = activeOptionValue(optId, sels);
          if (val && val.plateSelectable) plateRequired = true;
        });

        if (plateRequired) {
          plateGroup.style.display = '';
        } else {
          plateGroup.style.display = 'none';
          if (plateSelect) plateSelect.value = '';
        }

        // Gate the Add to Cart button
        if (addBtnEl) {
          var plateOk = !plateRequired || (plateSelect && allowedPlates.indexOf(plateSelect.value) !== -1);
          addBtnEl.disabled = !plateOk;
          addBtnEl.title = plateOk ? '' : 'Pick your plate size to continue';
        }
      }

      selects.forEach(function (sel) {
        sel.addEventListener('change', refreshPlateGate);
      });
      if (plateSelect) plateSelect.addEventListener('change', refreshPlateGate);
      refreshPlateGate(); // initial state
```

- [ ] **Step 4: Update the existing Add-to-Cart click handler to include plate metadata**

Find the existing Add to Cart click handler in `renderProductDetail` (search for `addToCartBtn` after the variant wiring block). Update the call to `addToCart` to include metadata. The existing handler typically looks like:

```javascript
addBtnEl.addEventListener('click', function () {
  var qty = Math.max(1, Math.min(10, parseInt(qtyInput.value, 10) || 1));
  var sels = {};
  selects.forEach(function (s) { sels[s.getAttribute('data-option-id')] = s.value; });
  addToCart({
    slug: product.slug,
    stripePriceId: addBtnEl.getAttribute('data-price-id'),
    qty: qty,
    selections: sels
  });
  showToast('Added to cart');
});
```

Replace with:

```javascript
addBtnEl.addEventListener('click', function () {
  if (addBtnEl.disabled) return;
  var qty = Math.max(1, Math.min(10, parseInt(qtyInput.value, 10) || 1));
  var sels = {};
  selects.forEach(function (s) { sels[s.getAttribute('data-option-id')] = s.value; });
  var meta = null;
  if (plateSelect && plateGroup.style.display !== 'none' && plateSelect.value) {
    meta = { plate_size: plateSelect.value };
  }
  addToCart({
    slug: product.slug,
    stripePriceId: addBtnEl.getAttribute('data-price-id'),
    qty: qty,
    selections: sels,
    metadata: meta
  });
  showToast('Added to cart');
});
```

(If the existing handler shape differs, preserve its existing logic and just add the `meta` and `metadata: meta` lines.)

- [ ] **Step 5: Verify JS still parses**

```bash
cd /Users/bert_kiefer_cp_home/choice-tactical-website
node --check js/shop.js && echo OK
```

Expected: `OK`.

- [ ] **Step 6: Commit**

```bash
cd /Users/bert_kiefer_cp_home/choice-tactical-website
git add js/shop.js
git commit -m "shop: conditional plate dropdown for plateSelectable option values"
```

---

## Task 5: Render the "Already own an AXIS?" replacement-plate section

**Files:**
- Modify: `/Users/bert_kiefer_cp_home/choice-tactical-website/js/shop.js`

When `product.replacementPlate` is present, append a separate section below the main configurator with its own dropdown and Add to Cart button.

- [ ] **Step 1: Add a `renderReplacementPlateSection` function inside the IIFE**

In `js/shop.js`, locate `renderProductDetail`. After the function ends (or near it), add this helper inside the same IIFE scope:

```javascript
  function renderReplacementPlateSection(container, product) {
    var rp = product.replacementPlate;
    if (!rp || !Array.isArray(rp.plateSizes) || !rp.plateSizes.length) return;

    var section = document.createElement('div');
    section.className = 'replacement-plate-section';
    section.innerHTML =
      '<hr class="replacement-plate-divider">' +
      '<h2 class="replacement-plate-h">Already own an AXIS?</h2>' +
      '<p class="replacement-plate-blurb">Need a different plate to fit a different laser? ' +
        'Replacement plates ship in a small padded envelope, free shipping included.</p>' +
      '<div class="variant-option-group">' +
        '<label class="variant-option-label" for="rp_plate_size">Plate Size</label>' +
        '<select class="variant-option-select" id="rp_plate_size">' +
          '<option value="">Pick a size</option>' +
          rp.plateSizes.map(function (s) {
            return '<option value="' + escapeHtml(s) + '">' + escapeHtml(s) + ' mm</option>';
          }).join('') +
        '</select>' +
      '</div>' +
      '<p class="replacement-plate-price">' + formatUSD(rp.priceUsd) + ' (shipping included)</p>' +
      '<button type="button" class="add-to-cart-btn" id="rpAddBtn" disabled ' +
        'title="Pick your plate size to continue">Add Plate to Cart</button>';

    container.appendChild(section);

    var sel = section.querySelector('#rp_plate_size');
    var btn = section.querySelector('#rpAddBtn');
    var allowed = rp.plateSizes;

    sel.addEventListener('change', function () {
      var ok = allowed.indexOf(sel.value) !== -1;
      btn.disabled = !ok;
      btn.title = ok ? '' : 'Pick your plate size to continue';
    });

    btn.addEventListener('click', function () {
      if (btn.disabled) return;
      addToCart({
        slug: product.slug,
        stripePriceId: rp.stripePriceId,
        qty: 1,
        selections: null,
        metadata: { plate_size: sel.value }
      });
      showToast('Added to cart');
    });
  }
```

- [ ] **Step 2: Call the new function from `renderProductDetail`**

In `renderProductDetail`, at the very end (after `bindGalleryInteractions(...)` and `setupCustomerPicturesButton(...)`), add:

```javascript
    renderReplacementPlateSection(container, product);
```

- [ ] **Step 3: Verify JS still parses**

```bash
cd /Users/bert_kiefer_cp_home/choice-tactical-website
node --check js/shop.js && echo OK
```

- [ ] **Step 4: Commit**

```bash
cd /Users/bert_kiefer_cp_home/choice-tactical-website
git add js/shop.js
git commit -m "shop: render \"Already own an AXIS?\" replacement-plate section"
```

---

## Task 6: Send `metadata` through the checkout payload + cart line display

**Files:**
- Modify: `/Users/bert_kiefer_cp_home/choice-tactical-website/js/shop.js`

The frontend needs to (a) include each cart line's `metadata` in the request to `/api/create-checkout`, and (b) display the plate size in the cart UI alongside other line details.

- [ ] **Step 1: Update `startCheckout` to forward metadata**

In `js/shop.js`, find `startCheckout` (around line 137-160). Look at the `items.map(function (i) { ... })` block that builds the checkout request. The current items shape is:

```javascript
return {
  slug: i.slug,
  stripePriceId: i.stripePriceId,
  qty: i.qty,
  selections: i.selections
};
```

Replace with:

```javascript
return {
  slug: i.slug,
  stripePriceId: i.stripePriceId,
  qty: i.qty,
  selections: i.selections,
  metadata: i.metadata
};
```

- [ ] **Step 2: Update the cart-line render to show plate size**

Search `js/shop.js` for the cart-page render code (look for `renderCart` or similar; usually around the `loadProducts().then` block that builds cart rows). The line-name builder should be extended to append `· <size> mm plate` when the line has metadata.

Find the function that renders each cart row's name (typically near the bottom of shop.js). The display name today is built from `product.name` plus any selection labels. Extend that builder so that if `line.metadata && line.metadata.plate_size`, it appends ` · ${plate_size} mm plate`.

If the cart-line name is built inline (not in a named function), find the spot in the cart render where the name is composed and add this logic immediately before the line is appended to the DOM:

```javascript
var nameSuffix = '';
if (line.metadata && line.metadata.plate_size) {
  nameSuffix = ' · ' + line.metadata.plate_size + ' mm plate';
}
// Append `nameSuffix` to whatever already-built display name string is being rendered.
```

If you cannot locate the exact spot, run `grep -n "selections" js/shop.js | head -30` to find where the current cart row composes its display string.

- [ ] **Step 3: Verify JS still parses**

```bash
cd /Users/bert_kiefer_cp_home/choice-tactical-website
node --check js/shop.js && echo OK
```

- [ ] **Step 4: Commit**

```bash
cd /Users/bert_kiefer_cp_home/choice-tactical-website
git add js/shop.js
git commit -m "shop: forward line metadata to checkout + display plate size in cart"
```

---

## Task 7: Server-side plate-size validation in `create-checkout.js`

**Files:**
- Modify: `/Users/bert_kiefer_cp_home/choice-tactical-website/functions/api/create-checkout.js`

Defenses: (a) for no-laser AXIS lines and replacement-plate lines, require a valid `metadata.plate_size`; (b) for laser-bundle lines (HITEKK / MIPREZT), ignore any client-supplied `plate_size` and use the variant's server-side `bundledPlate`; (c) reject lines that fail validation with 400.

- [ ] **Step 1: Import the validator and extend the line-processing loop**

Open `/Users/bert_kiefer_cp_home/choice-tactical-website/functions/api/create-checkout.js`. At the top, add:

```javascript
import { isValidPlateSize } from '../_lib/plate-validation.js';
```

- [ ] **Step 2: Replace the per-line metadata loop with the new validation logic**

Find the current per-line `selections` → `metadata` mapping (around lines 129-136):

```javascript
    if (item.selections && typeof item.selections === 'object') {
      Object.keys(item.selections).forEach((k) => {
        const v = item.selections[k];
        if (typeof v === 'string' && v) {
          form.append(`metadata[line_${i + 1}_${k}]`, v.slice(0, 500));
        }
      });
    }
```

Replace with the extended block:

```javascript
    // Forward selections as metadata (existing behavior — color, etc.)
    if (item.selections && typeof item.selections === 'object') {
      Object.keys(item.selections).forEach((k) => {
        const v = item.selections[k];
        if (typeof v === 'string' && v) {
          form.append(`metadata[line_${i + 1}_${k}]`, v.slice(0, 500));
        }
      });
    }

    // Plate size: server-controlled.
    // - Laser bundles: server forces variant.bundledPlate, ignoring any client value.
    // - No-laser AXIS / replacement plate: validate client-supplied metadata.plate_size
    //   against product.replacementPlate.plateSizes; reject if invalid.
    let plateSize = null;
    let serverForcedPlate = false;

    if (found) {
      const { product, variant } = found;
      const allowed = (product.replacementPlate && Array.isArray(product.replacementPlate.plateSizes))
        ? product.replacementPlate.plateSizes : [];

      if (variant && typeof variant.bundledPlate === 'string') {
        // Laser bundle — force the bundled size, ignore client metadata
        plateSize = variant.bundledPlate;
        serverForcedPlate = true;
      } else {
        const isNoLaserAxis = variant && variant.selections && variant.selections.laser === 'none';
        const isReplacementPlate = product.replacementPlate
          && product.replacementPlate.stripePriceId === item.stripePriceId;
        if (isNoLaserAxis || isReplacementPlate) {
          const clientSize = item.metadata && typeof item.metadata.plate_size === 'string'
            ? item.metadata.plate_size : '';
          if (!isValidPlateSize(clientSize, allowed)) {
            return json({ error: 'A valid plate size is required for this product' }, 400);
          }
          plateSize = clientSize;
        }
      }
    }

    if (plateSize) {
      form.append(`metadata[line_${i + 1}_plate_size]`, plateSize.slice(0, 32));
    }
```

(The `serverForcedPlate` flag is kept for clarity / future logging; not currently used elsewhere.)

- [ ] **Step 3: Verify the function still parses**

```bash
cd /Users/bert_kiefer_cp_home/choice-tactical-website
node --check functions/api/create-checkout.js && echo OK
```

- [ ] **Step 4: Commit**

```bash
cd /Users/bert_kiefer_cp_home/choice-tactical-website
git add functions/api/create-checkout.js
git commit -m "feat: server-side plate-size validation + forced bundled plate for laser variants"
```

---

## Task 8: Pretty-print plate size in the order email

**Files:**
- Modify: `/Users/bert_kiefer_cp_home/choice-tactical-website/functions/api/stripe-webhook.js`

The order email today renders metadata as `key: value` joined by commas. We special-case `plate_size` so it shows as `Plate: <size> mm`.

- [ ] **Step 1: Update `buildOrderEmail` to format `plate_size` specially**

Open `/Users/bert_kiefer_cp_home/choice-tactical-website/functions/api/stripe-webhook.js`. Find the `metaStr` line (around line 133):

```javascript
    const metaStr = Object.entries(itemMeta)
      .map(([k, v]) => `${k}: ${v}`).join(', ');
```

Replace with:

```javascript
    const metaStr = Object.entries(itemMeta)
      .map(([k, v]) => {
        if (k === 'plate_size') return `Plate: ${v} mm`;
        return `${k}: ${v}`;
      })
      .join(', ');
```

- [ ] **Step 2: Verify the function still parses**

```bash
cd /Users/bert_kiefer_cp_home/choice-tactical-website
node --check functions/api/stripe-webhook.js && echo OK
```

- [ ] **Step 3: Commit**

```bash
cd /Users/bert_kiefer_cp_home/choice-tactical-website
git add functions/api/stripe-webhook.js
git commit -m "shop: format plate_size as \"Plate: N mm\" in order email"
```

---

## Task 9: CSS for replacement-plate section + conditional plate dropdown

**Files:**
- Modify: `/Users/bert_kiefer_cp_home/choice-tactical-website/css/shop.css`

- [ ] **Step 1: Append styles to the bottom of `css/shop.css`**

Append exactly this block to `/Users/bert_kiefer_cp_home/choice-tactical-website/css/shop.css`:

```css
/* ── Replacement Plate section (AXIS detail page) ────────────── */
.replacement-plate-divider {
  border: none;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  margin: 40px 0 24px;
}
.replacement-plate-section .replacement-plate-h {
  font-size: 18px;
  color: #ffb84d;
  margin: 0 0 8px;
  letter-spacing: 0.5px;
}
.replacement-plate-section .replacement-plate-blurb {
  color: #ccc;
  font-size: 13px;
  line-height: 1.5;
  margin: 0 0 16px;
  max-width: 480px;
}
.replacement-plate-section .replacement-plate-price {
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  margin: 12px 0 14px;
}
.replacement-plate-section .add-to-cart-btn:disabled {
  background: rgba(255, 184, 77, 0.3);
  cursor: not-allowed;
}

/* Plate-size dropdown when revealed by plateSelectable option value */
.plate-size-group {
  margin-top: 12px;
  padding: 10px 12px;
  background: rgba(255, 184, 77, 0.05);
  border: 1px dashed rgba(255, 184, 77, 0.3);
  border-radius: 4px;
}
.plate-size-group .variant-option-label {
  color: #ffb84d;
}

/* Disabled Add to Cart in main configurator (when plate not picked) */
.add-to-cart-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/bert_kiefer_cp_home/choice-tactical-website
git add css/shop.css
git commit -m "shop: styles for replacement-plate section + plate dropdown"
```

---

## Task 10: Bump cache versions in `shop/product.html`

**Files:**
- Modify: `/Users/bert_kiefer_cp_home/choice-tactical-website/shop/product.html`

- [ ] **Step 1: Bump `shop.css` and `shop.js` querystring values**

Open `/Users/bert_kiefer_cp_home/choice-tactical-website/shop/product.html`. Find the lines:

```html
<link rel="stylesheet" href="/css/shop.css?v=15">
<script src="/js/shop.js?v=14"></script>
```

(The exact current values may differ — use `grep "shop\.css?v\|shop\.js?v" shop/product.html` to confirm.) Bump each by 1:

```html
<link rel="stylesheet" href="/css/shop.css?v=16">
<script src="/js/shop.js?v=15"></script>
```

Also find and bump the same files in `shop/index.html` if they're referenced there at the same versions (they share the cache namespace).

- [ ] **Step 2: Commit**

```bash
cd /Users/bert_kiefer_cp_home/choice-tactical-website
git add shop/product.html shop/index.html
git commit -m "shop: bump shop.css/shop.js cache versions"
```

---

## Task 11: Create real Stripe artifacts and replace placeholders

This task is configuration in the Stripe Dashboard plus one search-and-replace in `products.json`. None of the Stripe work is automatable from this machine — the user clicks through the Stripe Dashboard and pastes the resulting IDs back.

- [ ] **Step 1: User creates Stripe products + prices in the Dashboard**

Open the Stripe Dashboard (https://dashboard.stripe.com). Create three new prices and one new shipping rate. Each is created under a Stripe Product that may need to be created if not already present.

| Stripe Product | Stripe Price (one-time) | Notes |
|---|---|---|
| The AXIS — HITEKK 5W Green Laser | **$195** | New product or new price under existing AXIS product |
| The AXIS — No Laser | **$165** | Same |
| AXIS Replacement Plate | **$12** | New product, single price |

| Stripe Shipping Rate | Amount |
|---|---|
| Free shipping (plate only) | **$0** |

After creating each, copy its ID from the URL or detail page. The IDs look like `price_1ABcDeFgH...` (28+ chars after `price_`) for prices and `shr_1ABcDeFgH...` for shipping rates.

- [ ] **Step 2: Replace placeholders in `shop/products.json`**

Open `/Users/bert_kiefer_cp_home/choice-tactical-website/shop/products.json` and search-and-replace each placeholder with the real ID:

| Placeholder | Replace with |
|---|---|
| `price_AXIS_HITEKK_PLACEHOLDER` | the new $195 HITEKK price ID |
| `price_AXIS_NOLASER_PLACEHOLDER` | the new $165 No-Laser price ID |
| `price_AXIS_PLATE_12_PLACEHOLDER` | the new $12 replacement-plate price ID |
| `shr_FREE_PLATE_PLACEHOLDER` | the new $0 shipping rate ID |

The MIPREZT variant already references the existing `price_1TU8xZIfCMZaSnjC17yZUqDb` and needs no change.

- [ ] **Step 3: Verify JSON parses**

```bash
cd /Users/bert_kiefer_cp_home/choice-tactical-website
node -e "JSON.parse(require('fs').readFileSync('shop/products.json','utf8'))" && echo OK
```

- [ ] **Step 4: Commit**

```bash
cd /Users/bert_kiefer_cp_home/choice-tactical-website
git add shop/products.json
git commit -m "shop: wire production Stripe price + shipping rate IDs for AXIS variants"
```

---

## Task 12: Smoke test locally, then deploy

This is a verification + deploy task. The local smoke test catches obvious wiring mistakes before customers see them. The deploy happens via Direct Upload (the existing convention for this project).

- [ ] **Step 1: Run the unit test suite**

```bash
cd /Users/bert_kiefer_cp_home/choice-tactical-website
npm test
```

Expected: all tests PASS, including the 7 plate-validation tests added in Task 1.

- [ ] **Step 2: Run wrangler dev and smoke test in a browser**

```bash
cd /Users/bert_kiefer_cp_home/choice-tactical-website
npx wrangler pages dev . --d1=DB=customer_pictures --r2=CUSTOMER_PICTURES --local
```

In another terminal, open `http://localhost:8788/shop/product?slug=the-axis` in a browser. Verify:

1. Page loads with the **HITEKK 5W Green Laser** option selected by default. Price shows `from $195`. Plate dropdown is **hidden**.
2. Switching the dropdown to **MIPREZT 2W Green Laser** updates the price to `from $175`. Plate dropdown stays hidden.
3. Switching to **No Laser (use my own)** reveals the plate dropdown (with placeholder `Pick a size`). Price updates to `from $165`. **Add to Cart is disabled**.
4. Picking a plate size (e.g. `14.5 mm`) enables Add to Cart.
5. Switching back to HITEKK hides the plate dropdown AND clears its value (verify via DevTools that `#opt_plate_size` value is `""`).
6. Scroll to the bottom of the page. Verify the **"Already own an AXIS?"** section renders with its own plate dropdown and `$12 (shipping included)` label.
7. Picking a size in that dropdown enables the Add Plate to Cart button.
8. Add an AXIS (with No Laser, plate size 14.5 mm) AND a replacement plate (size 25 mm) to the cart. Verify both appear in the cart with their plate sizes shown.
9. Click checkout. Confirm Stripe checkout opens (or, if `STRIPE_SECRET_KEY` isn't set in `.dev.vars`, that the request reaches `/api/create-checkout` and returns a sensible error rather than crashing).

- [ ] **Step 3: Verify backend rejects invalid plate sizes**

With wrangler dev still running:

```bash
# Should return 400 — no plate size for no-laser AXIS
curl -s -i -X POST http://localhost:8788/api/create-checkout \
  -H "content-type: application/json" \
  -d '{"items":[{"stripePriceId":"<paste real no-laser price id>","qty":1}]}' | head -10
```

Expected: HTTP 400 with body containing `A valid plate size is required for this product`. (If the real Stripe key isn't set, you'll get a 500 first — that's also fine for this check; the validation runs before the Stripe call.)

```bash
# Should return 400 — invalid plate size
curl -s -i -X POST http://localhost:8788/api/create-checkout \
  -H "content-type: application/json" \
  -d '{"items":[{"stripePriceId":"<no-laser price id>","qty":1,"metadata":{"plate_size":"7.5"}}]}' | head -10
```

Expected: HTTP 400 with same error message.

- [ ] **Step 4: Push to main and deploy**

```bash
cd /Users/bert_kiefer_cp_home/choice-tactical-website
git push origin main
npx wrangler pages deploy . --project-name=choice-tactical-website --branch=main --commit-dirty=true
```

Expected: deploy completes, prints a URL like `https://<hash>.choice-tactical-website.pages.dev`.

- [ ] **Step 5: Verify production**

Visit `https://www.choice-tactical.com/shop/product?slug=the-axis` (hard-refresh: Cmd+Shift+R). Walk through the same checks as Step 2.

- [ ] **Step 6 (optional): Test with one real $1 purchase**

If you want full end-to-end confidence, place one real test order through Stripe (use Stripe's test card `4242 4242 4242 4242` if you switch the public Stripe key to a test key, or use a real card and refund yourself afterward). Verify the order email arrives at `sendit@choice-tactical.com` with the line items showing `Plate: 14.5 mm` and `Plate: 25 mm` formatted correctly.

---

## Self-Review Checklist (run before declaring plan complete)

- [x] Spec section "Three laser configurations" covered → Task 2 (products.json), Task 4 (UI render), Task 7 (server validation)
- [x] Spec section "Plate sizes available: 28 sizes" → Task 2 (plateSizes array), Task 4 (dropdown), Task 7 (whitelist), Task 1 (test coverage)
- [x] Spec section "HITEKK / MIPREZT bundled plate" → Task 2 (`bundledPlate` field), Task 7 (server forces it)
- [x] Spec section "Already own an AXIS section" → Task 5 (renderReplacementPlateSection)
- [x] Spec section "$12 free shipping" → Task 2 (shippingRateId on replacementPlate), Task 11 (real Stripe rate)
- [x] Spec section "metadata flows to email" → Task 6 (frontend forwards), Task 7 (server emits), Task 8 (email formats)
- [x] Spec section "Add to Cart disabled until plate picked" → Task 4 (`refreshPlateGate`), Task 5 (rpAddBtn gating)
- [x] Spec section "Switching back from No Laser resets plate" → Task 4 (`if (plateSelect) plateSelect.value = ''`)
- [x] Spec section "default selection HITEKK" → Task 4 (`default: true` on the option value, `defaultValueIdByOption`)
- [x] Spec section "highest shipping rate wins" → Already implemented in `create-checkout.js` lines 56-72; no changes needed.
- [x] Spec security section "manipulate cart to skip plate" → Task 7 server validation
- [x] Spec security section "client claims non-bundled plate" → Task 7 `serverForcedPlate` branch ignores client value for laser variants
- [x] No placeholders ("TBD", "TODO", "fill in") in any task body — placeholders only in the Stripe-ID strings in Task 2, which are explicitly resolved in Task 11
- [x] Type/method names consistent: `isValidPlateSize`, `findVariantBySelections`, `addToCart` signature `{ slug, stripePriceId, qty, selections, metadata }` — same in Tasks 3, 4, 5, 6
