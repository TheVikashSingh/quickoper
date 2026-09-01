import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ENGAGEMENT_PERCENT,
  UM_PER_INCH,
  basicMinorDiameterUm,
  drillDiameterFor,
  engagementPercent,
  inchToUm,
  mmToUm,
  rankBySuitability,
  roundHalfEven,
  snapToSeries,
  tpiToPitchUm,
  umToInch,
  umToMm,
  type Drill,
} from '../../src/lib/calc/tap-drill';

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
// ── far more widely than the metric series — #8-32 on a #29 drill is 68.98 %.
const INCH_TABLE = [
  { thread: '#4-40', majorIn: 0.112, tpi: 40, drillIn: 0.089, engagement: 70.82 },
  { thread: '#6-32', majorIn: 0.138, tpi: 32, drillIn: 0.1065, engagement: 77.6 },
  { thread: '#8-32', majorIn: 0.164, tpi: 32, drillIn: 0.136, engagement: 68.98 },
  { thread: '#10-24', majorIn: 0.19, tpi: 24, drillIn: 0.1495, engagement: 74.83 },
  { thread: '1/4-20', majorIn: 0.25, tpi: 20, drillIn: 0.201, engagement: 75.44 },
  { thread: '3/8-16', majorIn: 0.375, tpi: 16, drillIn: 0.3125, engagement: 76.98 },
] as const;

describe('unit conversion', () => {
  it('treats one inch as exactly 25 400 µm', () => {
    // International yard and pound agreement, 1959. A definition, not a measurement.
    expect(UM_PER_INCH).toBe(25_400);
    expect(inchToUm(1)).toBe(25_400);
  });

  it('round-trips mm → µm → mm without drift', () => {
    for (const { drillMm } of METRIC_TABLE) {
      expect(umToMm(mmToUm(drillMm))).toBe(drillMm);
    }
  });

  it('round-trips inch → µm → inch at display precision', () => {
    for (const { drillIn } of INCH_TABLE) {
      expect(roundHalfEven(umToInch(inchToUm(drillIn)), 4)).toBe(
        roundHalfEven(drillIn, 4),
      );
    }
  });

  it('derives pitch from threads per inch', () => {
    expect(tpiToPitchUm(20)).toBe(1270); // 25400 / 20
    expect(tpiToPitchUm(32)).toBe(794); // 25400 / 32 = 793.75, half-up to 794
    expect(() => tpiToPitchUm(0)).toThrow(RangeError);
  });
});

describe('engagement against the published metric tap drill table', () => {
  it.each(METRIC_TABLE)(
    '$thread with a $drillMm mm drill gives $engagement %',
    ({ majorMm, pitchMm, drillMm, engagement }) => {
      const actual = engagementPercent(mmToUm(majorMm), mmToUm(pitchMm), mmToUm(drillMm));
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
      const actual = engagementPercent(
        inchToUm(majorIn),
        tpiToPitchUm(tpi),
        inchToUm(drillIn),
      );
      expect(roundHalfEven(actual, 2)).toBeCloseTo(engagement, 1);
    },
  );
});

describe('drillDiameterFor', () => {
  it('reproduces the shop rule drill = major − pitch at 76.98 %', () => {
    // 100 / 1.299 = 76.98, so the classic rule and the formula must agree.
    const target = drillDiameterFor(mmToUm(4), mmToUm(0.7), 76.98);
    expect(roundHalfEven(umToMm(target), 3)).toBeCloseTo(3.3, 3);
  });

  it('is the exact inverse of engagementPercent', () => {
    for (const pct of [50, 65, 75, 76.98, 80, 100]) {
      const target = drillDiameterFor(mmToUm(8), mmToUm(1.25), pct);
      const back = engagementPercent(mmToUm(8), mmToUm(1.25), target);
      expect(back).toBeCloseTo(pct, 9);
    }
  });

  it('rejects an engagement outside (0, 100]', () => {
    expect(() => drillDiameterFor(mmToUm(8), mmToUm(1.25), 0)).toThrow(RangeError);
    expect(() => drillDiameterFor(mmToUm(8), mmToUm(1.25), 101)).toThrow(RangeError);
  });
});

