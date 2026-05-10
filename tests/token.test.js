import { describe, it, expect } from 'vitest';
import { signToken, verifyToken } from '../functions/_lib/token.js';

const SECRET = 'test-secret-key-for-hmac-do-not-use-in-prod';

describe('token', () => {
  it('round-trips a valid token', async () => {
    const token = await signToken({ id: 'abc', action: 'approve' }, SECRET, 3600);
    const result = await verifyToken(token, SECRET);
    expect(result.ok).toBe(true);
    expect(result.payload.id).toBe('abc');
    expect(result.payload.action).toBe('approve');
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signToken({ id: 'abc', action: 'approve' }, SECRET, 3600);
    const result = await verifyToken(token, 'wrong-secret');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid_signature');
  });

  it('rejects an expired token', async () => {
    const token = await signToken({ id: 'abc', action: 'approve' }, SECRET, -1);
    const result = await verifyToken(token, SECRET);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('expired');
  });

  it('rejects a tampered payload', async () => {
    const token = await signToken({ id: 'abc', action: 'approve' }, SECRET, 3600);
    const tampered = token.replace(/approve/g, 'reject');
    const result = await verifyToken(tampered, SECRET);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid_signature');
  });

  it('rejects a malformed token', async () => {
    const result = await verifyToken('not-a-real-token', SECRET);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('malformed');
  });
});
