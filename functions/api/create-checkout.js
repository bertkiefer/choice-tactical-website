/**
 * POST /api/create-checkout
 * Body: { items: [{ stripePriceId, qty }, ...] }
 * Returns: { url } on success, { error } on failure (status 400 or 500).
 *
 * Talks to Stripe directly via fetch (form-encoded body, classic Stripe API).
 * No SDK needed — keeps the Worker small and dependency-free.
 */

import { isValidPlateSize } from '../_lib/plate-validation.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  // ── Parse body ─────────────────────────────────
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  if (!body || typeof body !== 'object') {
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

  // ── Resolve shipping rate ──────────────────────
  // Prefer cart-driven rates (sent by client). With multiple distinct rates in the
  // cart, pick the one with the highest unit_amount so the customer pays the higher
  // shipping cost when their order spans different-size boxes.
  let chosenRateId = null;
  const cartRateIds = Array.isArray(body.shippingRateIds)
    ? body.shippingRateIds.filter(s => typeof s === 'string' && s.trim()).map(s => s.trim())
    : [];

  if (cartRateIds.length === 1) {
    chosenRateId = cartRateIds[0];
  } else if (cartRateIds.length > 1) {
    try {
      const rates = await Promise.all(cartRateIds.map(async (id) => {
        const r = await fetch(`https://api.stripe.com/v1/shipping_rates/${id}`, {
          headers: { 'Authorization': `Bearer ${secret}` }
        });
        return await r.json();
      }));
      let max = -1;
      for (const rate of rates) {
        const amt = (rate && rate.fixed_amount && rate.fixed_amount.amount) || 0;
        if (amt > max) { max = amt; chosenRateId = rate.id; }
      }
    } catch (_) { chosenRateId = cartRateIds[0]; }
  }

  // Fallback: env var (legacy / single-rate mode)
  if (!chosenRateId) {
    const envIds = (env.STRIPE_SHIPPING_RATE_IDS || '')
      .split(',').map(s => s.trim()).filter(Boolean);
    chosenRateId = envIds[0] || null;
  }

  // ── Build form-encoded Stripe request ──────────
  const form = new URLSearchParams();
  form.append('mode', 'payment');
  form.append('automatic_tax[enabled]', 'true');
  form.append('shipping_address_collection[allowed_countries][0]', 'US');

  if (chosenRateId) {
    form.append('shipping_options[0][shipping_rate]', chosenRateId);
  }

  // ── Load product catalog (canonical source of names + amounts) ─
  let products = [];
  try {
    const catalogUrl = new URL('/shop/products.json?ts=' + Date.now(), request.url);
    const cr = await fetch(catalogUrl.toString());
    if (cr.ok) {
      const data = await cr.json();
      products = Array.isArray(data.products) ? data.products : [];
    }
  } catch (_) { products = []; }

  // Line items — use price_data with custom name (so capacity + color appear on
  // the Stripe checkout page) when we can resolve the product, otherwise fall
  // back to the stored price ID.
  // Note: for...of (not forEach) so that validation `return` exits onRequestPost.
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const found = findProductByPriceId(products, item.stripePriceId);
    form.append(`line_items[${i}][quantity]`, String(item.qty));

    if (found) {
      const { product, variant } = found;
      const isReplacementPlateLine = !variant
        && product.replacementPlate
        && product.replacementPlate.stripePriceId === item.stripePriceId;
      const unitPrice = variant && typeof variant.priceUsd === 'number'
        ? variant.priceUsd
        : isReplacementPlateLine
          ? (product.replacementPlate.priceUsd || 0)
          : (product.priceUsd || 0);
      const displayName = isReplacementPlateLine
        ? (product.replacementPlate.displayName || (product.name + ' Replacement Plate'))
        : buildLineDisplay(product, variant, item.selections);
      const description = isReplacementPlateLine
        ? 'Replacement plate — ships in a small padded envelope'
        : (product.subtitle || '');
      const cents = Math.round(unitPrice * 100);
      form.append(`line_items[${i}][price_data][currency]`, 'usd');
      form.append(`line_items[${i}][price_data][unit_amount]`, String(cents));
      form.append(`line_items[${i}][price_data][product_data][name]`, displayName);
      if (description) {
        form.append(`line_items[${i}][price_data][product_data][description]`, description);
      }
      // Required for automatic_tax with inline product_data
      form.append(`line_items[${i}][price_data][product_data][tax_code]`, 'txcd_99999999');
    } else {
      form.append(`line_items[${i}][price]`, item.stripePriceId);
    }

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

    if (found) {
      const { product, variant } = found;
      const allowed = (product.replacementPlate && Array.isArray(product.replacementPlate.plateSizes))
        ? product.replacementPlate.plateSizes : [];

      if (variant && typeof variant.bundledPlate === 'string') {
        // Laser bundle — force the bundled size, ignore any client value
        plateSize = variant.bundledPlate;
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
  }

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

function findProductByPriceId(products, priceId) {
  for (const p of products) {
    if (p.stripePriceId === priceId) return { product: p, variant: null };
    if (Array.isArray(p.variants)) {
      for (const v of p.variants) {
        if (v.stripePriceId === priceId) return { product: p, variant: v };
      }
    }
    if (p.replacementPlate && p.replacementPlate.stripePriceId === priceId) {
      return { product: p, variant: null };
    }
  }
  return null;
}

function buildLineDisplay(product, variant, selections) {
  const parts = [product.name];
  const opts = Array.isArray(product.options) ? product.options : [];

  // Variant-driven option labels (e.g. capacity)
  if (variant && variant.selections) {
    const vNames = [];
    for (const opt of opts) {
      const id = variant.selections[opt.id];
      if (!id) continue;
      const val = (opt.values || []).find(v => v.id === id);
      if (val) vNames.push(val.name);
    }
    if (vNames.length) parts.push(vNames.join(', '));
  }

  // Extra selections from the cart line that variant didn't cover (e.g. color)
  if (selections) {
    const extra = [];
    for (const opt of opts) {
      if (variant && variant.selections && variant.selections[opt.id]) continue;
      const id = selections[opt.id];
      if (!id) continue;
      const val = (opt.values || []).find(v => v.id === id);
      if (val) extra.push(val.name);
    }
    if (extra.length) parts.push(extra.join(', '));
  }

  return parts.join(' — ');
}