describe('basicMinorDiameterUm', () => {
  it('is not the tap drill, and the difference is material', () => {
    // ISO 68-1: D₁ = D − 1.0825 P. For M4 that is 3.2422 mm against a 3.3 mm
    // tap drill. Users conflate the two, so the tool reports both.
    const minor = umToMm(basicMinorDiameterUm(mmToUm(4), mmToUm(0.7)));
    expect(roundHalfEven(minor, 4)).toBeCloseTo(3.2422, 4);
    expect(minor).toBeLessThan(3.3);
  });
});

describe('snapToSeries', () => {
  const metricSeries: Drill[] = [
    { um: 6500, label: '6.5 mm', series: 'metric' },
    { um: 6700, label: '6.7 mm', series: 'metric' },
    { um: 6800, label: '6.8 mm', series: 'metric' },
    { um: 6900, label: '6.9 mm', series: 'metric' },
    { um: 7000, label: '7.0 mm', series: 'metric' },
  ];

  it('never returns a drill larger than the target', () => {
    // Going larger silently reduces engagement below what was asked for. That
    // is the competitor bug: M4 rounded up to 3.5 mm yields 55 %, not 77 %.
    const target = drillDiameterFor(mmToUm(8), mmToUm(1.25), 76.98);
    const choice = snapToSeries(mmToUm(8), mmToUm(1.25), target, metricSeries);
    expect(choice?.drill.um).toBeLessThanOrEqual(target);
    expect(choice?.drill.label).toBe('6.7 mm');
  });

  it('reports the engagement the chosen drill actually gives', () => {
    const choice = snapToSeries(mmToUm(8), mmToUm(1.25), 6800, metricSeries);
    expect(choice?.drill.label).toBe('6.8 mm');
    expect(roundHalfEven(choice!.engagementPercent, 2)).toBeCloseTo(73.9, 2);
  });

  it('falls back to the smallest drill when the target is below the series', () => {
    const choice = snapToSeries(mmToUm(8), mmToUm(1.25), 1000, metricSeries);
    expect(choice?.drill.um).toBe(6500);
    expect(choice!.deltaUm).toBeGreaterThan(0); // caller can see it is out of range
  });

  it('returns undefined for an empty series', () => {
    expect(snapToSeries(mmToUm(8), mmToUm(1.25), 6800, [])).toBeUndefined();
  });
});

describe('rankBySuitability', () => {
  const series: Drill[] = [
    { um: 3200, label: '3.2 mm', series: 'metric' },
    { um: 3300, label: '3.3 mm', series: 'metric' },
    { um: 3500, label: '3.5 mm', series: 'metric' },
  ];

  it('orders by absolute distance from the target', () => {
    const ranked = rankBySuitability(mmToUm(4), mmToUm(0.7), 3300, series);
    expect(ranked.map((r) => r.drill.label)).toEqual(['3.3 mm', '3.2 mm', '3.5 mm']);
  });

  it('exposes the competitor defect directly', () => {
    // The 0.5 mm-rounded 3.5 mm drill is in the list, and its engagement is
    // visibly 55 %. This is the comparison CLAUDE.md rule 10 asks for.
    const ranked = rankBySuitability(mmToUm(4), mmToUm(0.7), 3300, series);
    const bad = ranked.find((r) => r.drill.label === '3.5 mm')!;
    expect(roundHalfEven(bad.engagementPercent, 1)).toBeCloseTo(55.0, 1);
  });
});

describe('invariants', () => {
  it('increasing engagement never increases drill diameter', () => {
    let previous = Infinity;
    for (const pct of [50, 60, 70, 75, 80, 90, 100]) {
      const d = drillDiameterFor(mmToUm(10), mmToUm(1.5), pct);
      expect(d).toBeLessThan(previous);
      previous = d;
    }
  });

  it('rejects zero and negative dimensions rather than returning NaN', () => {
    expect(() => engagementPercent(0, 1250, 6800)).toThrow(RangeError);
    expect(() => engagementPercent(8000, 0, 6800)).toThrow(RangeError);
    expect(() => engagementPercent(8000, 1250, -1)).toThrow(RangeError);
  });

  it('never produces NaN or Infinity for valid input', () => {
    for (const row of METRIC_TABLE) {
      const v = engagementPercent(
        mmToUm(row.majorMm),
        mmToUm(row.pitchMm),
        mmToUm(row.drillMm),
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
