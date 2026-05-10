// functions/api/customer-pictures/moderate.js
import { verifyToken } from '../../_lib/token.js';

function htmlPage(title, body, status = 200) {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${title} — Choice Tactical</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; background: #0e1116; color: #e4e4e4; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
  .card { max-width: 480px; padding: 32px; text-align: center; }
  h1 { color: #ffb84d; margin: 0 0 12px; }
  p { color: #ccc; margin: 8px 0; line-height: 1.5; }
  .ok { color: #4caf50; }
  .err { color: #f44336; }
</style></head><body><div class="card">${body}</div></body></html>`;
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return htmlPage('Missing token', `<h1>Missing token</h1><p>This link is invalid.</p>`, 400);
  }

  const result = await verifyToken(token, env.MODERATION_HMAC_SECRET);
  if (!result.ok) {
    const msg = result.reason === 'expired'
      ? 'This link has expired. Submissions stay pending; you can find this one in the database if needed.'
      : 'This link is invalid or has been tampered with.';
    return htmlPage('Link invalid', `<h1 class="err">Link ${result.reason}</h1><p>${msg}</p>`, 400);
  }

  const { id, action } = result.payload;
  if (!['approve', 'reject'].includes(action)) {
    return htmlPage('Bad action', `<h1 class="err">Unknown action</h1>`, 400);
  }

  const row = await env.DB
    .prepare('SELECT id, status, photo_keys FROM customer_pictures WHERE id = ?')
    .bind(id)
    .first();

  if (!row) {
    return htmlPage('Already moderated', `<h1>Already handled</h1><p>This submission was already approved or rejected.</p>`);
  }

  if (row.status === 'approved') {
    return htmlPage('Already approved', `<h1 class="ok">Already approved</h1><p>This picture is already live on the product page.</p>`);
  }

  if (action === 'approve') {
    await env.DB
      .prepare("UPDATE customer_pictures SET status = 'approved', moderated_at = ? WHERE id = ?")
      .bind(Math.floor(Date.now() / 1000), id)
      .run();
    return htmlPage('Approved', `<h1 class="ok">✓ Approved</h1><p>The picture is now live on the product page.</p>`);
  }

  // Reject: delete row + photos
  let keys = [];
  try { keys = JSON.parse(row.photo_keys); } catch {}
  for (const key of keys) {
    try { await env.CUSTOMER_PICTURES.delete(key); } catch {}
  }
  await env.DB.prepare('DELETE FROM customer_pictures WHERE id = ?').bind(id).run();

  return htmlPage('Rejected', `<h1 class="err">✗ Rejected</h1><p>The submission and its photos have been deleted.</p>`);
}
