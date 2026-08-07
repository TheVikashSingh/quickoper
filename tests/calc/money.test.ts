import { describe, expect, it } from 'vitest';
import {
  ZERO,
  absolute,
  add,
  allocate,
  clampAtZero,
  compare,
  divide,
  format,
  formatPlain,
  fromMajor,
  minor,
  MoneyError,
  negate,
  roundToInteger,
  scale,
  split,
  subtract,
  sum,
  toMajor,
} from '../../src/lib/calc/money';

/**
 * Fixtures for the money layer.
 *
 * Sources cited per CLAUDE.md rule 1:
 *   - IEEE 754-2019 §4.3 for roundTiesToAway ('half-up') and roundTiesToEven.
 *   - Martin Fowler, *Patterns of Enterprise Application Architecture*, the
 *     Money pattern, for the allocation algorithm and its worked example
 *     (allocating 100 across 3 parts yields 34/33/33).
 *   - The `1.005` case is the canonical JavaScript currency-rounding defect;
 *     `1.005 * 100 === 100.49999999999999` is directly observable and is
 *     asserted below rather than taken on trust.
 */

describe('roundToInteger — the float-tolerance boundary', () => {
  it('confirms the underlying float defect this module exists to absorb', () => {
    // Not a test of our code. This documents the hazard, so that if a future
    // engine change removes it, the reason for the tolerance is still legible.
    expect(1.005 * 100).toBe(100.49999999999999);
    expect(0.1 + 0.2).toBe(0.30000000000000004);
  });

  it('rounds a value that is mathematically one half but computes just below it', () => {
    // Naive Math.round(100.49999999999999) is 100. Correct half-up is 101.
    expect(roundToInteger(1.005 * 100, 'half-up')).toBe(101);
  });

  it('does not drag a genuinely-below-half value upward', () => {
    expect(roundToInteger(1.004 * 100, 'half-up')).toBe(100);
    expect(roundToInteger(100.4999, 'half-up')).toBe(100);
    expect(roundToInteger(100.49, 'half-up')).toBe(100);
  });
});

describe('roundToInteger — modes', () => {
  it('half-up rounds ties away from zero, in both directions', () => {
    expect(roundToInteger(2.5, 'half-up')).toBe(3);
    expect(roundToInteger(3.5, 'half-up')).toBe(4);
    // Math.round(-2.5) is -2 in JavaScript. Away from zero is -3.
    expect(roundToInteger(-2.5, 'half-up')).toBe(-3);
    expect(roundToInteger(-3.5, 'half-up')).toBe(-4);
  });

  it('half-even rounds ties to the nearest even integer (IEEE 754)', () => {
    expect(roundToInteger(2.5, 'half-even')).toBe(2);
    expect(roundToInteger(3.5, 'half-even')).toBe(4);
    expect(roundToInteger(4.5, 'half-even')).toBe(4);
    expect(roundToInteger(-2.5, 'half-even')).toBe(-2);
    expect(roundToInteger(-3.5, 'half-even')).toBe(-4);
  });

  it('down truncates toward zero and up moves away from it', () => {
    expect(roundToInteger(2.9, 'down')).toBe(2);
    expect(roundToInteger(-2.9, 'down')).toBe(-2);
    expect(roundToInteger(2.1, 'up')).toBe(3);
    expect(roundToInteger(-2.1, 'up')).toBe(-3);
  });

  it('leaves whole numbers alone under every mode', () => {
    for (const mode of ['half-up', 'half-even', 'down', 'up'] as const) {
      expect(roundToInteger(7, mode)).toBe(7);
      expect(roundToInteger(-7, mode)).toBe(-7);
      expect(roundToInteger(0, mode)).toBe(0);
    }
  });

  it('never returns negative zero', () => {
    // -0 breaks Object.is comparisons and prints as "-0.00" in some locales.
    expect(Object.is(roundToInteger(-0.2, 'down'), 0)).toBe(true);
    expect(Object.is(roundToInteger(-0.4, 'half-up'), 0)).toBe(true);
  });

  it('rejects non-finite input rather than producing NaN downstream', () => {
    expect(() => roundToInteger(Number.NaN)).toThrow(MoneyError);
    expect(() => roundToInteger(Number.POSITIVE_INFINITY)).toThrow(MoneyError);
  });
});

