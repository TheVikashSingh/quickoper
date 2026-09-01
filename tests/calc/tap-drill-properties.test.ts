import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ENGAGEMENT_PERCENT,
  basicMinorDiameterUm,
  drillDiameterFor,
  engagementPercentExact,
  inchToUm,
  mmToUm,
  rankBySuitability,
  roundHalfEven,
  snapToSeries,
  um,
  umToInch,
  umToMm,
  type Drill,
} from '../../src/lib/calc/tap-drill';

/**
 * Property tests.
 *
 * Fixtures catch the cases someone thought of. These catch the ones nobody did:
 * every run generates hundreds of random thread and drill combinations across
 * the whole valid domain and asserts relationships that must hold for ALL of
 * them. A sign error, an inverted division or an off-by-one in the series
 * search survives a hand-written fixture far more easily than it survives this.
 *
 * The generators are bounded to real machining ranges — M1 to M64 equivalent,
 * pitches from 0.2 mm to 6 mm — because a property that only fails at a
 * thread diameter of 10 metres is not telling us anything about the tool.
 */

/** Thread major diameters from roughly M1 to M64, in µm. */
const majorUm = fc.integer({ min: 1_000, max: 64_000 }).map((n) => um(n));

/** Pitches from 0.2 mm to 6 mm, in µm — covers fine through coarse. */
const pitchUm = fc.integer({ min: 200, max: 6_000 }).map((n) => um(n));

/** A thread whose pitch is plausible for its diameter (pitch < diameter/3). */
const thread = fc
  .tuple(majorUm, pitchUm)
  .filter(([major, pitch]) => pitch * 3 < major)
  .map(([major, pitch]) => ({ major, pitch }));

const engagement = fc.double({ min: 1, max: 100, noNaN: true, noDefaultInfinity: true });

describe('engagement and drill diameter are exact inverses', () => {
  it('round-trips any thread at any engagement', () => {
    fc.assert(
      fc.property(thread, engagement, ({ major, pitch }, pct) => {
        const target = drillDiameterFor(major, pitch, pct);
        // Only meaningful where the target is a positive diameter; a 100 %
        // engagement on a coarse thread can legitimately go below zero.
        fc.pre(target > 0);
        const back = engagementPercentExact(major, pitch, target);
        expect(back).toBeCloseTo(pct, 6);
      }),
      { numRuns: 500 },
    );
  });
});

describe('monotonicity', () => {
  it('a larger drill always gives less engagement', () => {
    fc.assert(
      fc.property(thread, fc.integer({ min: 1, max: 500 }), ({ major, pitch }, step) => {
        const a = drillDiameterFor(major, pitch, 75);
        fc.pre(a - step > 0);
        const smaller = engagementPercentExact(major, pitch, a - step);
        const larger = engagementPercentExact(major, pitch, a);
        expect(smaller).toBeGreaterThan(larger);
      }),
      { numRuns: 300 },
    );
  });

  it('a higher engagement target always demands a smaller drill', () => {
    fc.assert(
      fc.property(thread, engagement, engagement, ({ major, pitch }, p1, p2) => {
        fc.pre(Math.abs(p1 - p2) > 1e-6);
        const [low, high] = p1 < p2 ? [p1, p2] : [p2, p1];
        expect(drillDiameterFor(major, pitch, high)).toBeLessThan(
          drillDiameterFor(major, pitch, low),
        );
      }),
      { numRuns: 300 },
    );
  });
});

describe('the minor diameter is always below the tap drill', () => {
  it('holds across the whole domain at the default engagement', () => {
    fc.assert(
      fc.property(thread, ({ major, pitch }) => {
        // D₁ = D − 1.0825P is below the 75 % tap drill, always. If this ever
        // inverts, one of the two constants has been mistyped.
        const minor = basicMinorDiameterUm(major, pitch);
        const drill = drillDiameterFor(major, pitch, DEFAULT_ENGAGEMENT_PERCENT);
        expect(minor).toBeLessThan(drill);
      }),
      { numRuns: 300 },
    );
  });
});

