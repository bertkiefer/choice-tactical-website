// functions/api/customer-pictures/submit.js
import { validateImage } from '../../_lib/image-validation.js';
import { verifyTurnstile } from '../../_lib/turnstile.js';
import { signToken } from '../../_lib/token.js';
import { buildModerationEmail, sendModerationEmail } from '../../_lib/email.js';
import { cleanupOldPending } from '../../_lib/cleanup.js';

const ALLOWED_SLUGS = ['the-axis', 'the-stack'];
const PRODUCT_NAMES = { 'the-axis': 'The AXIS', 'the-stack': 'The Stack' };
const MAX_PHOTOS = 3;
const RATE_LIMIT_WINDOW_SECONDS = 3600;
const RATE_LIMIT_MAX = 3;
const TOKEN_EXPIRY_SECONDS = 24 * 60 * 60;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function hashIp(ip) {
  const data = new TextEncoder().encode(ip || 'unknown');
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function uuid() {
  return crypto.randomUUID();
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const ip = request.headers.get('cf-connecting-ip') || '';

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'Invalid form data' }, 400);
  }

  const productSlug = String(form.get('productSlug') || '').trim();
  const customerName = String(form.get('name') || '').trim();
  const customerEmail = String(form.get('email') || '').trim();
  const caption = String(form.get('caption') || '').trim();
  const turnstileToken = String(form.get('turnstileToken') || '');
  const photos = form.getAll('photo').filter(p => p && typeof p === 'object' && 'arrayBuffer' in p);

  // ── Field validation ─────────────────────────────
  if (!ALLOWED_SLUGS.includes(productSlug)) {
    return json({ error: 'Unknown product' }, 400);
  }
  if (customerName.length < 2 || customerName.length > 60) {
    return json({ error: 'Name must be 2–60 characters' }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail) || customerEmail.length > 120) {
    return json({ error: 'Invalid email address' }, 400);
  }
  if (caption.length < 1 || caption.length > 140) {
    return json({ error: 'Caption must be 1–140 characters' }, 400);
  }
  if (photos.length < 1 || photos.length > MAX_PHOTOS) {
    return json({ error: `Submit between 1 and ${MAX_PHOTOS} photos` }, 400);
  }

  // ── Turnstile ──────────────────────────────────────
  const turnstileOk = await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET_KEY, ip);
  if (!turnstileOk) {
    return json({ error: 'Bot check failed — please refresh and try again' }, 400);
  }

  // ── Rate limit ─────────────────────────────────────
  const ipHash = await hashIp(ip);
  const windowStart = Math.floor(Date.now() / 1000) - RATE_LIMIT_WINDOW_SECONDS;
  const { results: rlRows } = await env.DB
    .prepare("SELECT COUNT(*) AS n FROM customer_pictures WHERE ip_hash = ? AND submitted_at > ?")
    .bind(ipHash, windowStart)
    .all();
  if (rlRows[0].n >= RATE_LIMIT_MAX) {
    return json({ error: 'Too many submissions — please try again later' }, 429);
  }

  // ── Validate each photo ────────────────────────────
  const validatedPhotos = [];
  for (const photo of photos) {
    const result = await validateImage(photo);
    if (!result.ok) {
      return json({ error: `Photo rejected: ${result.reason}` }, 400);
    }
    validatedPhotos.push({ photo, ext: result.ext });
  }

  // ── Upload photos to R2 ────────────────────────────
  const submissionId = uuid();
  const photoKeys = [];
  for (let i = 0; i < validatedPhotos.length; i++) {
    const { photo, ext } = validatedPhotos[i];
    const key = `${submissionId}/${i}.${ext}`;
    await env.CUSTOMER_PICTURES.put(key, photo.stream(), {
      httpMetadata: { contentType: photo.type },
    });
    photoKeys.push(key);
  }

  // ── Insert D1 row ──────────────────────────────────
  const now = Math.floor(Date.now() / 1000);
  await env.DB
    .prepare(`INSERT INTO customer_pictures
      (id, product_slug, customer_name, customer_email, caption, photo_keys, status, submitted_at, ip_hash)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`)
    .bind(submissionId, productSlug, customerName, customerEmail, caption, JSON.stringify(photoKeys), now, ipHash)
    .run();

  // ── Send moderation email ──────────────────────────
  const origin = new URL(request.url).origin;
  const approveToken = await signToken({ id: submissionId, action: 'approve' }, env.MODERATION_HMAC_SECRET, TOKEN_EXPIRY_SECONDS);
  const rejectToken = await signToken({ id: submissionId, action: 'reject' }, env.MODERATION_HMAC_SECRET, TOKEN_EXPIRY_SECONDS);
  const photoUrls = photoKeys.map(key => `${env.R2_PUBLIC_BASE_URL}/${key}`);

  const { subject, html } = buildModerationEmail({
    productName: PRODUCT_NAMES[productSlug],
    customerName,
    customerEmail,
    caption,
    photoUrls,
    approveUrl: `${origin}/api/customer-pictures/moderate?token=${encodeURIComponent(approveToken)}`,
    rejectUrl: `${origin}/api/customer-pictures/moderate?token=${encodeURIComponent(rejectToken)}`,
  });

  try {
    await sendModerationEmail({
      apiKey: env.RESEND_API_KEY,
      from: env.ORDER_EMAIL_FROM,
      to: env.MODERATION_EMAIL_TO,
      subject,
      html,
    });
  } catch (err) {
    // Email failure shouldn't lose the submission — log but still return success.
    console.error('Resend send failed:', err);
  }

  // ── Opportunistic cleanup (best-effort) ────────────
  try { await cleanupOldPending(env); } catch (err) { console.error('cleanup failed:', err); }

  return json({ ok: true, message: 'Submitted for review' });
}