describe('the Minor brand', () => {
  it('rejects a raw number where money is expected, at compile time', () => {
    const balance = fromMajor(100);

    // These are checked by `tsc --noEmit` in CI, not at runtime. If the brand
    // ever stops working, the @ts-expect-error directives become unused and the
    // typecheck gate fails — so this cannot rot silently.

    // @ts-expect-error a bare number is not Minor: is 5 cents, or five dollars?
    add(balance, 5);

    // @ts-expect-error arithmetic must go through the module, not the operator
    const naive: import('../../src/lib/calc/money').Minor = balance + 5;
    void naive;

    expect(add(balance, minor(5))).toBe(10_005);
  });
});

describe('construction', () => {
  it('rejects a non-integer count of minor units', () => {
    // The whole point of the branded type: 10.5 cents is not a thing.
    expect(() => minor(10.5)).toThrow(MoneyError);
  });

  it('converts major units, rounding per the stated policy', () => {
    expect(fromMajor(1234.56)).toBe(123456);
    expect(fromMajor(0.005)).toBe(1); // half-up
    expect(fromMajor(0.005, 100, 'half-even')).toBe(0); // ties to even
    expect(fromMajor(-1234.56)).toBe(-123456);
  });

  it('handles the 1.005 case that defeats naive conversion', () => {
    expect(fromMajor(1.005)).toBe(101);
  });

  it('supports non-decimal-2 currencies via the scale parameter', () => {
    expect(fromMajor(1234, 1)).toBe(1234); // JPY-style, no minor unit
    expect(fromMajor(1.234, 1000)).toBe(1234); // 3-decimal currencies
  });

  it('round-trips through toMajor for display', () => {
    expect(toMajor(fromMajor(1234.56))).toBe(1234.56);
  });

  it('rejects a non-finite or invalid input', () => {
    expect(() => fromMajor(Number.NaN)).toThrow(MoneyError);
    expect(() => fromMajor(1, 0)).toThrow(MoneyError);
  });
});

describe('arithmetic', () => {
  it('adds and subtracts exactly where floats would drift', () => {
    // The canonical failure: 0.1 + 0.2 !== 0.3 in floating point.
    expect(add(fromMajor(0.1), fromMajor(0.2))).toBe(fromMajor(0.3));
    expect(subtract(fromMajor(0.3), fromMajor(0.1))).toBe(fromMajor(0.2));
  });

  it('sums a schedule column without drift over many rows', () => {
    const rows = Array.from({ length: 360 }, () => fromMajor(1041.67));
    expect(sum(rows)).toBe(minor(37500120));
    expect(toMajor(sum(rows))).toBe(375001.2);
  });

  it('negates and takes absolute value without producing negative zero', () => {
    expect(negate(minor(500))).toBe(-500);
    expect(Object.is(negate(ZERO), 0)).toBe(true);
    expect(absolute(minor(-500))).toBe(500);
  });

  it('sums an empty list to zero', () => {
    expect(sum([])).toBe(0);
  });

  it('refuses to produce a value outside the exact-integer range', () => {
    const huge = minor(Number.MAX_SAFE_INTEGER);
    expect(() => add(huge, minor(2))).toThrow(MoneyError);
  });
});

describe('scale — periodic interest', () => {
  it('computes a monthly interest charge to the exact minor unit', () => {
    // $250,000.00 at 5.00% nominal annual, monthly: 25_000_000 * (0.05/12)
    //   = 104166.666... cents -> 104167 cents -> $1,041.67
    const balance = fromMajor(250_000);
    expect(scale(balance, 0.05 / 12)).toBe(minor(104_167));
    expect(format(scale(balance, 0.05 / 12), 'USD')).toBe('$1,041.67');
  });

  it('honours the rounding mode it is given', () => {
    const balance = fromMajor(100);
    // 10000 * 0.045 = 450 exactly; use a value that lands on a tie instead.
    expect(scale(minor(5), 0.5, 'half-up')).toBe(3); // 2.5 -> 3
    expect(scale(minor(5), 0.5, 'half-even')).toBe(2); // 2.5 -> 2
    expect(scale(minor(5), 0.5, 'down')).toBe(2);
    expect(scale(balance, 0)).toBe(0);
  });

  it('rejects a non-finite factor rather than returning NaN', () => {
    expect(() => scale(minor(100), Number.NaN)).toThrow(MoneyError);
  });
});

