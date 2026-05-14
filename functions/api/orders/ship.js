// functions/api/orders/ship.js
// POST /api/orders/ship  body: { order_id, carrier, tracking_number }
// Header: x-admin-key: <ADMIN_KEY>  (or ?key=<...> on the URL)
// Updates the D1 row, then sends the customer the shipping email.
import { verifyAdminKey } from '../../_lib/admin-auth.js';
import { buildOrderShippedEmail } from '../../_lib/email-order-shipped.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!verifyAdminKey(request, env)) {
    return new Response('Forbidden', { status: 403 });
  }
  if (!env.DB) {
    return new Response('DB not bound', { status: 500 });
  }
  if (!env.RESEND_API_KEY) {
    return new Response('Email not configured', { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const orderId = String(body.order_id || '').trim();
  const carrier = String(body.carrier || '').trim();
  const trackingNumber = String(body.tracking_number || '').trim();

  if (!orderId || !carrier || !trackingNumber) {
    return new Response('Missing order_id, carrier, or tracking_number', { status: 400 });
  }
  if (!['USPS', 'UPS'].includes(carrier.toUpperCase())) {
    return new Response('Unsupported carrier (USPS or UPS only)', { status: 400 });
  }

  // Update the row only if it's still pending (idempotent — don't re-send if already shipped)
  const now = Date.now();
  const upd = await env.DB.prepare(
    `UPDATE orders
     SET status = 'shipped', carrier = ?, tracking_number = ?, shipped_at = ?
     WHERE id = ? AND status = 'pending'`
  ).bind(carrier.toUpperCase(), trackingNumber, now, orderId).run();

  const changed = (upd && upd.meta && upd.meta.changes) === 1;
  if (!changed) {
    // Either order doesn't exist or it's already shipped/cancelled
    const existing = await env.DB.prepare(
      `SELECT status FROM orders WHERE id = ?`
    ).bind(orderId).first();
    if (!existing) {
      return new Response('Order not found', { status: 404 });
    }
    return new Response(`Order is ${existing.status}, not pending`, { status: 409 });
  }

  // Fetch the updated row to build the email
  const row = await env.DB.prepare(
    `SELECT id, short_id, customer_email, customer_name,
            line_items_json, shipping_address_json,
            carrier, tracking_number
     FROM orders WHERE id = ?`
  ).bind(orderId).first();

  const order = {
    ...row,
    line_items: safeJson(row.line_items_json, []),
    shipping_address: safeJson(row.shipping_address_json, {}),
  };

  // Build + send the shipping email
  const fromAddr = env.CUSTOMER_EMAIL_FROM || 'Choice Tactical <orders@choice-tactical.com>';
  const replyTo  = env.REPLY_TO_EMAIL      || 'orders@choice-tactical.com';
  const { subject, html, text } = buildOrderShippedEmail(order);

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromAddr,
      to: [order.customer_email],
      reply_to: replyTo,
      subject, html, text,
    }),
  });
  if (!r.ok) {
    const errText = await r.text();
    console.error('Resend shipping send failed', r.status, errText);
    return new Response('Email send failed', { status: 502 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'content-type': 'application/json' },
  });
}

function safeJson(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}
