import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifyTurnstile } from '../functions/_lib/turnstile.js';

describe('verifyTurnstile', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true on success response', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    const ok = await verifyTurnstile('test-token', 'test-secret', '1.2.3.4');
    expect(ok).toBe(true);
  });

  it('returns false on failure response', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] }),
    });
    const ok = await verifyTurnstile('test-token', 'test-secret', '1.2.3.4');
    expect(ok).toBe(false);
  });

  it('returns false on network failure', async () => {
    global.fetch.mockRejectedValue(new Error('network down'));
    const ok = await verifyTurnstile('test-token', 'test-secret', '1.2.3.4');
    expect(ok).toBe(false);
  });

  it('returns false on missing token', async () => {
    const ok = await verifyTurnstile('', 'test-secret', '1.2.3.4');
    expect(ok).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
