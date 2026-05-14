// functions/_lib/admin-auth.js
// Constant-time comparison of an admin key supplied via ?key=<value>
// or the x-admin-key header against the ADMIN_KEY env secret.

function constantTimeEq(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function verifyAdminKey(request, env) {
  const expected = env && env.ADMIN_KEY;
  if (!expected) return false;

  const url = new URL(request.url);
  const queryKey = url.searchParams.get('key') || '';
  const headerKey = request.headers.get('x-admin-key') || '';
  const supplied = queryKey || headerKey;
  if (!supplied) return false;

  return constantTimeEq(supplied, expected);
}
