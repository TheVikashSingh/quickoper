import { describe, expect, it } from 'vitest';
import {
  MAX_DEBTS,
  defaults,
  encodeDebts,
  encodeParams,
  parseDebts,
  parseEnum,
  parseNumber,
  parseParams,
  type ParamSpec,
} from '../../src/lib/params';

/**
 * URL parameters are attacker-controlled input (CLAUDE.md rule 11).
 *
 * The failure mode these guard against is not a crash. It is a calculator that
 * silently computes a plausible-looking WRONG answer from malformed input —
 * `Number('')` is 0, `Number('0x10')` is 16 — and then hands the user a
 * confident, shareable, incorrect result.
 *
 * These tests moved here from schema.test.ts when the parsing was rewritten
 * without Zod; see lib/params.ts for why.
 */

const SPEC = {
  b: { min: 1, max: 10_000_000, fallback: 250_000 },
  r: { min: 0, max: 25, fallback: 5.5 },
  y: { min: 1, max: 50, fallback: 25 },
} as const satisfies ParamSpec;

const DEFAULTS = { b: 250_000, r: 5.5, y: 25 };

describe('parseNumber', () => {
  const rate = { min: 0, max: 25, fallback: 5 };

  it('accepts integers and decimals within range', () => {
    expect(parseNumber('5', rate)).toBe(5);
    expect(parseNumber('5.25', rate)).toBe(5.25);
    expect(parseNumber('0', rate)).toBe(0);
    expect(parseNumber('25', rate)).toBe(25);
  });

  it('rejects the empty string rather than coercing it to zero', () => {
    // Number('') === 0. That is the bug this exists to prevent.
    expect(parseNumber('', rate)).toBeNull();
    expect(parseNumber(null, rate)).toBeNull();
  });

  it('rejects values outside the declared range instead of clamping', () => {
    // Clamping would silently answer a different question from the one asked.
    expect(parseNumber('-1', rate)).toBeNull();
    expect(parseNumber('25.01', rate)).toBeNull();
  });

  it('rejects every numeric form Number() would silently accept', () => {
    for (const bad of [
      'abc',
      '5abc',
      'Infinity',
      'NaN',
      '1e5',
      '0x10',
      '5,000',
      '1_000',
    ]) {
      expect(parseNumber(bad, rate), bad).toBeNull();
    }
  });

  it('trims padding but still rejects an all-whitespace value', () => {
    expect(parseNumber('  12  ', rate)).toBe(12);
    expect(parseNumber('   ', rate)).toBeNull();
  });
});

describe('parseParams', () => {
  it('restores a shared scenario', () => {
    expect(parseParams(SPEC, '?b=350000&r=5.2&y=30')).toEqual({
      b: 350_000,
      r: 5.2,
      y: 30,
    });
  });

  it('returns the defaults for a bare URL', () => {
    expect(parseParams(SPEC, '')).toEqual(DEFAULTS);
    expect(parseParams(SPEC, '?')).toEqual(DEFAULTS);
    expect(defaults(SPEC)).toEqual(DEFAULTS);
  });

  it('falls back WHOLESALE when any single parameter is invalid', () => {
    // Not per-field. A partially-applied state computes a confident answer from
    // half the user's inputs and half our defaults.
    const result = parseParams(SPEC, '?b=350000&r=notanumber&y=30');
    expect(result).toEqual(DEFAULTS);
    expect(result.b).not.toBe(350_000);
  });

  it('falls back when a parameter is missing rather than filling it in', () => {
    expect(parseParams(SPEC, '?b=350000')).toEqual(DEFAULTS);
  });

  it('ignores unknown parameters while honouring the valid ones', () => {
    // Deliberate: a link shared through anything that appends tracking
    // parameters must still restore the scenario.
    expect(parseParams(SPEC, '?utm_source=reddit&b=350000&r=5.2&y=30')).toEqual({
      b: 350_000,
      r: 5.2,
      y: 30,
    });
  });

  it('never throws on hostile input, and never reflects it', () => {
    const hostile = [
      '?b=<script>alert(1)</script>&r=5&y=25',
      '?b=%00&r=%00&y=%00',
      '?b=1e309&r=5&y=25',
      `?b=${'9'.repeat(500)}&r=5&y=25`,
      '?b=__proto__&r=5&y=25',
    ];
    for (const search of hostile) {
      expect(() => parseParams(SPEC, search), search).not.toThrow();
      expect(parseParams(SPEC, search), search).toEqual(DEFAULTS);
    }
  });

  it('takes the first value when a parameter is repeated', () => {
    // Standard URLSearchParams semantics, and safe here: every candidate is
    // range-checked regardless of which one wins, and there is no server whose
    // parser could disagree with the browser's. Asserted so the behaviour is a
    // decision on record rather than an accident of the platform.
    expect(parseParams(SPEC, '?b=1&b=2&r=5&y=25&r=99')).toEqual({ b: 1, r: 5, y: 25 });
    // A repeated parameter whose FIRST value is invalid still falls back.
    expect(parseParams(SPEC, '?b=abc&b=2&r=5&y=25')).toEqual(DEFAULTS);
  });

  it('does not allow prototype pollution through a crafted parameter name', () => {
    // The consequence would be silent and global, so it is asserted rather than
    // assumed safe.
    parseParams(SPEC, '?__proto__[polluted]=1&b=350000&r=5.2&y=30');
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty('polluted');
  });
});

