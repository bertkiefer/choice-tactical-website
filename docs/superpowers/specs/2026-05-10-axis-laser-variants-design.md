# AXIS Laser Variants + Replacement Plate — Design Spec

**Date:** 2026-05-10
**Project:** choice-tactical.com shop
**Repo:** `bertkiefer/choice-tactical-website`
**Status:** Design locked — ready for implementation plan

## Goal

Sell The AXIS in three configurations (HITEKK 5W laser bundle, MIPREZT 2W laser bundle, no-laser option with customer-chosen plate) and offer a $12 plate-only purchase for existing AXIS owners — all from the existing AXIS product page, with no new shop-index card and minimal new backend code.

## Scope (v1)

- AXIS becomes a multi-variant product (uses the same `options`/`variants` pattern The Stack already uses).
- Three laser configurations:
  - **HITEKK 5W Green Laser** — $195 (default selection on page load)
  - **MIPREZT 2W Green Laser** — $175
  - **No Laser (use my own)** — $165, customer picks plate size from dropdown
- Plate sizes available: 28 sizes — 12 mm through 25 mm in 0.5 mm increments, plus 25.4 mm (HITEKK-specific). Same list used for both the no-laser bundle and the replacement plate.
- HITEKK bundle includes a 25.4 mm plate. MIPREZT bundle includes a 20.5 mm plate. No customer choice on bundled-plate size.
- A separate "Already own an AXIS?" section at the bottom of the AXIS product page sells a single replacement plate for $12, free shipping included. Customer picks plate size from the same 28-size dropdown.
- Plate-size choices flow as Stripe `line_items[i].metadata.plate_size` so the order-confirmation email tells you exactly which plate(s) to ship.
- Add to Cart is disabled until any required plate-size dropdown has a real value selected.

## Out of scope (v1, deferred)

- Inventory tracking per plate size (we trust the operator to maintain stock).
- Letting customers buy a plate AND a different laser as separate line items in the same checkout (each laser is bundled — they buy a new AXIS or a plate, not a la carte parts).
- Deep-link to a specific configuration via URL parameter.
- A custom (non-native) dropdown component for the 28-size plate list. Native `<select>` is fine.
- Sales of plates/lasers as standalone items on the shop index page. The user does NOT want plates listed as their own product card.

## User-facing UX

### AXIS product page — top half (main configurator)

```
The AXIS
Wind Flag Alignment System

from $195

Configuration
┌─────────────────────────────────────────────────┐
│ HITEKK 5W Green Laser — $195            ▼       │  ← default
│ MIPREZT 2W Green Laser — $175                   │
│ No Laser (use my own) — from $165               │
└─────────────────────────────────────────────────┘

[when laser=none, this dropdown slides in]
  Plate Size — match your laser's diameter
  ┌──────────────────────┐
  │ Pick a size       ▼  │
  └──────────────────────┘
  12 mm, 12.5 mm, 13 mm, ... 25 mm, 25.4 mm

Quantity: 1
[ Add to Cart ]   ← disabled when laser=none AND plate not picked
```

- Page loads with HITEKK selected → price label shows `$195`, plate dropdown is hidden, Add to Cart enabled.
- Switching to MIPREZT → price label updates to `$175`, plate dropdown stays hidden.
- Switching to "No Laser" → price label shows `from $165`, plate dropdown slides in with first option `Pick a size`, Add to Cart disabled.
- Picking a real plate size enables Add to Cart and updates a small text element next to the price showing the chosen size (e.g. `$165 · 14.5 mm plate`).
- Switching back from "No Laser" to HITEKK or MIPREZT hides the plate dropdown AND resets its selection to the placeholder so a stale value never travels.

### AXIS product page — bottom half (replacement plate section)

```
─────────────────────────────────────────────────
Already own an AXIS?

Need a different plate to fit a different laser?
Replacement plates ship in a small padded
envelope, free shipping included.

Plate Size
┌──────────────────────────────────────────┐
│ Pick a size                          ▼   │
└──────────────────────────────────────────┘

$12 (shipping included)

[ Add Plate to Cart ]   ← disabled until size picked
─────────────────────────────────────────────────
```

