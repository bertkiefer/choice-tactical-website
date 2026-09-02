// functions/api/logo-upload.js
// POST /api/logo-upload — accepts a customer's logo file for the "Full Custom"
// tier and stores it in R2. No file-type restriction (logos come as AI, EPS,
// PDF, PSD, SVG, PNG, etc.) — only a size cap, to keep storage/email sane.
// Returns { ok, key, filename }. The key rides through cart metadata into
// Stripe Checkout metadata (see create-checkout.js) and is pulled back out by
// the order webhook to attach to the merchant notification email.

const MAX_LOGO_BYTES = 20 * 1024 * 1024; // 20 MB

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function safeExt(filename) {
  const m = /\.([a-zA-Z0-9]{1,10})$/.exec(filename || '');
  return m ? m[1].toLowerCase() : 'bin';
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'Invalid form data' }, 400);
  }

  const file = form.get('logo');
  if (!file || typeof file !== 'object' || !('arrayBuffer' in file)) {
    return json({ error: 'No file provided' }, 400);
  }
  if (typeof file.size !== 'number' || file.size <= 0) {
    return json({ error: 'Empty file' }, 400);
  }
  if (file.size > MAX_LOGO_BYTES) {
    return json({ error: 'File too large (max 20MB)' }, 400);
  }

  const ext = safeExt(file.name);
  const uploadId = crypto.randomUUID();
  const key = `order-logos/${uploadId}.${ext}`;
  const filename = (file.name || key).slice(0, 200);

  await env.CUSTOMER_PICTURES.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || 'application/octet-stream' },
    customMetadata: { originalName: filename },
  });

  return json({ ok: true, key, filename });
}
