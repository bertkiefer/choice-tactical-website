import { describe, it, expect } from 'vitest';
import { buildOrderConfirmationEmail } from '../functions/_lib/email-order-confirmation.js';

const sampleOrder = {
  id: 'cs_test_abc1234567890',
  short_id: '1234567890',
  customer_email: 'jane@example.com',
  customer_name: 'Jane Doe',
  amount_total: 12500,
  amount_shipping: 750,
  amount_tax: 0,
  currency: 'usd',
  line_items: [
    { qty: 1, name: 'The AXIS Flag Alignment Tool', meta: 'plate_size: 18 mm', total_cents: 11750 }
  ],
  shipping_address: {
    line1: '123 Main St', line2: '', city: 'Austin',
    state: 'TX', postal_code: '78701', country: 'US'
  },
  shipping_rate_name: 'USPS Priority',
};

describe('buildOrderConfirmationEmail', () => {
  it('returns subject, html, and text strings', () => {
    const out = buildOrderConfirmationEmail(sampleOrder);
    expect(typeof out.subject).toBe('string');
    expect(typeof out.html).toBe('string');
    expect(typeof out.text).toBe('string');
  });

  it('subject includes the short order id', () => {
    const out = buildOrderConfirmationEmail(sampleOrder);
    expect(out.subject).toMatch(/1234567890/);
  });

  it('text body includes customer first name', () => {
    const out = buildOrderConfirmationEmail(sampleOrder);
    expect(out.text).toMatch(/Jane/);
  });

  it('text body includes the 2-3 business days expectation line', () => {
    const out = buildOrderConfirmationEmail(sampleOrder);
    expect(out.text).toMatch(/2.{0,3}3 business days/);
    expect(out.text).toMatch(/after order payment/);
  });

  it('text body includes the shipping address', () => {
    const out = buildOrderConfirmationEmail(sampleOrder);
    expect(out.text).toMatch(/123 Main St/);
    expect(out.text).toMatch(/Austin/);
    expect(out.text).toMatch(/TX/);
    expect(out.text).toMatch(/78701/);
  });

  it('text body includes the reply-to-change line', () => {
    const out = buildOrderConfirmationEmail(sampleOrder);
    expect(out.text).toMatch(/reply to this email/i);
  });

  it('html body includes item name and formatted total', () => {
    const out = buildOrderConfirmationEmail(sampleOrder);
    expect(out.html).toMatch(/AXIS Flag Alignment Tool/);
    expect(out.html).toMatch(/\$125\.00/);
  });

  it('html escapes user-supplied content', () => {
    const out = buildOrderConfirmationEmail({
      ...sampleOrder,
      customer_name: 'Jane <script>alert(1)</script> Doe',
    });
    expect(out.html).not.toMatch(/<script>/);
    expect(out.html).toMatch(/&lt;script&gt;/);
  });

  it('handles single-name customers without crashing', () => {
    const out = buildOrderConfirmationEmail({ ...sampleOrder, customer_name: 'Jane' });
    expect(out.text).toMatch(/Jane/);
  });
});