- Always rendered if `product.replacementPlate` exists in `products.json`.
- Independent of the main configurator — customer can use it without touching the laser dropdown.
- Both Add to Carts can be used in sequence; cart accumulates lines.

### Cart and checkout behavior

- Existing cart UI (`shop/cart`) renders both line items with their plate-size metadata visible (e.g. `The AXIS — No Laser, 14.5 mm plate`, `Replacement Plate — 25 mm`).
- Existing "highest shipping rate wins" logic in `create-checkout.js` ensures customers pay one shipping fee per cart. AXIS rate wins when an AXIS is present; free plate rate applies only on plate-only carts.

## Data model (`shop/products.json`)

The AXIS entry gains:

```jsonc
{
  "slug": "the-axis",
  "name": "The AXIS",
  "subtitle": "Wind Flag Alignment System",
  "customerPictures": true,
  // existing top-level "stripePriceId" and "priceUsd" are REMOVED — variants are now the source of truth.
  // "shippingRateId" stays on each variant. The index-card "from $X" label is derived
  // automatically from the minimum variant price (existing shop.js logic).
  // ...existing cardImage, images gallery, description blocks...
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
      "stripePriceId": "price_NEW_AXIS_HITEKK",
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
      "stripePriceId": "price_NEW_AXIS_NOLASER",
      "shippingRateId": "shr_1TTc20IfCMZaSnjCSSpSB0ti"
    }
  ],
  "replacementPlate": {
    "stripePriceId": "price_NEW_PLATE_12",
    "shippingRateId": "shr_NEW_FREE_PLATE",
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

The MIPREZT variant **reuses** the existing AXIS Stripe price (`price_1TU8xZIfCMZaSnjC17yZUqDb`) since it's the same $175. The HITEKK ($195), No-Laser ($165), and Replacement Plate ($12) are new Stripe prices.

`bundledPlate` is informational only — used by the order-email handler to record which plate ships with the bundle. The customer doesn't pick it.

`plateSelectable: true` on the `laser=none` option value is the hook the UI keys off to show/hide the plate dropdown for the main configurator.

## Architecture

### New / modified files

- **Modify** `shop/products.json` — extend the AXIS entry with `options`, `variants`, `replacementPlate` blocks above. Bump `subtitle` description if needed.
- **Modify** `js/shop.js` — extend `renderProductDetail` to:
  - Read `product.replacementPlate` and append a new section below the main configurator.
  - For variants whose selected option value has `plateSelectable: true`, render a second dropdown (the 28 plate sizes), default to a `Pick a size` placeholder, and disable Add to Cart until a real size is picked.
  - Update price label dynamically as configuration changes (existing variant logic does most of this — small extension for the plate-as-metadata case).
  - On Add to Cart, attach `metadata: { plate_size: "<size>" }` to the cart line.
- **Modify** `js/main.js` (cart handling) — pass `metadata` through to the create-checkout request body if present on a cart item.
- **Modify** `functions/api/create-checkout.js` — already supports per-line metadata (line 133); no change needed beyond the cart-handler change above.
- **Modify** `functions/api/stripe-webhook.js` — extend the order-confirmation email composer to surface each line item's `metadata.plate_size` next to the line name (e.g. `The AXIS — No Laser · Plate: 14.5 mm`). Existing webhook handler already reads line items; just include the metadata in the rendered HTML.
- **Modify** `css/shop.css` — add styles for the new "Already own an AXIS?" section divider and the plate dropdown layout. Bump version querystrings on shop.js / shop.css in `shop/product.html`.

### New Stripe artifacts (manual setup, not committed)

- `price_NEW_AXIS_HITEKK` — $195, recurring=false, product = "The AXIS — HITEKK 5W Green Laser"
- `price_NEW_AXIS_NOLASER` — $165, product = "The AXIS — No Laser"
- `price_NEW_PLATE_12` — $12, product = "AXIS Replacement Plate"
- `shr_NEW_FREE_PLATE` — Stripe Shipping Rate, $0, name "Free shipping (plate only)"

The placeholder IDs in `products.json` get replaced with real values once these are created in the Stripe Dashboard.

### Frontend behavior — variant lookup

The existing variant lookup logic in `shop.js` (`findVariantBySelections`) finds the matching variant by exact match on `selections`. The new schema has a single option group (`laser`) so each variant is keyed off `selections.laser`. When `laser=none`, the variant is the same regardless of plate size — the plate size is sent as cart metadata, not part of the variant key. This keeps the variant matrix at 3 entries.

## Order email (Resend, sent from `stripe-webhook.js`)

When a Stripe Checkout session completes, the existing webhook reads `line_items` and composes an email summary. Extend the line renderer:

```
Order summary:
  • The AXIS — No Laser · Plate: 14.5 mm — $165
  • AXIS Replacement Plate · Plate: 25 mm — $12
  Shipping: $X (AXIS rate)
  Total: $XXX