describe('parseEnum', () => {
  const views = ['avalanche', 'snowball'] as const;

  it('accepts a known value and rejects anything else', () => {
    expect(parseEnum('snowball', views, 'avalanche')).toBe('snowball');
    expect(parseEnum('mortgage', views, 'avalanche')).toBe('avalanche');
    expect(parseEnum(null, views, 'avalanche')).toBe('avalanche');
    expect(parseEnum('', views, 'avalanche')).toBe('avalanche');
  });

  it('is not fooled by prototype properties', () => {
    // `includes` on a real array, not an `in` check — 'toString' must not pass.
    expect(parseEnum('toString', views, 'avalanche')).toBe('avalanche');
    expect(parseEnum('constructor', views, 'avalanche')).toBe('avalanche');
  });
});

describe('debt list encoding', () => {
  const debts = [
    { balance: 900, rate: 29.99, minimum: 30 },
    { balance: 6000, rate: 22.99, minimum: 150 },
  ];

  it('round-trips a scenario', () => {
    const encoded = encodeDebts(debts);
    expect(encoded).toBe('900-29.99-30,6000-22.99-150');
    expect(parseDebts(encoded)).toEqual(debts);
  });

  it('never encodes debt names', () => {
    // Deliberate privacy property: a URL pasted into a forum or a screenshot
    // reveals the figures and never who the money is owed to.
    const named = debts.map((d, i) => ({ ...d, name: `Barclaycard ${i}` }));
    const encoded = encodeDebts(named);
    expect(encoded).not.toContain('Barclaycard');
    expect(encoded).toBe('900-29.99-30,6000-22.99-150');
  });

  it('rejects a malformed list wholesale rather than partially recovering it', () => {
    // A half-recovered debt list computes a confident answer about debts the
    // user does not have.
    for (const bad of [
      '900-29.99',
      '900-29.99-30-extra',
      'abc-29.99-30',
      '900--30',
      '900-29.99-30,broken',
      '',
      '   ',
      '0-10-5',
      '900-999-30',
    ]) {
      expect(parseDebts(bad), bad).toBeNull();
    }
    expect(parseDebts(null)).toBeNull();
  });

  it('refuses a list longer than the cap', () => {
    // Bounds the work a crafted URL can make a browser do.
    const many = Array.from({ length: MAX_DEBTS + 1 }, () => ({
      balance: 100,
      rate: 10,
      minimum: 5,
    }));
    expect(parseDebts(encodeDebts(many.slice(0, MAX_DEBTS)))).toHaveLength(MAX_DEBTS);
    expect(parseDebts(many.map(() => '100-10-5').join(','))).toBeNull();
  });

  it('truncates rather than throwing when handed too many to encode', () => {
    const many = Array.from({ length: MAX_DEBTS + 5 }, () => ({
      balance: 100,
      rate: 10,
      minimum: 5,
    }));
    expect(parseDebts(encodeDebts(many))).toHaveLength(MAX_DEBTS);
  });
});

describe('encodeParams', () => {
  it('produces a compact, stable query string', () => {
    expect(encodeParams({ b: 2_500_000, r: 5.5, y: 25 })).toBe('b=2500000&r=5.5&y=25');
  });

  it('survives a round trip', () => {
    const state = { b: 412_345, r: 6.75, y: 17 };
    expect(parseParams(SPEC, `?${encodeParams(state)}`)).toEqual(state);
  });
});
