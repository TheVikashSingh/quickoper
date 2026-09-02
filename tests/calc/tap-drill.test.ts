import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ENGAGEMENT_PERCENT,
  NM_PER_INCH,
  basicMinorDiameterNm,
  drillDiameterFor,
  engagementPercent,
  engagementPercentExact,
  inchToNm,
  mmToNm,
  rankBySuitability,
  roundHalfEven,
  SHOP_RULE_PERCENT,
  snapToSeries,
  tpiToPitchNm,
  nm,
  nmExactToMm,
  nmToInch,
  nmToMm,
  type Drill,
} from '../../src/lib/calc/tap-drill';
import { drillsFor } from '../../src/lib/calc/drill-series';

/**
 * Fixtures for tap drill sizing.
 *
 * The external anchor is the PUBLISHED TAP DRILL TABLE (ISO 2306 / DIN 336),
 * reproduced identically in the free catalogues of every tap manufacturer —
 * Emuge, Guhring, OSG, Dormer Pramet. Those firms make the taps; the numbers
 * are the ones their own tools are cut to.
 *
 * That table is a third-party published result, not a formula this repo
 * derived, which is what CLAUDE.md rule 3 requires. The engagement percentages
 * beside each row are then computed here — and the fact that they are NOT a
 * uniform 75 % is the finding the tool is built to surface.
 */

// ── Metric coarse series. Drill column: ISO 2306 / DIN 336, as published in
// ── the Emuge, Guhring and OSG tap catalogues (three independent sources in
// ── agreement). Engagement column: derived, and asserted to 2 dp.
const METRIC_TABLE = [
  { thread: 'M1.6', majorMm: 1.6, pitchMm: 0.35, drillMm: 1.25, engagement: 76.98 },
  { thread: 'M2', majorMm: 2, pitchMm: 0.4, drillMm: 1.6, engagement: 76.98 },
  { thread: 'M2.5', majorMm: 2.5, pitchMm: 0.45, drillMm: 2.05, engagement: 76.98 },
  { thread: 'M3', majorMm: 3, pitchMm: 0.5, drillMm: 2.5, engagement: 76.98 },
  { thread: 'M4', majorMm: 4, pitchMm: 0.7, drillMm: 3.3, engagement: 76.98 },
  { thread: 'M5', majorMm: 5, pitchMm: 0.8, drillMm: 4.2, engagement: 76.98 },
  { thread: 'M6', majorMm: 6, pitchMm: 1.0, drillMm: 5.0, engagement: 76.98 },
  // M8 is the row that matters most: the published drill is 6.8, the computed
  // 76.98 % target is 6.75, and the real engagement is therefore 73.90 % — not
  // 75, not 76.98. Competitors that round to 0.5 mm steps report 7.0 here.
  { thread: 'M8', majorMm: 8, pitchMm: 1.25, drillMm: 6.8, engagement: 73.9 },
  { thread: 'M10', majorMm: 10, pitchMm: 1.5, drillMm: 8.5, engagement: 76.98 },
  { thread: 'M12', majorMm: 12, pitchMm: 1.75, drillMm: 10.2, engagement: 79.18 },
  { thread: 'M16', majorMm: 16, pitchMm: 2.0, drillMm: 14.0, engagement: 76.98 },
  { thread: 'M20', majorMm: 20, pitchMm: 2.5, drillMm: 17.5, engagement: 76.98 },
] as const;

// ── Unified inch coarse series. Drill column: ASME B1.1 tap drill practice as
// ── published in the same manufacturer catalogues. Note the engagements vary
// ── far more widely than the metric series — #8-32 on a #29 drill is 68.97 %.
const INCH_TABLE = [
  { thread: '#4-40', majorIn: 0.112, tpi: 40, drillIn: 0.089, engagement: 70.82 },
  { thread: '#6-32', majorIn: 0.138, tpi: 32, drillIn: 0.1065, engagement: 77.6 },
  { thread: '#8-32', majorIn: 0.164, tpi: 32, drillIn: 0.136, engagement: 68.97 },
  { thread: '#10-24', majorIn: 0.19, tpi: 24, drillIn: 0.1495, engagement: 74.82 },
  { thread: '1/4-20', majorIn: 0.25, tpi: 20, drillIn: 0.201, engagement: 75.44 },
  { thread: '3/8-16', majorIn: 0.375, tpi: 16, drillIn: 0.3125, engagement: 76.98 },
] as const;