```

For laser-bundle lines, append the bundled plate size automatically: `· Plate: 25.4 mm` for HITEKK, `· Plate: 20.5 mm` for MIPREZT. (Read from `bundledPlate` in the variants array, looked up by `stripePriceId` against `products.json`.)

## Security & guardrails

| Risk | Mitigation |
|---|---|
| Customer submits cart with no plate size for a no-laser AXIS | Frontend disables Add to Cart until plate is picked (placeholder option in dropdown is not a valid value). Backend `create-checkout.js` defensively rejects line items where `stripePriceId === price_NEW_AXIS_NOLASER` and metadata `plate_size` is missing or unknown. |
| Customer manipulates the cart JSON to skip plate selection | Same backend defense — rejects with `{ error: "Plate size required for no-laser AXIS" }`. |
| Bundled-laser variant arrives with metadata `plate_size` | Backend ignores any client-supplied `plate_size` for HITEKK/MIPREZT lines and uses the server-side `bundledPlate` from products.json instead, preventing the customer from claiming a non-bundled plate size. |
| Plate-size dropdown shows an unsupported size | Whitelist check on the backend: `plate_size` must be in the `replacementPlate.plateSizes` list (read from server-side products.json). Reject otherwise. |
| Stripe price ID typo or stale | Same as today — `create-checkout.js` returns `{ error: 'Invalid price ID' }`. |

## Testing strategy

- **Unit (vitest):**
  - `findVariantBySelections({ laser: "hitekk" })` returns the HITEKK variant.
  - `findVariantBySelections({ laser: "none" })` returns the no-laser variant regardless of plate size.
  - Backend plate-size whitelist accepts `12`, `25.4`, rejects `7.5`, `26`, `""`.
  - Backend rejects no-laser line item with missing/empty plate_size.
- **Manual / smoke (wrangler pages dev):**
  - Visit `/shop/product?slug=the-axis`. Verify default selection HITEKK $195, no plate dropdown.
  - Switch to MIPREZT → price updates, no plate dropdown.
  - Switch to No Laser → plate dropdown appears, Add to Cart disabled until plate picked.
  - Pick plate `14.5 mm` → Add to Cart enables.
  - Add to cart, go to checkout, observe Stripe session has `line_items[0].metadata.plate_size = "14.5"`.
  - Scroll down to "Already own an AXIS?" → pick plate `25 mm` → add to cart → second line item appears.
  - Cart shows both lines with correct plate sizes; checkout total uses AXIS shipping (free plate rolls in).
  - Order-confirmation email shows both line items with their plate sizes.

## Cost estimate (low volume)

- New Stripe prices and shipping rate: no fee, all free in Stripe Dashboard.
- No new D1, R2, KV, or Pages Function endpoints — this is a frontend + Stripe wiring change. No incremental Cloudflare cost.
- Existing Resend free tier covers any incremental order-confirmation emails.

## Open questions

None. All design decisions resolved during brainstorming.

## Next step

Invoke `superpowers:writing-plans` to break this design into an ordered implementation plan with discrete tasks, verification steps, and explicit file paths.
