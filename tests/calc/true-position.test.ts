import { describe, expect, it } from 'vitest';
import {
  checkPosition,
  isqrt,
  rootBracket,
  MAX_OFFSET_NM,
  type PositionInput,
} from '../../src/lib/calc/true-position';

/**
 * True position before any rounding: the verdict, the bonus, and the exact
 * brackets the display rounds from.
 *
 * Expected values come from three places, each named where it is used:
 *
 *   - GD&T Basics, "True Position" (retrieved 2026-10-06,
 *     https://www.gdandtbasics.com/true-position/): a hole .003 in off in X
 *     and .002 in off in Y is in spec against a .008 in tolerance. They print
 *     the deviation as .007, to three places. The page also gives the bonus
 *     directions: a hole's is measured size minus MMC size, a pin's the
 *     opposite.
 *   - Gene R. Cogorno, Geometric Dimensioning and Tolerancing for Mechanical
 *     Design, 2nd ed., McGraw-Hill 2011, p. 121, as reprinted in Technical
 *     Training Consultants' newsletter "Zero Positional Tolerance at Maximum
 *     Material Condition" (retrieved 2026-10-06,
 *     http://www.ttc-cogorno.com/Newsletters/130108ZeroPositionalTol.pdf):
 *     Table 7-3 — holes Ø.520–.540 at Ø.020 MMC and Ø.500–.540 at zero MMC,
 *     both made at .535 — and the same part plated to .518.
 *   - Exact identities, and floors worked with Python's integer square root
 *     beside a 60-digit Decimal one, before this module existed.
 */

const MM = 1_000_000;
/** A thousandth of an inch, in nanometres. */
const THOU = 25_400;

const check = (over: Partial<PositionInput>) =>
  checkPosition({
    dxNm: 0,
    dyNm: 0,
    toleranceNm: 200_000,
    modifier: 'rfs',
    feature: 'hole',
    size: null,
    ...over,
  });

describe('the integer square root', () => {
  it.each([
    [0n, 0n],
    [1n, 1n],
    [15n, 3n],
    [16n, 4n],
    [17n, 4n],
  ])('isqrt(%s) is %s', (n, r) => {
    expect(isqrt(n)).toBe(r);
  });

  it('is exact past 2^53, where a float root is not', () => {
    const big = 2n ** 53n + 1n;
    expect(isqrt(big * big)).toBe(big);
    expect(isqrt(big * big - 1n)).toBe(big - 1n);
    // The float root cannot tell these apart.
    expect(Math.sqrt(Number(big * big - 1n))).toBe(Math.sqrt(Number(big * big)));
  });

  it('brackets a root, exact only for a perfect square', () => {
    expect(rootBracket(10_000_000_000n)).toEqual({ floor: 100_000, exact: true });
    expect(rootBracket(10_000_000_001n)).toEqual({ floor: 100_000, exact: false });
  });

  it('refuses a negative number', () => {
    expect(() => isqrt(-1n)).toThrow(RangeError);
  });
});

describe('the published examples', () => {
  it('GD&T Basics: .003 and .002 in off is in spec against .008 in', () => {
    const c = check({ dxNm: 3 * THOU, dyNm: 2 * THOU, toleranceNm: 8 * THOU });
    // 2√(.003² + .002²) = .0072111 in = 183 162.0048 nm: they print .007.
    expect(c.position).toEqual({ floor: 183_162, exact: false });
    expect(c.verdict).toBe('within');
    // 203 200 − 183 162.0048 = 20 037.995 nm.
    expect(c.margin).toEqual({ floor: 20_037, exact: false });
  });

  describe('Cogorno, Table 7-3: the same hole at .535, toleranced two ways', () => {
    const hole = (smallest: number, measured: number, tolerance: number) =>
      check({
        modifier: 'mmc',
        toleranceNm: tolerance * THOU,
        size: {
          smallestNm: smallest * THOU,
          largestNm: 540 * THOU,
          measuredNm: measured * THOU,
        },
      });

    it('Ø.520–.540 at Ø.020 MMC: bonus .015, total .035', () => {
      const c = hole(520, 535, 20);
      expect(c.bonusNm).toBe(15 * THOU);
      expect(c.allowedNm).toBe(35 * THOU);
    });

    it('Ø.500–.540 at zero MMC: bonus .035, total .035', () => {
      const c = hole(500, 535, 0);
      expect(c.bonusNm).toBe(35 * THOU);
      expect(c.allowedNm).toBe(35 * THOU);
    });

    it('plated to .518: rejected as too small under the first', () => {
      const c = hole(520, 518, 20);
      expect(c.verdict).toBe('out-of-size');
      expect(c.outOfSize).toBe('below');
      expect(c.bonusNm).toBeNull();
      expect(c.allowedNm).toBeNull();
    });

    it('plated to .518: bonus .018 under the second, where Ø.010 of position passes', () => {
      // An axis .005 in off is a position of exactly Ø.010.
      const c = checkPosition({
        dxNm: 5 * THOU,
        dyNm: 0,
        toleranceNm: 0,
        modifier: 'mmc',
        feature: 'hole',
        size: { smallestNm: 500 * THOU, largestNm: 540 * THOU, measuredNm: 518 * THOU },
      });
      expect(c.position).toEqual({ floor: 10 * THOU, exact: true });
      expect(c.bonusNm).toBe(18 * THOU);
      expect(c.verdict).toBe('within');
      expect(c.margin).toEqual({ floor: 8 * THOU, exact: true });
    });
  });
});

