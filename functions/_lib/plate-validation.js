// functions/_lib/plate-validation.js
// Pure helper: returns true iff `size` is an exact-match string member of `allowed`.
// Used server-side to validate a customer-supplied plate-size before Stripe checkout.

export function isValidPlateSize(size, allowed) {
  if (typeof size !== 'string' || !size.length) return false;
  if (!Array.isArray(allowed) || !allowed.length) return false;
  return allowed.includes(size);
}
