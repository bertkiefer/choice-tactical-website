const ALLOWED_SLUGS = ['the-axis', 'the-stack'];

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=300, s-maxage=300',
      ...extraHeaders,
    },
  });
}

export async function onRequestGet(context) {
  const { params, env } = context;
  const slug = String(params.slug || '');

  if (!ALLOWED_SLUGS.includes(slug)) {
    return json({ error: 'Unknown product' }, 404);
  }

  const { results } = await env.DB
    .prepare(`SELECT id, customer_name, caption, photo_keys, submitted_at
              FROM customer_pictures
              WHERE product_slug = ? AND status = 'approved'
              ORDER BY moderated_at DESC`)
    .bind(slug)
    .all();

  const items = (results || []).map(row => {
    let keys = [];
    try { keys = JSON.parse(row.photo_keys); } catch {}
    return {
      id: row.id,
      name: row.customer_name,
      caption: row.caption,
      photoUrls: keys.map(k => `${env.R2_PUBLIC_BASE_URL}/${k}`),
      submittedAt: row.submitted_at,
    };
  });

  return json({ items, count: items.length });
}