describe('unit conversion is lossless', () => {
  it('mm → µm → mm returns the original for any 3-decimal millimetre value', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000 }), (micro) => {
        const mm = micro / 1000;
        expect(umToMm(mmToUm(mm))).toBe(mm);
      }),
      { numRuns: 500 },
    );
  });

  it('inch → µm → inch survives to display precision', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 400_000 }), (tenThousandths) => {
        const inches = tenThousandths / 10_000;
        expect(roundHalfEven(umToInch(inchToUm(inches)), 3)).toBeCloseTo(inches, 2);
      }),
      { numRuns: 500 },
    );
  });
});

describe('series selection never violates its contract', () => {
  const series: readonly [Drill, ...Drill[]] = Array.from({ length: 60 }, (_, i) => ({
    um: um(1_000 + i * 100),
    label: `${(1_000 + i * 100) / 1000} mm`,
    series: 'metric' as const,
  })) as unknown as [Drill, ...Drill[]];

  it('always returns the nearest drill in the series', () => {
    fc.assert(
      fc.property(thread, engagement, ({ major, pitch }, pct) => {
        const target = drillDiameterFor(major, pitch, pct);
        const choice = snapToSeries(major, pitch, target, series);
        expect(choice).toBeDefined();
        // No drill in the whole catalogue may sit closer to the target than the
        // one recommended. Direction is not the rule - proximity is, which is
        // what published charts do.
        const best = Math.min(...series.map((d) => Math.abs(d.um - target)));
        expect(Math.abs(choice!.drill.um - target)).toBeCloseTo(best, 9);
      }),
      { numRuns: 400 },
    );
  });

  it('reports the engagement of the drill it actually chose', () => {
    fc.assert(
      fc.property(thread, engagement, ({ major, pitch }, pct) => {
        const target = drillDiameterFor(major, pitch, pct);
        fc.pre(target >= series[0].um);
        const choice = snapToSeries(major, pitch, target, series)!;
        expect(choice.engagementPercent).toBeCloseTo(
          engagementPercentExact(major, pitch, choice.drill.um),
          9,
        );
      }),
      { numRuns: 300 },
    );
  });

  it('ranks strictly by distance from the target', () => {
    fc.assert(
      fc.property(
        thread,
        fc.integer({ min: 1_000, max: 7_000 }),
        ({ major, pitch }, t) => {
          const deltas = rankBySuitability(major, pitch, t, series).map((r) =>
            Math.abs(r.deltaUm),
          );
          const sorted = [...deltas].sort((a, b) => a - b);
          expect(deltas).toEqual(sorted);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('nothing ever escapes as NaN or Infinity', () => {
  it('holds for every valid thread and engagement', () => {
    fc.assert(
      fc.property(thread, engagement, ({ major, pitch }, pct) => {
        const target = drillDiameterFor(major, pitch, pct);
        expect(Number.isFinite(target)).toBe(true);
        expect(Number.isFinite(basicMinorDiameterUm(major, pitch))).toBe(true);
        fc.pre(target > 0);
        expect(Number.isFinite(engagementPercentExact(major, pitch, target))).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it('rejects rather than returns NaN for non-finite input', () => {
    fc.assert(
      fc.property(fc.constantFrom(NaN, Infinity, -Infinity, 0, -1), (bad) => {
        expect(() => um(bad)).toThrow(RangeError);
      }),
    );
  });
});

describe('the brand rejects millimetres at runtime as well as compile time', () => {
  it('refuses any fractional value', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.001, max: 999, noNaN: true }), (mm) => {
        fc.pre(!Number.isInteger(mm));
        // Someone reaching for um(3.3) has millimetres in hand. Rounding it
        // silently is how a factor-of-1000 bug reaches a machinist.
        expect(() => um(mm)).toThrow(RangeError);
      }),
      { numRuns: 200 },
    );
  });
});
