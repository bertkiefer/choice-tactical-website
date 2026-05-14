import { describe, it, expect } from 'vitest';
import { verifyAdminKey } from '../functions/_lib/admin-auth.js';

function mkRequest({ url = 'https://example.com/admin', headers = {} } = {}) {
  return new Request(url, { headers });
}

describe('verifyAdminKey', () => {
  const env = { ADMIN_KEY: 'super-long-random-secret-32chars-xyz' };

  it('accepts a matching key via query string', () => {
    const req = mkRequest({ url: 'https://x.com/?key=super-long-random-secret-32chars-xyz' });
    expect(verifyAdminKey(req, env)).toBe(true);
  });

  it('accepts a matching key via x-admin-key header', () => {
    const req = mkRequest({ headers: { 'x-admin-key': 'super-long-random-secret-32chars-xyz' } });
    expect(verifyAdminKey(req, env)).toBe(true);
  });

  it('rejects a wrong key', () => {
    const req = mkRequest({ url: 'https://x.com/?key=wrong' });
    expect(verifyAdminKey(req, env)).toBe(false);
  });

  it('rejects when no key is provided', () => {
    const req = mkRequest();
    expect(verifyAdminKey(req, env)).toBe(false);
  });

  it('rejects when ADMIN_KEY env var is missing', () => {
    const req = mkRequest({ url: 'https://x.com/?key=anything' });
    expect(verifyAdminKey(req, {})).toBe(false);
  });

  it('rejects when ADMIN_KEY env var is empty', () => {
    const req = mkRequest({ url: 'https://x.com/?key=' });
    expect(verifyAdminKey(req, { ADMIN_KEY: '' })).toBe(false);
  });

  it('rejects keys of different length (does not leak length via short-circuit)', () => {
    const req = mkRequest({ url: 'https://x.com/?key=short' });
    expect(verifyAdminKey(req, env)).toBe(false);
  });
});
