import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseParams, urlNumber } from '../../src/lib/schema';

/**
 * URL parameters are attacker-controlled input (CLAUDE.md rule 11).
 *
 * The failure mode these tests guard against is not a crash — it is a
 * calculator that silently computes a plausible-looking WRONG answer from
 * malformed input. `Number('')` is 0. `Number('  12  ')` is 12. Either would
 * produce a confident, wrong, shareable result.
 */

describe('urlNumber', () => {
  const rate = urlNumber(0, 25);

  it('accepts integers and decimals within range', () => {
    expect(rate.parse('5')).toBe(5);
    expect(rate.parse('5.25')).toBe(5.25);
    expect(rate.parse('0')).toBe(0);
    expect(rate.parse('25')).toBe(25);
  });

  it('rejects the empty string rather than coercing it to zero', () => {
    // Number('') === 0. That is the bug this exists to prevent.
    expect(rate.safeParse('').success).toBe(false);
  });

  it('rejects values outside the declared range', () => {
    expect(rate.safeParse('-1').success).toBe(false);
    expect(rate.safeParse('25.01').success).toBe(false);
  });

  it('rejects non-numeric and exotic numeric input', () => {
    for (const bad of ['abc', '5abc', 'Infinity', 'NaN', '1e5', '0x10', '5,000']) {
      expect(rate.safeParse(bad).success, `expected "${bad}" to be rejected`).toBe(false);
    }
  });

  it('trims surrounding whitespace but still rejects an all-whitespace value', () => {
    // Trimming a padded number is benign and user-friendly. What must never
    // happen is whitespace collapsing to a valid zero, so both are asserted.
    expect(rate.parse('  12  ')).toBe(12);
    expect(rate.safeParse('   ').success).toBe(false);
  });
});

describe('parseParams', () => {
  const schema = z.object({
    p: urlNumber(1, 10_000_000),
    r: urlNumber(0, 25),
  });
  const fallback = { p: 250_000, r: 5 };

  it('returns parsed values when every parameter is valid', () => {
    const params = new URLSearchParams('p=350000&r=5.2');
    expect(parseParams(schema, params, fallback)).toEqual({ p: 350_000, r: 5.2 });
  });

  it('falls back wholesale when any parameter is invalid', () => {
    const params = new URLSearchParams('p=350000&r=notanumber');
    expect(parseParams(schema, params, fallback)).toEqual(fallback);
  });

  it('falls back on missing parameters rather than producing a partial result', () => {
    expect(parseParams(schema, new URLSearchParams(''), fallback)).toEqual(fallback);
  });

  it('never throws, whatever it is given', () => {
    const hostile = new URLSearchParams('p=<script>alert(1)</script>&r=%00');
    expect(() => parseParams(schema, hostile, fallback)).not.toThrow();
    expect(parseParams(schema, hostile, fallback)).toEqual(fallback);
  });
});
