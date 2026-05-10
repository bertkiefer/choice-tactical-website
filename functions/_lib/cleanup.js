// functions/_lib/cleanup.js
const PENDING_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export async function cleanupOldPending(env) {
  const cutoff = Math.floor(Date.now() / 1000) - PENDING_TTL_SECONDS;

  // Find expired pending rows so we can delete their R2 photos
  const { results } = await env.DB
    .prepare("SELECT id, photo_keys FROM customer_pictures WHERE status = 'pending' AND submitted_at < ?")
    .bind(cutoff)
    .all();

  if (!results || results.length === 0) return { deleted: 0 };

  for (const row of results) {
    let keys;
    try {
      keys = JSON.parse(row.photo_keys);
    } catch {
      keys = [];
    }
    for (const key of keys) {
      try { await env.CUSTOMER_PICTURES.delete(key); } catch {}
    }
  }

  await env.DB
    .prepare("DELETE FROM customer_pictures WHERE status = 'pending' AND submitted_at < ?")
    .bind(cutoff)
    .run();

  return { deleted: results.length };
}
