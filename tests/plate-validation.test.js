import { describe, it, expect } from 'vitest';
import { isValidPlateSize } from '../functions/_lib/plate-validation.js';

const ALLOWED = ['12', '12.5', '13', '20.5', '25', '25.4'];

describe('isValidPlateSize', () => {
  it('accepts a size in the allowlist', () => {
    expect(isValidPlateSize('20.5', ALLOWED)).toBe(true);
  });

  it('accepts the boundary sizes', () => {
    expect(isValidPlateSize('12', ALLOWED)).toBe(true);
    expect(isValidPlateSize('25.4', ALLOWED)).toBe(true);
  });

  it('rejects a size not in the allowlist', () => {
    expect(isValidPlateSize('7.5', ALLOWED)).toBe(false);
    expect(isValidPlateSize('26', ALLOWED)).toBe(false);
  });

  it('rejects empty / null / undefined', () => {
    expect(isValidPlateSize('', ALLOWED)).toBe(false);
    expect(isValidPlateSize(null, ALLOWED)).toBe(false);
    expect(isValidPlateSize(undefined, ALLOWED)).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(isValidPlateSize(20.5, ALLOWED)).toBe(false);
    expect(isValidPlateSize({}, ALLOWED)).toBe(false);
  });

  it('rejects when the allowlist is missing or empty', () => {
    expect(isValidPlateSize('20.5', [])).toBe(false);
    expect(isValidPlateSize('20.5', null)).toBe(false);
    expect(isValidPlateSize('20.5', undefined)).toBe(false);
  });

  it('is exact-match — no whitespace tolerance', () => {
    expect(isValidPlateSize(' 20.5', ALLOWED)).toBe(false);
    expect(isValidPlateSize('20.5 ', ALLOWED)).toBe(false);
  });
});
