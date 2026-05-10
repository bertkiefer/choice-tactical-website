// functions/_lib/email.js
const RESEND_API = 'https://api.resend.com/emails';

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function buildModerationEmail({
  productName,
  customerName,
  customerEmail,
  caption,
  photoUrls,
  approveUrl,
  rejectUrl,
}) {
  const photoTags = photoUrls.map(url =>
    `<img src="${escapeHtml(url)}" alt="" style="width:160px;height:160px;object-fit:cover;border-radius:6px;margin-right:8px;border:1px solid #ddd">`
  ).join('');

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#222">
  <h2 style="margin:0 0 16px">New Customer Picture — ${escapeHtml(productName)}</h2>
  <p style="margin:0 0 4px"><strong>From:</strong> ${escapeHtml(customerName)} &lt;${escapeHtml(customerEmail)}&gt;</p>
  <p style="margin:0 0 16px"><strong>Caption:</strong> ${escapeHtml(caption)}</p>
  <div style="display:flex;flex-wrap:wrap;margin-bottom:24px">${photoTags}</div>
  <table cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="padding-right:8px"><a href="${escapeHtml(approveUrl)}" style="display:inline-block;background:#2e7d32;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">✓ APPROVE</a></td>
    <td><a href="${escapeHtml(rejectUrl)}" style="display:inline-block;background:#c62828;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">✗ REJECT</a></td>
  </tr></table>
  <p style="margin-top:24px;font-size:12px;color:#888">Links expire in 24 hours.</p>
</body></html>`;

  const subject = `New Customer Picture — ${productName}`;
  return { subject, html };
}

export async function sendModerationEmail({ apiKey, from, to, subject, html }) {
  const resp = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Resend send failed: ${resp.status} ${text}`);
  }
  return resp.json();
}