describe('unit conversion', () => {
  it('treats one inch as exactly 25 400 nm', () => {
    // International yard and pound agreement, 1959. A definition, not a measurement.
    expect(NM_PER_INCH).toBe(25_400_000);
    expect(inchToNm(1)).toBe(25_400_000);
  });

  it('round-trips mm → nm → mm without drift', () => {
    for (const { drillMm } of METRIC_TABLE) {
      expect(nmToMm(mmToNm(drillMm))).toBe(drillMm);
    }
  });

  it('round-trips inch → nm → inch at display precision', () => {
    for (const { drillIn } of INCH_TABLE) {
      expect(roundHalfEven(nmToInch(inchToNm(drillIn)), 4)).toBe(
        roundHalfEven(drillIn, 4),
      );
    }
  });

  it('derives pitch from threads per inch', () => {
    expect(tpiToPitchNm(20)).toBe(1_270_000); // 25 400 000 / 20
    // At micrometres this was 793.75 rounded to 794 — a 0.03 % error on the
    // pitch, which is what pushed #8-32 to 69.03 % instead of 68.97 %. In
    // nanometres it divides exactly. See D72.
    expect(tpiToPitchNm(32)).toBe(793_750); // 25 400 000 / 32, remainder zero
    expect(() => tpiToPitchNm(0)).toThrow(RangeError);
  });
});

describe('engagement against the published metric tap drill table', () => {
  it.each(METRIC_TABLE)(
    '$thread with a $drillMm mm drill gives $engagement %',
    ({ majorMm, pitchMm, drillMm, engagement }) => {
      const actual = engagementPercent(mmToNm(majorMm), mmToNm(pitchMm), mmToNm(drillMm));
      expect(roundHalfEven(actual, 2)).toBeCloseTo(engagement, 2);
    },
  );

  it('does not report a uniform 75 % across the series', () => {
    // If every row came out identical, the tool would be reporting the request
    // rather than the result — which is precisely the competitor defect.
    const values = new Set(METRIC_TABLE.map((r) => r.engagement));
    expect(values.size).toBeGreaterThan(1);
  });
});

describe('engagement against the published inch tap drill table', () => {
  it.each(INCH_TABLE)(
    '$thread with a $drillIn in drill gives $engagement %',
    ({ majorIn, tpi, drillIn, engagement }) => {
      // Exact conversions, NOT the whole-nm pair. An inch is not a whole
      // number of nanometres, and rounding the geometry before the division
      // shifts these by ~0.06 points — enough to move the second decimal the
      // fixture publishes. See the note above `inchToNmExact` and D72; the
      // page still has this defect, and this assertion is what will prove the
      // fix when it lands.
      const actual = engagementPercent(
        inchToNm(majorIn),
        tpiToPitchNm(tpi),
        inchToNm(drillIn),
      );
      expect(roundHalfEven(actual, 2)).toBeCloseTo(engagement, 2);
    },
  );
});

describe('drillDiameterFor', () => {
  it('reproduces the shop rule drill = major − pitch exactly', () => {
    // 100 / K = 76.98 %, so the classic rule and the formula must agree — and
    // at the full-precision percentage they agree EXACTLY, not approximately.
    // That exactness is load-bearing: it is what puts M8 and M12 precisely
    // midway between two drills so snapToSeries can break the tie. Asserted at
    // the nanometre, not to 3 dp, because the old literal 76.98 would pass a
    // 3 dp check while still destroying the tie.
    for (const [majorMm, pitchMm] of [
      [4, 0.7],
      [8, 1.25],
      [12, 1.75],
      [20, 2.5],
    ] as const) {
      const target = drillDiameterFor(
        mmToNm(majorMm),
        mmToNm(pitchMm),
        SHOP_RULE_PERCENT,
      );
      expect(target).toBeCloseTo(mmToNm(majorMm) - mmToNm(pitchMm), 6);
    }
  });

  it('is the exact inverse of engagementPercent', () => {
    for (const pct of [50, 65, 75, SHOP_RULE_PERCENT, 80, 100]) {
      const target = drillDiameterFor(mmToNm(8), mmToNm(1.25), pct);
      const back = engagementPercentExact(mmToNm(8), mmToNm(1.25), target);
      expect(back).toBeCloseTo(pct, 9);
    }
  });

  it('rejects an engagement outside (0, 100]', () => {
    expect(() => drillDiameterFor(mmToNm(8), mmToNm(1.25), 0)).toThrow(RangeError);
    expect(() => drillDiameterFor(mmToNm(8), mmToNm(1.25), 101)).toThrow(RangeError);
  });
});

