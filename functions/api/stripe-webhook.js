/**
 * POST /api/stripe-webhook
 * Stripe sends events here when a checkout session completes.
 * We email an order summary to ORDER_EMAIL_TO via Resend.
 *
 * Required Cloudflare Pages secrets:
 *   STRIPE_SECRET_KEY        — already set
 *   STRIPE_WEBHOOK_SECRET    — from Stripe Dashboard → Webhooks → reveal "Signing secret"
 *   RESEND_API_KEY           — from Resend → API Keys
 * Optional:
 *   ORDER_EMAIL_FROM         — defaults to "Choice Tactical Orders <onboarding@resend.dev>"
 *   ORDER_EMAIL_TO           — defaults to "orders@choice-tactical.com"
 */

export async function onRequestPost(context) {
  const { request, env } = context;

  const sigHeader = request.headers.get('stripe-signature');
  const rawBody = await request.text();

  // Verify Stripe signature
  if (env.STRIPE_WEBHOOK_SECRET) {
    const ok = await verifyStripeSignature(rawBody, sigHeader, env.STRIPE_WEBHOOK_SECRET);
    if (!ok) {
      console.error('Invalid Stripe webhook signature');
      return new Response('Invalid signature', { status: 400 });
    }
  } else {
    console.warn('STRIPE_WEBHOOK_SECRET not set — accepting unsigned webhook');
  }

  let event;
  try { event = JSON.parse(rawBody); }
  catch { return new Response('Invalid JSON', { status: 400 }); }

  if (event.type !== 'checkout.session.completed') {
    return new Response('Ignored', { status: 200 });
  }

  const sessionId = event.data && event.data.object && event.data.object.id;
  if (!sessionId) return new Response('No session', { status: 400 });

  // Fetch full session with line items + shipping rate
  const stripeSecret = env.STRIPE_SECRET_KEY;
  const sessionUrl =
    `https://api.stripe.com/v1/checkout/sessions/${sessionId}` +
    `?expand[]=line_items` +
    `&expand[]=shipping_cost.shipping_rate`;
  const sr = await fetch(sessionUrl, {
    headers: { 'Authorization': `Bearer ${stripeSecret}` }
  });
  if (!sr.ok) {
    const err = await sr.text();
    console.error('Failed to fetch session', sr.status, err);
    return new Response('Failed to fetch session', { status: 500 });
  }
  const session = await sr.json();

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
    body: JSON.stringify({
      from: fromAddr,
      to: [toAddr],
      subject,
      html,
      text
    })
  });

  if (!er.ok) {
    const errText = await er.text();
    console.error('Resend send failed', er.status, errText);
    return new Response('Email send failed', { status: 500 });
  }

  return new Response('OK', { status: 200 });
}

// ── Stripe signature verification (HMAC-SHA256, Cloudflare crypto) ──
async function verifyStripeSignature(payload, header, secret) {
  if (!header) return false;
  const parts = {};
  header.split(',').forEach(p => {
    const [k, v] = p.split('=');
    if (k === 't') parts.t = v;
    if (k === 'v1') (parts.v1 = parts.v1 || []).push(v);
  });
  if (!parts.t || !parts.v1) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sigBytes = await crypto.subtle.sign(
    'HMAC', key, enc.encode(`${parts.t}.${payload}`)
  );
  const expected = Array.from(new Uint8Array(sigBytes))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  return parts.v1.includes(expected);
}