describe('the four bonus directions', () => {
  // GD&T Basics: a hole's bonus is measured − MMC size, a pin's the opposite;
  // LMC is the largest hole and the smallest pin, and the bonus grows as the
  // size moves away from it.
  const size = (smallest: number, largest: number, measured: number) => ({
    smallestNm: smallest * 1_000,
    largestNm: largest * 1_000,
    measuredNm: measured * 1_000,
  });

  it.each([
    ['mmc', 'hole', size(10_000, 10_100, 10_048), 48_000],
    ['mmc', 'pin', size(9_900, 10_000, 9_950), 50_000],
    ['lmc', 'hole', size(10_000, 10_100, 10_020), 80_000],
    ['lmc', 'pin', size(9_900, 10_000, 9_950), 50_000],
  ] as const)('%s, %s: bonus %i nm', (modifier, feature, s, bonus) => {
    const c = check({ modifier, feature, size: s });
    expect(c.bonusNm).toBe(bonus);
    expect(c.allowedNm).toBe(200_000 + bonus);
  });

  it('earns no bonus at the size the tolerance is stated at', () => {
    const atMmc = check({ modifier: 'mmc', size: size(10_000, 10_100, 10_000) });
    expect(atMmc.bonusNm).toBe(0);
    const atLmc = check({ modifier: 'lmc', size: size(10_000, 10_100, 10_100) });
    expect(atLmc.bonusNm).toBe(0);
  });
});

describe('a verdict only where one can honestly be given', () => {
  // The trap the competitor teardown found: a pass or fail with no size is a
  // regardless-of-size answer, whatever the frame says.
  it('gives no pass or fail at MMC or LMC without the size', () => {
    for (const modifier of ['mmc', 'lmc'] as const) {
      const c = check({ dxNm: 1_000, modifier, size: null });
      expect(c.verdict).toBe('needs-size');
      expect([c.allowedNm, c.margin, c.bonusNm, c.withoutBonus]).toEqual([
        null,
        null,
        null,
        null,
      ]);
      // The position is still worked out.
      expect(c.position).toEqual({ floor: 2_000, exact: true });
    }
  });

  it('fails a feature outside its size limits on size, with no bonus', () => {
    const s = { smallestNm: 10 * MM, largestNm: 10 * MM + 100_000 };
    expect(
      check({ modifier: 'mmc', size: { ...s, measuredNm: 10 * MM + 100_001 } }),
    ).toMatchObject({
      verdict: 'out-of-size',
      outOfSize: 'above',
      bonusNm: null,
    });
    expect(
      check({ modifier: 'lmc', size: { ...s, measuredNm: 10 * MM - 1 } }),
    ).toMatchObject({
      verdict: 'out-of-size',
      outOfSize: 'below',
    });
  });

  it('takes a size exactly on a limit as in size', () => {
    const s = { smallestNm: 10 * MM, largestNm: 10 * MM + 100_000 };
    expect(
      check({ modifier: 'mmc', size: { ...s, measuredNm: s.largestNm } }).verdict,
    ).toBe('within');
  });

  it('does not read the size regardless of feature size', () => {
    // Limits the wrong way round would be refused at MMC; here they are unread.
    const c = check({
      dxNm: 50_000,
      size: { smallestNm: 2 * MM, largestNm: 1 * MM, measuredNm: 5 * MM },
    });
    expect([c.verdict, c.bonusNm, c.allowedNm]).toEqual(['within', null, 200_000]);
  });

  it('says what the same position gets with no bonus', () => {
    // The app's own example: 0.062 and 0.089 mm off, Ø0.2 at MMC, hole 10 to
    // 10.1 mm measured 10.048. Over on its own, within with the bonus.
    const c = check({
      dxNm: 62_000,
      dyNm: 89_000,
      modifier: 'mmc',
      size: { smallestNm: 10 * MM, largestNm: 10_100_000, measuredNm: 10_048_000 },
    });
    expect(c.verdict).toBe('within');
    expect(c.margin).toEqual({ floor: 31_066, exact: false });
    expect(c.withoutBonus).toEqual({
      verdict: 'over',
      margin: { floor: 16_933, exact: false },
    });
  });
});