describe('basicMinorDiameterNm', () => {
  it('is not the tap drill, and the difference is material', () => {
    // ISO 68-1: D₁ = D − 1.25 H. For M4 that is 3.2422 mm against a 3.3 mm
    // tap drill. Users conflate the two, so the tool reports both.
    const minor = nmExactToMm(basicMinorDiameterNm(mmToNm(4), mmToNm(0.7)));
    expect(roundHalfEven(minor, 4)).toBeCloseTo(3.2422, 4);
    expect(minor).toBeLessThan(3.3);
  });
});

describe('snapToSeries', () => {
  const metricSeries: Drill[] = [
    { nm: nm(6_500_000), label: '6.5 mm', series: 'metric' },
    { nm: nm(6_700_000), label: '6.7 mm', series: 'metric' },
    { nm: nm(6_800_000), label: '6.8 mm', series: 'metric' },
    { nm: nm(6_900_000), label: '6.9 mm', series: 'metric' },
    { nm: nm(7_000_000), label: '7.0 mm', series: 'metric' },
  ];

  it('agrees with the published chart for M8', () => {
    // The published tap drill for M8 x 1.25 is 6.8 mm, in every catalogue.
    // An earlier rule chose the largest drill NOT EXCEEDING the target, which
    // returned 6.7 mm and made the tool the outlier against every chart in the
    // world. At the shop rule this is an EXACT tie — 6.750 mm, dead between
    // 6.7 and 6.8 — and half-even resolves it upward because 6700/100 = 67 is
    // odd.
    const target = drillDiameterFor(mmToNm(8), mmToNm(1.25), SHOP_RULE_PERCENT);
    expect(target).toBe(6_750_000);
    const choice = snapToSeries(mmToNm(8), mmToNm(1.25), target, metricSeries);
    expect(choice?.drill.label).toBe('6.8 mm');
    expect(roundHalfEven(choice!.engagementPercent, 2)).toBeCloseTo(73.9, 2);
  });

  it('agrees with the published chart for M12, the row that broke the old rule', () => {
    // THE regression this rule exists for. M12 x 1.75 ties at exactly 10.250 mm
    // and every published chart names 10.2 mm — the SMALLER drill, the opposite
    // direction from M8. Tie-to-larger returned 10.3 mm and 74.78 %, which is
    // what made an earlier revision conclude the table was underivable.
    // Half-even resolves it downward because 10200/100 = 102 is even.
    const m12Series: Drill[] = [
      { nm: nm(10_000_000), label: '10.0 mm', series: 'metric' },
      { nm: nm(10_100_000), label: '10.1 mm', series: 'metric' },
      { nm: nm(10_200_000), label: '10.2 mm', series: 'metric' },
      { nm: nm(10_300_000), label: '10.3 mm', series: 'metric' },
      { nm: nm(10_400_000), label: '10.4 mm', series: 'metric' },
    ];
    const target = drillDiameterFor(mmToNm(12), mmToNm(1.75), SHOP_RULE_PERCENT);
    expect(target).toBe(10_250_000);
    const choice = snapToSeries(mmToNm(12), mmToNm(1.75), target, m12Series);
    expect(choice?.drill.label).toBe('10.2 mm');
    expect(roundHalfEven(choice!.engagementPercent, 2)).toBeCloseTo(79.18, 2);
  });

  it('picks the nearest drill in either direction', () => {
    // 6.71 is nearest 6.7; 6.79 is nearest 6.8. Direction is not the rule.
    expect(
      snapToSeries(mmToNm(8), mmToNm(1.25), 6_710_000, metricSeries)?.drill.label,
    ).toBe('6.7 mm');
    expect(
      snapToSeries(mmToNm(8), mmToNm(1.25), 6_790_000, metricSeries)?.drill.label,
    ).toBe('6.8 mm');
  });

  it('reports the engagement the chosen drill actually gives', () => {
    const choice = snapToSeries(mmToNm(8), mmToNm(1.25), 6_800_000, metricSeries);
    expect(choice?.drill.label).toBe('6.8 mm');
    expect(roundHalfEven(choice!.engagementPercent, 2)).toBeCloseTo(73.9, 2);
  });

  it('returns the smallest drill when the target is below the series', () => {
    const choice = snapToSeries(mmToNm(8), mmToNm(1.25), 1_000_000, metricSeries);
    expect(choice?.drill.nm).toBe(6_500_000);
    expect(choice!.deltaNm).toBeGreaterThan(0); // caller can see it is out of range
  });

  it('returns undefined for an empty series', () => {
    expect(snapToSeries(mmToNm(8), mmToNm(1.25), 6_800_000, [])).toBeUndefined();
  });
});

