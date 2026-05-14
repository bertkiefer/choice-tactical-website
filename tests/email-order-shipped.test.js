import { describe, it, expect } from 'vitest';
import { buildOrderShippedEmail } from '../functions/_lib/email-order-shipped.js';

const shippedOrder = {
  id: 'cs_test_abc1234567890',
  short_id: '1234567890',
  customer_email: 'jane@example.com',
  customer_name: 'Jane Doe',
  amount_total: 12500,
  line_items: [
    { qty: 1, name: 'The AXIS Flag Alignment Tool', meta: 'plate_size: 18 mm', total_cents: 11750 }
  ],
  shipping_address: {
    line1: '123 Main St', line2: '', city: 'Austin',
    state: 'TX', postal_code: '78701', country: 'US'
  },
  carrier: 'USPS',
  tracking_number: '9400111899223197428490',
};

describe('buildOrderShippedEmail', () => {
  it('subject calls out shipment with order id', () => {
    const out = buildOrderShippedEmail(shippedOrder);
    expect(out.subject).toMatch(/shipped/i);
    expect(out.subject).toMatch(/1234567890/);
  });

  it('text body includes carrier and tracking number', () => {
    const out = buildOrderShippedEmail(shippedOrder);
    expect(out.text).toMatch(/USPS/);
    expect(out.text).toMatch(/9400111899223197428490/);
  });

  it('text body includes the USPS tracking URL', () => {
    const out = buildOrderShippedEmail(shippedOrder);
    expect(out.text).toMatch(/tools\.usps\.com/);
    expect(out.text).toMatch(/9400111899223197428490/);
  });

  it('html body has a clickable Track button linking to carrier site', () => {
    const out = buildOrderShippedEmail(shippedOrder);
    expect(out.html).toMatch(/Track your package/);
    expect(out.html).toMatch(/tools\.usps\.com/);
  });

  it('UPS carrier produces UPS URL', () => {
    const out = buildOrderShippedEmail({
      ...shippedOrder, carrier: 'UPS', tracking_number: '1Z999AA10123456784'
    });
    expect(out.html).toMatch(/ups\.com\/track/);
  });

  it('text body restates shipping address', () => {
    const out = buildOrderShippedEmail(shippedOrder);
    expect(out.text).toMatch(/123 Main St/);
    expect(out.text).toMatch(/Austin/);
  });

  it('html escapes carrier and tracking number', () => {
    const out = buildOrderShippedEmail({
      ...shippedOrder, carrier: 'Evil<x>', tracking_number: '<script>'
    });
    expect(out.html).not.toMatch(/<script>/);
    expect(out.html).toMatch(/&lt;script&gt;/);
  });
});
