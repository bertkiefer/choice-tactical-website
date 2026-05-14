// functions/_lib/email-order-confirmation.js
// Customer-facing order confirmation email (Choice Tactical branded).
// Order object must include: short_id, customer_email, customer_name,
//   amount_total, amount_shipping, amount_tax, currency, line_items[],
//   shipping_address{}, shipping_rate_name.

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function firstName(full) {
  if (!full) return 'there';
  return String(full).trim().split(/\s+/)[0];
}

function fmtCents(cents) {
  return (cents / 100).toFixed(2);
}

export function buildOrderConfirmationEmail(order) {
  const first = firstName(order.customer_name);
  const shipping = order.shipping_address || {};
  const items = order.line_items || [];

  const subject = `Choice Tactical order ${order.short_id} — thanks for your order, ${first}`;

  const textLines = [
    `Hi ${first},`,
    ``,
    `Thanks for your Choice Tactical order. Here's a summary:`,
    ``,
    `Order: ${order.short_id}`,
    ``,
    `ITEMS:`,
  ];
  items.forEach(it => {
    textLines.push(`  ${it.qty}x ${it.name}${it.meta ? `  (${it.meta})` : ''} — $${fmtCents(it.total_cents)}`);
  });
  textLines.push(
    ``,
    `Shipping${order.shipping_rate_name ? ` (${order.shipping_rate_name})` : ''}: $${fmtCents(order.amount_shipping)}`,
    `Tax: $${fmtCents(order.amount_tax)}`,
    `TOTAL: $${fmtCents(order.amount_total)}`,
    ``,
    `SHIPPING TO:`,
    `  ${order.customer_name}`,
    `  ${shipping.line1 || ''}`,
  );
  if (shipping.line2) textLines.push(`  ${shipping.line2}`);
  textLines.push(
    `  ${shipping.city || ''}, ${shipping.state || ''} ${shipping.postal_code || ''}`,
    `  ${shipping.country || ''}`,
    ``,
    `WHAT'S NEXT:`,
    `Ships in 2-3 business days after order payment. You'll get a separate email with tracking when it ships.`,
    ``,
    `Need to change something? Reply to this email and we'll take care of it.`,
    ``,
    `— Choice Tactical`,
  );

  const itemRowsHtml = items.map(it => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #eee">
        <strong>${it.qty}× ${esc(it.name)}</strong>
        ${it.meta ? `<br><span style="color:#666;font-size:13px">${esc(it.meta)}</span>` : ''}
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">
        $${fmtCents(it.total_cents)}
      </td>
    </tr>`).join('');

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f6f6f6;margin:0;padding:24px;color:#111">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,.06)">
    <h1 style="margin:0 0 8px;color:#CBB589">Thanks for your order, ${esc(first)}</h1>
    <p style="color:#666;margin:0 0 24px;font-size:14px">Choice Tactical &middot; Order ${esc(order.short_id)}</p>

    <h3 style="font-size:12px;letter-spacing:.1em;color:#888;margin:0 0 6px;text-transform:uppercase">Items</h3>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px">
      ${itemRowsHtml}
      <tr>
        <td style="padding:8px 0;color:#444">Shipping${order.shipping_rate_name ? ` <span style="color:#888;font-size:13px">(${esc(order.shipping_rate_name)})</span>` : ''}</td>
        <td style="padding:8px 0;text-align:right;color:#444">$${fmtCents(order.amount_shipping)}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#444">Tax</td>
        <td style="padding:8px 0;text-align:right;color:#444">$${fmtCents(order.amount_tax)}</td>
      </tr>
      <tr>
        <td style="padding:14px 0 0;font-weight:700;font-size:18px;border-top:2px solid #000">Total</td>
        <td style="padding:14px 0 0;text-align:right;font-weight:700;font-size:18px;border-top:2px solid #000">$${fmtCents(order.amount_total)}</td>
      </tr>
    </table>

    <h3 style="font-size:12px;letter-spacing:.1em;color:#888;margin:0 0 6px;text-transform:uppercase">Shipping to</h3>
    <p style="margin:0 0 24px;line-height:1.6">
      ${esc(order.customer_name)}<br>
      ${esc(shipping.line1 || '')}${shipping.line2 ? '<br>' + esc(shipping.line2) : ''}<br>
      ${esc(shipping.city || '')}, ${esc(shipping.state || '')} ${esc(shipping.postal_code || '')}<br>
      ${esc(shipping.country || '')}
    </p>

    <div style="background:#f4ede0;border-left:4px solid #CBB589;padding:14px 18px;border-radius:4px;margin:0 0 24px">
      <strong style="color:#12161A">What's next:</strong>
      <p style="margin:6px 0 0;color:#444;font-size:14px">Ships in 2-3 business days after order payment. You'll get a separate email with tracking when it ships.</p>
    </div>

    <p style="color:#666;font-size:14px;margin:24px 0 0">
      Need to change something? Reply to this email and we'll take care of it.
    </p>
    <p style="color:#888;font-size:13px;margin:8px 0 0">— Choice Tactical</p>
  </div>
</body></html>`;

  return { subject, html, text: textLines.join('\n') };
}
