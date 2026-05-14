// functions/_lib/tracking-urls.js
// Build a clickable tracking URL given a carrier name and tracking number.
// Returns '' if either is missing. Unknown carriers fall back to a Google search.

export function trackingUrl(carrier, number) {
  if (!carrier || !number) return '';
  const carrierStr = String(carrier).trim();
  const c = carrierStr.toUpperCase();
  const n = String(number).trim();
  if (!n) return '';

  switch (c) {
    case 'USPS':
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(n)}`;
    case 'UPS':
      return `https://www.ups.com/track?tracknum=${encodeURIComponent(n)}`;
    default:
      return `https://www.google.com/search?q=${encodeURIComponent(carrierStr)}+tracking+${encodeURIComponent(n)}`;
  }
}
