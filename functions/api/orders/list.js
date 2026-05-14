// functions/api/orders/list.js
// GET /api/orders/list?status=pending&limit=50&key=<ADMIN_KEY>
// Returns recent orders for the admin UI. Token-gated.
import { verifyAdminKey } from '../../_lib/admin-auth.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!verifyAdminKey(request, env)) {
    return new Response('Forbidden', { status: 403 });
  }
  if (!env.DB) {
    return new Response('DB not bound', { status: 500 });
  }

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get('status'); // pending | shipped | null
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 200);

  let sql = `SELECT id, short_id, customer_email, customer_name,
                    amount_total, currency, status, carrier, tracking_number,
                    paid_at, shipped_at, line_items_json, shipping_address_json,
                    shipping_rate_name
             FROM orders`;
  const params = [];
  if (statusFilter) {
    sql += ` WHERE status = ?`;
    params.push(statusFilter);
  }
  sql += ` ORDER BY paid_at DESC LIMIT ?`;
  params.push(limit);

  const stmt = env.DB.prepare(sql).bind(...params);
  const { results } = await stmt.all();

  // Decode JSON columns so the client doesn't have to.
  const orders = (results || []).map(r => ({
    ...r,
    line_items: safeJson(r.line_items_json, []),
    shipping_address: safeJson(r.shipping_address_json, {}),
  }));

  return new Response(JSON.stringify({ orders }), {
    headers: { 'content-type': 'application/json' },
  });
}

function safeJson(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}
