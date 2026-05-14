import { describe, it, expect } from 'vitest';
import { trackingUrl } from '../functions/_lib/tracking-urls.js';

describe('trackingUrl', () => {
  it('builds USPS tracking URL', () => {
    expect(trackingUrl('USPS', '9400111899223197428490'))
      .toBe('https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223197428490');
  });

  it('builds UPS tracking URL', () => {
    expect(trackingUrl('UPS', '1Z999AA10123456784'))
      .toBe('https://www.ups.com/track?tracknum=1Z999AA10123456784');
  });

  it('falls back to a Google search URL for unknown carriers', () => {
    expect(trackingUrl('FedEx', '123456789012'))
      .toBe('https://www.google.com/search?q=FedEx+tracking+123456789012');
  });

  it('case-insensitive carrier match', () => {
    expect(trackingUrl('usps', '9400111'))
      .toBe('https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111');
    expect(trackingUrl('Ups', '1Z999'))
      .toBe('https://www.ups.com/track?tracknum=1Z999');
  });

  it('URL-encodes the tracking number', () => {
    expect(trackingUrl('UNKNOWN', 'AB 123/456'))
      .toBe('https://www.google.com/search?q=UNKNOWN+tracking+AB%20123%2F456');
  });

  it('returns empty string when carrier or number is missing', () => {
    expect(trackingUrl('', '12345')).toBe('');
    expect(trackingUrl('USPS', '')).toBe('');
    expect(trackingUrl(null, null)).toBe('');
  });
});
