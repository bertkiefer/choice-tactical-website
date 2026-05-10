// functions/_lib/turnstile.js
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstile(token, secret, ip) {
  if (!token || !secret) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set('remoteip', ip);
  try {
    const resp = await fetch(VERIFY_URL, {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    if (!resp.ok) return false;
    const data = await resp.json();
    return data.success === true;
  } catch {
    return false;
  }
}