// ── Email building ──
function buildOrderEmail(session) {
  const lineItems = (session.line_items && session.line_items.data) || [];
  const metadata = session.metadata || {};
  const customer = session.customer_details || {};
  const shipping = customer.address || {};
  const shippingRate = session.shipping_cost && session.shipping_cost.shipping_rate;

  // Per-line metadata (e.g. line_1_color)
  const itemRows = lineItems.map((li, i) => {
    const num = i + 1;
    const itemMeta = {};
    Object.keys(metadata).forEach(k => {
      const m = k.match(new RegExp(`^line_${num}_(.+)$`));
      if (m) itemMeta[m[1]] = metadata[k];
    });
    const metaStr = Object.entries(itemMeta)
      .map(([k, v]) => {
        if (k === 'plate_size') return `Plate: ${v} mm`;
        return `${k}: ${v}`;
      })
      .join(', ');
    return {
      qty: li.quantity || 1,
      name: li.description || 'Item',
      meta: metaStr,
      total: ((li.amount_total || 0) / 100)
    };
  });

  const shippingAmount = (((session.shipping_cost && session.shipping_cost.amount_total) || 0) / 100).toFixed(2);
  const taxAmount = (((session.total_details && session.total_details.amount_tax) || 0) / 100).toFixed(2);
  const total = ((session.amount_total || 0) / 100).toFixed(2);
  const customerName = customer.name || '';
  const customerEmail = customer.email || '';
  const orderShortId = (session.id || '').slice(-10);

  const subject = `New order ${orderShortId} — ${customerName || 'Customer'} — $${total}`;

  // Plain text version
  const textLines = [
    `New Choice Tactical order`,
    ``,
    `Order: ${session.id}`,
    `Customer: ${customerName} <${customerEmail}>`,
    ``,
    `SHIP TO:`,
    `  ${customerName}`,
    `  ${shipping.line1 || ''}`,
  ];
  if (shipping.line2) textLines.push(`  ${shipping.line2}`);
  textLines.push(
    `  ${shipping.city || ''}, ${shipping.state || ''} ${shipping.postal_code || ''}`,
    `  ${shipping.country || ''}`,
    ``,
    `ITEMS:`
  );
  itemRows.forEach(r => {
    textLines.push(`  ${r.qty}x ${r.name}${r.meta ? `  (${r.meta})` : ''} — $${r.total.toFixed(2)}`);
  });
  textLines.push(
    ``,
    `Shipping${shippingRate && shippingRate.display_name ? ` (${shippingRate.display_name})` : ''}: $${shippingAmount}`,
    `Tax: $${taxAmount}`,
    `TOTAL: $${total}`,
    ``,
    `View in Stripe: https://dashboard.stripe.com/payments/${session.payment_intent || ''}`
  );

  // HTML version
  const itemRowsHtml = itemRows.map(r => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #eee">
        <strong>${r.qty}× ${esc(r.name)}</strong>
        ${r.meta ? `<br><span style="color:#666;font-size:13px">${esc(r.meta)}</span>` : ''}
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">
        $${r.total.toFixed(2)}
      </td>
    </tr>`).join('');

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f6f6f6;margin:0;padding:24px;color:#000">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,.06)">
    <h1 style="margin:0 0 8px;color:#CBB589">🎯 New Order</h1>
    <p style="color:#666;margin:0 0 24px;font-size:14px">Choice Tactical &middot; ${esc(orderShortId)}</p>

    <h3 style="font-size:12px;letter-spacing:.1em;color:#888;margin:0 0 6px;text-transform:uppercase">Customer</h3>
    <p style="margin:0 0 4px"><strong>${esc(customerName)}</strong></p>
    <p style="margin:0 0 24px;color:#444"><a href="mailto:${esc(customerEmail)}" style="color:#444;text-decoration:none">${esc(customerEmail)}</a></p>

    <h3 style="font-size:12px;letter-spacing:.1em;color:#888;margin:0 0 6px;text-transform:uppercase">Ship To</h3>
    <p style="margin:0 0 24px;line-height:1.6">
      ${esc(customerName)}<br>
      ${esc(shipping.line1 || '')}${shipping.line2 ? '<br>' + esc(shipping.line2) : ''}<br>
      ${esc(shipping.city || '')}, ${esc(shipping.state || '')} ${esc(shipping.postal_code || '')}<br>
      ${esc(shipping.country || '')}
    </p>

    <h3 style="font-size:12px;letter-spacing:.1em;color:#888;margin:0 0 6px;text-transform:uppercase">Items</h3>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px">
      ${itemRowsHtml}
      <tr>
        <td style="padding:8px 0;color:#444">Shipping${shippingRate && shippingRate.display_name ? ` <span style="color:#888;font-size:13px">(${esc(shippingRate.display_name)})</span>` : ''}</td>
        <td style="padding:8px 0;text-align:right;color:#444">$${shippingAmount}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#444">Tax</td>
        <td style="padding:8px 0;text-align:right;color:#444">$${taxAmount}</td>
      </tr>
      <tr>
        <td style="padding:14px 0 0;font-weight:700;font-size:18px;border-top:2px solid #000">Total</td>
        <td style="padding:14px 0 0;text-align:right;font-weight:700;font-size:18px;border-top:2px solid #000">$${total}</td>
      </tr>
    </table>

    <p style="margin:24px 0 0">
      <a href="https://dashboard.stripe.com/payments/${esc(session.payment_intent || '')}"
         style="display:inline-block;padding:12px 20px;background:#000;color:#CBB589;text-decoration:none;border-radius:8px;font-weight:600">
        View in Stripe Dashboard
      </a>
    </p>
  </div>
</body></html>`;

  return { html, text: textLines.join('\n'), subject };
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