describe('exact at the edge', () => {
  it('passes a position exactly on the limit: 0.03 and 0.04 mm off is Ø0.1 exactly', () => {
    const c = check({ dxNm: 30_000, dyNm: 40_000, toleranceNm: 100_000 });
    expect(c.position).toEqual({ floor: 100_000, exact: true });
    expect(c.verdict).toBe('within');
    expect(c.margin).toEqual({ floor: 0, exact: true });
  });

  it('fails a position 1.6 nm over the limit', () => {
    const c = check({ dxNm: 30_000, dyNm: 40_001, toleranceNm: 100_000 });
    expect(c.position).toEqual({ floor: 100_001, exact: false });
    expect(c.verdict).toBe('over');
    expect(c.margin).toEqual({ floor: 1, exact: false });
  });

  it('decides on the squares in BigInt, where floats call it a pass', () => {
    // 100 mm and 1 nm off, against Ø200 mm (Ø100 at MMC with 100 mm of
    // bonus): 4(dx² + dy²) is (200 mm)² + 4 nm², past 2^53. It is over, by
    // 1e-8 nm, and both float routes call it within.
    const c = checkPosition({
      dxNm: MAX_OFFSET_NM,
      dyNm: 1,
      toleranceNm: 100 * MM,
      modifier: 'mmc',
      feature: 'hole',
      size: { smallestNm: 10 * MM, largestNm: 110 * MM, measuredNm: 110 * MM },
    });
    expect(c.allowedNm).toBe(200 * MM);
    expect(c.verdict).toBe('over');
    expect(c.margin).toEqual({ floor: 0, exact: false });
    expect(2 * Math.hypot(MAX_OFFSET_NM, 1) <= 200 * MM).toBe(true);
    expect(4 * (MAX_OFFSET_NM * MAX_OFFSET_NM + 1) <= (200 * MM) ** 2).toBe(true);
  });

  it('makes a deviation on one axis exactly twice itself, either sign', () => {
    expect(check({ dxNm: -108_475 }).position).toEqual({ floor: 216_950, exact: true });
    expect(check({ dyNm: 108_475 }).position).toEqual({ floor: 216_950, exact: true });
  });
});

describe('the position alone', () => {
  it('is worked out with no tolerance given, and judged against nothing', () => {
    const c = check({ dxNm: 30_000, dyNm: 40_000, toleranceNm: null, modifier: 'mmc' });
    expect(c.position).toEqual({ floor: 100_000, exact: true });
    expect(c.verdict).toBe('no-tolerance');
    expect([c.allowedNm, c.margin, c.bonusNm, c.withoutBonus]).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it('still refuses a deviation that is a slip in the inputs', () => {
    expect(() => check({ dxNm: MAX_OFFSET_NM + 1, toleranceNm: null })).toThrow(
      /More than 100 mm off/,
    );
  });
});

describe('zero tolerance', () => {
  // Cogorno: "Zero tolerance is never used without an MMC or LMC modifier."
  it('is refused regardless of feature size', () => {
    expect(() => check({ toleranceNm: 0 })).toThrow(/zero tolerance needs MMC or LMC/i);
  });

  it('is taken at MMC and at LMC', () => {
    const size = { smallestNm: 10 * MM, largestNm: 10_100_000, measuredNm: 10_050_000 };
    expect(check({ toleranceNm: 0, modifier: 'mmc', size }).allowedNm).toBe(50_000);
    expect(check({ toleranceNm: 0, modifier: 'lmc', size }).allowedNm).toBe(50_000);
  });
});

describe('refuses what is a slip in the inputs', () => {
  const size = { smallestNm: 10 * MM, largestNm: 10_100_000, measuredNm: 10_050_000 };

  it.each([
    [{ dxNm: MAX_OFFSET_NM + 1 }, /More than 100 mm off/],
    [{ dyNm: -MAX_OFFSET_NM - 1 }, /More than 100 mm off/],
    [{ toleranceNm: 100 * MM + 1 }, /tolerance over 100 mm/],
    [{ toleranceNm: -1 }, /cannot be negative/],
    [{ dxNm: Number.NaN }, /Enter every length as a number/],
    [{ dxNm: 0.5 }, /whole number of nanometres/],
    [{ modifier: 'mmc', size: { ...size, smallestNm: 10_200_000 } }, /wrong way round/],
    [
      { modifier: 'mmc', size: { ...size, largestNm: 110 * MM + 1 } },
      /size range over 100 mm/,
    ],
    [{ modifier: 'mmc', size: { ...size, smallestNm: 0 } }, /more than zero/],
    [{ modifier: 'lmc', size: { ...size, measuredNm: -1 } }, /more than zero/],
    [
      { modifier: 'mmc', size: { ...size, largestNm: 100_000 * MM + 1 } },
      /size over 100 m/,
    ],
  ] as const)('refuses %o', (over, message) => {
    expect(() => check(over as Partial<PositionInput>)).toThrow(message);
  });

  it('takes exactly 100 mm off, a 100 mm tolerance and a 100 mm size range', () => {
    expect(() => check({ dxNm: MAX_OFFSET_NM, dyNm: -MAX_OFFSET_NM })).not.toThrow();
    expect(() => check({ toleranceNm: 100 * MM })).not.toThrow();
    expect(() =>
      check({
        modifier: 'mmc',
        size: { smallestNm: 10 * MM, largestNm: 110 * MM, measuredNm: 50 * MM },
      }),
    ).not.toThrow();
  });
});
