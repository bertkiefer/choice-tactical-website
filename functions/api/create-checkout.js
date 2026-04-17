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
