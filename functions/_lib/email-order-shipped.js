// functions/_lib/email-order-shipped.js
// Customer-facing shipping notification email.
import { trackingUrl } from './tracking-urls.js';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function firstName(full) {
  if (!full) return 'there';
  return String(full).trim().split(/\s+/)[0];
}

export function buildOrderShippedEmail(order) {
  const first = firstName(order.customer_name);
  const shipping = order.shipping_address || {};
  const items = order.line_items || [];
  const trackUrl = trackingUrl(order.carrier, order.tracking_number);

  const subject = `Choice Tactical order ${order.short_id} has shipped`;

  const textLines = [
    `Hi ${first},`,
    ``,
    `Good news — your Choice Tactical order ${order.short_id} is on the way.`,
    ``,
    `Carrier: ${order.carrier}`,
    `Tracking #: ${order.tracking_number}`,
    `Track it: ${trackUrl}`,
    ``,
    `SHIPPING TO:`,
    `  ${order.customer_name}`,
    `  ${shipping.line1 || ''}`,
  ];
  if (shipping.line2) textLines.push(`  ${shipping.line2}`);
  textLines.push(
    `  ${shipping.city || ''}, ${shipping.state || ''} ${shipping.postal_code || ''}`,
    `  ${shipping.country || ''}`,
    ``,
    `ITEMS SHIPPED:`,
  );
  items.forEach(it => {
    textLines.push(`  ${it.qty}x ${it.name}${it.meta ? `  (${it.meta})` : ''}`);
  });
  textLines.push(
    ``,
    `Questions? Reply to this email.`,
    ``,
    `— Choice Tactical`,
  );

  const itemRowsHtml = items.map(it => `
    <tr><td style="padding:6px 0;color:#444">
      ${it.qty}× ${esc(it.name)}${it.meta ? `<span style="color:#888;font-size:13px"> — ${esc(it.meta)}</span>` : ''}
    </td></tr>`).join('');

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f6f6f6;margin:0;padding:24px;color:#111">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,.06)">
    <h1 style="margin:0 0 8px;color:#CBB589">Your order has shipped</h1>
    <p style="color:#666;margin:0 0 24px;font-size:14px">Choice Tactical &middot; Order ${esc(order.short_id)}</p>

    <p style="margin:0 0 16px">Hi ${esc(first)}, good news — your order is on the way.</p>

    <h3 style="font-size:12px;letter-spacing:.1em;color:#888;margin:0 0 6px;text-transform:uppercase">Tracking</h3>
    <p style="margin:0 0 6px"><strong>${esc(order.carrier)}</strong></p>
    <p style="margin:0 0 18px;font-family:monospace;font-size:14px">${esc(order.tracking_number)}</p>
    <p style="margin:0 0 28px">
      <a href="${esc(trackUrl)}"
         style="display:inline-block;padding:12px 22px;background:#12161A;color:#CBB589;text-decoration:none;border-radius:8px;font-weight:600">
        Track your package →
      </a>
    </p>

    <h3 style="font-size:12px;letter-spacing:.1em;color:#888;margin:0 0 6px;text-transform:uppercase">Shipping to</h3>
    <p style="margin:0 0 24px;line-height:1.6">
      ${esc(order.customer_name)}<br>
      ${esc(shipping.line1 || '')}${shipping.line2 ? '<br>' + esc(shipping.line2) : ''}<br>
      ${esc(shipping.city || '')}, ${esc(shipping.state || '')} ${esc(shipping.postal_code || '')}<br>
      ${esc(shipping.country || '')}
    </p>

    <h3 style="font-size:12px;letter-spacing:.1em;color:#888;margin:0 0 6px;text-transform:uppercase">Items shipped</h3>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px">${itemRowsHtml}</table>

    <p style="color:#666;font-size:14px;margin:24px 0 0">Questions? Reply to this email.</p>
    <p style="color:#888;font-size:13px;margin:8px 0 0">— Choice Tactical</p>
  </div>
</body></html>`;

  return { subject, html, text: textLines.join('\n') };
}
