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

  // Line items + per-line selection metadata (e.g. color)
  items.forEach((item, i) => {
    form.append(`line_items[${i}][price]`, item.stripePriceId);
    form.append(`line_items[${i}][quantity]`, String(item.qty));
    if (item.selections && typeof item.selections === 'object') {
      Object.keys(item.selections).forEach((k) => {
        const v = item.selections[k];
        if (typeof v === 'string' && v) {
          // Stripe doesn't support metadata on Checkout line_items directly, but
          // session-level metadata is searchable in the Dashboard. Fold them in
          // with a per-line prefix so the value survives.
          form.append(`metadata[line_${i + 1}_${k}]`, v.slice(0, 500));
        }
      });
    }
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