describe('divide', () => {
  it('divides and rounds under the stated policy', () => {
    expect(divide(minor(100), 3)).toBe(33);
    expect(divide(minor(100), 8)).toBe(13); // 12.5 -> half-up -> 13
    expect(divide(minor(100), 8, 'half-even')).toBe(12); // ties to even
  });

  it('rejects division by zero', () => {
    expect(() => divide(minor(100), 0)).toThrow(MoneyError);
  });
});

describe('allocate — the conservation invariant', () => {
  it('reproduces the worked example from the Money pattern', () => {
    // Fowler, PoEAA: allocating 100 across 3 equal parts gives 34, 33, 33 —
    // never 33.33 three times, and never a lost unit.
    expect(allocate(minor(100), [1, 1, 1])).toEqual([34, 33, 33]);
  });

  it('respects unequal weights', () => {
    expect(allocate(minor(1000), [3, 7])).toEqual([300, 700]);
    // 500 split 1:2 is 166.67 / 333.33; the stray unit goes to the first part.
    expect(allocate(minor(500), [1, 2])).toEqual([167, 333]);
  });

  it('conserves the total for every part count from 1 to 50', () => {
    // The invariant that actually matters: a schedule's rows must sum to its
    // header figure, or the tool looks broken however correct the maths is.
    for (let parts = 1; parts <= 50; parts++) {
      for (const total of [1, 7, 99, 100, 101, 1_000_003]) {
        const shares = split(minor(total), parts);
        expect(shares).toHaveLength(parts);
        expect(shares.reduce((a, b) => a + b, 0)).toBe(total);
      }
    }
  });

  it('conserves negative totals too', () => {
    expect(allocate(minor(-100), [1, 1, 1])).toEqual([-34, -33, -33]);
    expect(allocate(minor(-100), [1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(-100);
  });

  it('handles a zero total and zero-weighted parts', () => {
    expect(allocate(ZERO, [1, 1, 1])).toEqual([0, 0, 0]);
    expect(allocate(minor(100), [0, 1])).toEqual([0, 100]);
  });

  it('rejects degenerate weightings rather than guessing', () => {
    expect(() => allocate(minor(100), [])).toThrow(MoneyError);
    expect(() => allocate(minor(100), [0, 0])).toThrow(MoneyError);
    expect(() => allocate(minor(100), [1, -1])).toThrow(MoneyError);
    expect(() => split(minor(100), 0)).toThrow(MoneyError);
    expect(() => split(minor(100), 2.5)).toThrow(MoneyError);
  });
});

describe('comparison', () => {
  it('orders amounts', () => {
    expect(compare(minor(1), minor(2))).toBe(-1);
    expect(compare(minor(2), minor(2))).toBe(0);
    expect(compare(minor(3), minor(2))).toBe(1);
  });

  it('clamps a negative remaining balance to zero', () => {
    // A final period can overshoot; a schedule must never show -$0.03 owing.
    expect(clampAtZero(minor(-3))).toBe(0);
    expect(clampAtZero(minor(3))).toBe(3);
  });
});

describe('formatting', () => {
  it('formats with the currency symbol for the given locale', () => {
    expect(format(minor(123_456), 'USD')).toBe('$1,234.56');
    expect(format(minor(-123_456), 'USD')).toBe('-$1,234.56');
    expect(format(ZERO, 'USD')).toBe('$0.00');
  });

  it('formats plain figures for dense schedule columns', () => {
    expect(formatPlain(minor(123_456))).toBe('1,234.56');
    expect(formatPlain(minor(5))).toBe('0.05');
  });
});