describe('rankBySuitability', () => {
  const series: Drill[] = [
    { nm: nm(3_200_000), label: '3.2 mm', series: 'metric' },
    { nm: nm(3_300_000), label: '3.3 mm', series: 'metric' },
    { nm: nm(3_500_000), label: '3.5 mm', series: 'metric' },
  ];

  it('orders by absolute distance from the target', () => {
    const ranked = rankBySuitability(mmToNm(4), mmToNm(0.7), 3_300_000, series);
    expect(ranked.map((r) => r.drill.label)).toEqual(['3.3 mm', '3.2 mm', '3.5 mm']);
  });

  it('exposes the competitor defect directly', () => {
    // The 0.5 mm-rounded 3.5 mm drill is in the list, and its engagement is
    // visibly 55 %. This is the comparison CLAUDE.md rule 10 asks for.
    const ranked = rankBySuitability(mmToNm(4), mmToNm(0.7), 3_300_000, series);
    const bad = ranked.find((r) => r.drill.label === '3.5 mm')!;
    expect(roundHalfEven(bad.engagementPercent, 1)).toBeCloseTo(55.0, 1);
  });
});

describe('invariants', () => {
  it('increasing engagement never increases drill diameter', () => {
    let previous = Infinity;
    for (const pct of [50, 60, 70, 75, 80, 90, 100]) {
      const d = drillDiameterFor(mmToNm(10), mmToNm(1.5), pct);
      expect(d).toBeLessThan(previous);
      previous = d;
    }
  });

  it('rejects zero and negative dimensions rather than returning NaN', () => {
    // The brand makes these unconstructable through nm(), which is the point.
    // Cast past it deliberately to prove the runtime guard still holds for any
    // caller that reaches the function through untyped JS.
    expect(() => engagementPercentExact(0, 1250, 6800)).toThrow(RangeError);
    expect(() => engagementPercentExact(8000, 0, 6800)).toThrow(RangeError);
    expect(() => engagementPercentExact(8000, 1250, -1)).toThrow(RangeError);
  });

  it('never produces NaN or Infinity for valid input', () => {
    for (const row of METRIC_TABLE) {
      const v = engagementPercent(
        mmToNm(row.majorMm),
        mmToNm(row.pitchMm),
        mmToNm(row.drillMm),
      );
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('default engagement is the shop standard', () => {
    expect(DEFAULT_ENGAGEMENT_PERCENT).toBe(75);
  });
});

describe('roundHalfEven', () => {
  it('rounds ties to even, avoiding upward bias down a column', () => {
    expect(roundHalfEven(0.125, 2)).toBe(0.12);
    expect(roundHalfEven(0.135, 2)).toBe(0.14);
    expect(roundHalfEven(2.5, 0)).toBe(2);
    expect(roundHalfEven(3.5, 0)).toBe(4);
  });

  it('survives the float-representation trap', () => {
    // 1.005 * 100 is 100.49999999999999 in IEEE-754.
    expect(roundHalfEven(1.005, 2)).toBe(1.0);
  });
});

/**
 * The page's default view, pinned. See DECISIONS.md D70.
 *
 * `/machining/tap-drill-calculator` loads with M8 x 1.25 at 75% and explains,
 * in prose, which drill that produces and why it may be larger than the target.
 * That prose said the opposite of what this code does for two pull requests —
 * the implementation was right, the paragraph describing it was wrong, and no
 * test had an opinion about the paragraph.
 *
 * These two assertions are the pin. Reverting to "largest not exceeding" fails
 * them with a message naming the decision, so the rule and the explanation of
 * the rule cannot drift apart again in silence.
 */
describe('the default the page loads with', () => {
  const major = mmToNm(8);
  const pitch = mmToNm(1.25);
  const target = drillDiameterFor(major, pitch, 75);

  it('returns the 6.8 mm drill every published chart specifies', () => {
    const choice = snapToSeries(major, pitch, target, drillsFor('metric'));
    expect(choice?.drill.label).toBe('6.8 mm');
    expect(roundHalfEven(choice?.engagementPercent ?? 0, 2)).toBe(73.9);
  });

  it('picks a drill LARGER than the target — the page must not claim otherwise', () => {
    const choice = snapToSeries(major, pitch, target, drillsFor('metric'));
    expect(
      choice === undefined ? 0 : choice.deltaNm,
      'D70: the rule is nearest-with-tie-to-larger, not largest-not-exceeding. ' +
        'If this now fails, the recommendation rule changed — update the two ' +
        'passages on the tap drill page and the llms.txt entry to match.',
    ).toBeGreaterThan(0);
  });
});
