/**
 * GET /api/test-email
 * TEMPORARY — fires a fake order email so we can validate the Resend pipeline
 * without needing a real Stripe purchase. Delete this file after testing.
 */

export async function onRequestGet(context) {
  const { env } = context;

  if (!env.RESEND_API_KEY) {
    return new Response('Missing RESEND_API_KEY', { status: 500 });
  }

  // Simulated session matching what Stripe sends to /api/stripe-webhook
  const session = {
    id: 'cs_live_TEST_PIPELINE_CHECK',
    payment_intent: 'pi_TEST_PIPELINE_CHECK',
    amount_total: 10499,
    customer_details: {
      name: 'Test Customer',
      email: 'test@example.com',
      address: {
        line1: '1234 Demo Lane',
        line2: 'Suite 5',
        city: 'Dallas',
        state: 'TX',
        postal_code: '75201',
        country: 'US'
      }
    },
    line_items: {
      data: [{
        quantity: 1,
        description: 'The Stack — Single Stack — Burnt Titanium',
        amount_total: 7000
      }]
    },
    shipping_cost: {
      amount_total: 1499,
      shipping_rate: { display_name: 'USPS Priority Mail' }
    },
    total_details: { amount_tax: 2000 },
    metadata: {
      line_1_capacity: 'single',
      line_1_color: 'burnt-titanium'
    }
  };

  const { html, text, subject } = buildOrderEmail(session);
  const fromAddr = env.ORDER_EMAIL_FROM || 'Choice Tactical Orders <onboarding@resend.dev>';
  const toAddr = env.ORDER_EMAIL_TO || 'orders@choice-tactical.com';

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: fromAddr,
      to: [toAddr],
      subject: '[TEST] ' + subject,
      html,
      text
    })
  });

  if (!r.ok) {
    const errTxt = await r.text();
    return new Response(`Resend failed (${r.status}): ${errTxt}`, { status: 500 });
  }

  return new Response(
    `OK — test email sent to ${toAddr} from ${fromAddr}. Check inbox/spam.`,
    { status: 200, headers: { 'Content-Type': 'text/plain' } }
  );
}

function buildOrderEmail(session) {
  const lineItems = (session.line_items && session.line_items.data) || [];
  const metadata = session.metadata || {};
  const customer = session.customer_details || {};
  const shipping = customer.address || {};
  const shippingRate = session.shipping_cost && session.shipping_cost.shipping_rate;

  const itemRows = lineItems.map((li, i) => {
    const num = i + 1;
    const itemMeta = {};
    Object.keys(metadata).forEach(k => {
      const m = k.match(new RegExp(`^line_${num}_(.+)$`));
      if (m) itemMeta[m[1]] = metadata[k];
    });
    const metaStr = Object.entries(itemMeta).map(([k, v]) => `${k}: ${v}`).join(', ');
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

  const textLines = [
    `New Choice Tactical order`, ``,
    `Order: ${session.id}`,
    `Customer: ${customerName} <${customerEmail}>`, ``,
    `SHIP TO:`, `  ${customerName}`, `  ${shipping.line1 || ''}`
  ];
  if (shipping.line2) textLines.push(`  ${shipping.line2}`);
  textLines.push(
    `  ${shipping.city || ''}, ${shipping.state || ''} ${shipping.postal_code || ''}`,
    `  ${shipping.country || ''}`, ``, `ITEMS:`
  );
  itemRows.forEach(r => {
    textLines.push(`  ${r.qty}x ${r.name}${r.meta ? `  (${r.meta})` : ''} — $${r.total.toFixed(2)}`);
  });
  textLines.push(``,
    `Shipping${shippingRate && shippingRate.display_name ? ` (${shippingRate.display_name})` : ''}: $${shippingAmount}`,
    `Tax: $${taxAmount}`,
    `TOTAL: $${total}`
  );

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
    <div style="background:#FEF3C7;border-left:4px solid #F59E0B;padding:12px 16px;margin:0 0 24px;color:#92400E;border-radius:4px">
      <strong>⚠️ TEST EMAIL</strong> — pipeline check, not a real order.
    </div>
    <h1 style="margin:0 0 8px;color:#CBB589">🎯 New Order</h1>
    <p style="color:#666;margin:0 0 24px;font-size:14px">Choice Tactical &middot; ${esc(orderShortId)}</p>
    <h3 style="font-size:12px;letter-spacing:.1em;color:#888;margin:0 0 6px;text-transform:uppercase">Customer</h3>
    <p style="margin:0 0 4px"><strong>${esc(customerName)}</strong></p>
    <p style="margin:0 0 24px;color:#444">${esc(customerEmail)}</p>
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
      <tr><td style="padding:8px 0;color:#444">Shipping${shippingRate && shippingRate.display_name ? ` <span style="color:#888;font-size:13px">(${esc(shippingRate.display_name)})</span>` : ''}</td><td style="padding:8px 0;text-align:right;color:#444">$${shippingAmount}</td></tr>
      <tr><td style="padding:8px 0;color:#444">Tax</td><td style="padding:8px 0;text-align:right;color:#444">$${taxAmount}</td></tr>
      <tr><td style="padding:14px 0 0;font-weight:700;font-size:18px;border-top:2px solid #000">Total</td><td style="padding:14px 0 0;text-align:right;font-weight:700;font-size:18px;border-top:2px solid #000">$${total}</td></tr>
    </table>
  </div>
</body></html>`;

  return { html, text: textLines.join('\n'), subject };
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
