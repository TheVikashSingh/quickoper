import { describe, expect, it } from 'vitest';
import { drillsFor } from '../../src/lib/calc/drill-series';
import { tapDrillDisplay } from '../../src/lib/calc/tap-drill-display';
import {
  DEFAULT_ENGAGEMENT_PERCENT,
  drillDiameterFor,
  ENGAGEMENT_K,
  engagementConstant,
  engagementPercentExact,
  FORMING_DEFAULT_PERCENT,
  FORMING_K,
  inchToNm,
  mmToNm,
  snapToSeries,
  tpiToPitchNm,
} from '../../src/lib/calc/tap-drill';

/**
 * Forming (roll) taps: the makers' rule d = D − 0.0068 × % × P.
 *
 * Every expected value below is a figure a maker PUBLISHED, read in the
 * research repo on 2026-09-28 (`03-spec/calculations.md` §2, "Forming taps: a
 * bigger hole"), or is derived from the rule and named as derived:
 *
 *   - Sandvik Coromant, threading formulas page: 1/4-20 at 65 % worked as
 *     0.2279 in; M8 × 1.25 at 68 % worked as 7.422 mm.
 *   - Harvey Performance, "8 Unique Facts About Thread Forming Taps": a 1/4-20
 *     roll tap takes a #1 drill for 65 % of thread.
 *   - Guhring, "Drill size for thread forming", catalogue pp. 238–239: tables
 *     in mm to two decimals, which do not print a rule. The 59 figures below
 *     were read off those pages.
 *   - Emuge's cold-forming wall chart (ZS10021 US) names 5.6 mm for M6.
 *
 * Rule 3's "real published third-party schedule" for this module is Guhring's
 * table: 59 rows the rule must reproduce to the half-hundredth they print.
 */

const inchThread = (major: number, tpi: number) => ({
  major: inchToNm(major),
  pitch: tpiToPitchNm(tpi),
});
const metricThread = (major: number, pitch: number) => ({
  major: mmToNm(major),
  pitch: mmToNm(pitch),
});

describe('the forming constant', () => {
  it('is the makers 0.0068 per percent of thread, as K = 0.68', () => {
    expect(FORMING_K).toBe(0.68);
    expect(engagementConstant('forming')).toBe(0.68);
  });

  it('leaves the cutting constant exactly as it was', () => {
    expect(engagementConstant('cutting')).toBe(ENGAGEMENT_K);
    expect(ENGAGEMENT_K).toBeCloseTo(1.2990381056766578, 12);
  });

  it('opens a forming tap at 65 % and a cutting tap at 75 %', () => {
    // 65 %: where Harvey's and Sandvik's worked examples are set.
    expect(FORMING_DEFAULT_PERCENT).toBe(65);
    expect(DEFAULT_ENGAGEMENT_PERCENT).toBe(75);
  });
});

describe("the makers' own worked examples", () => {
  // Sandvik Coromant: "0.250 − 0.0068 × 65 / 20 = 0.2279". 0.2279 in is a whole
  // number of nanometres (5 788 660), so the rule must land on it.
  it('works 1/4-20 at 65 % to 0.2279 in, as Sandvik prints', () => {
    const { major, pitch } = inchThread(0.25, 20);
    expect(drillDiameterFor(major, pitch, 65, 'forming')).toBeCloseTo(
      inchToNm(0.2279),
      3,
    );
  });

  // Sandvik Coromant: M8 × 1.25 at 68 % worked as 7.422 mm.
  it('works M8 × 1.25 at 68 % to 7.422 mm, as Sandvik prints', () => {
    const { major, pitch } = metricThread(8, 1.25);
    expect(drillDiameterFor(major, pitch, 68, 'forming')).toBeCloseTo(mmToNm(7.422), 3);
  });

  // Harvey Performance: "a ¼-20 roll tap requires a #1 drill size for 65%
  // thread". #1 is 0.2280 in; 100 × (0.25 − 0.228) / (0.68 × 0.05) = 64.71 %.
  it('puts a 1/4-20 forming tap on a #1 at 65 %, as Harvey says', () => {
    const d = tapDrillDisplay({
      major: 0.25,
      pitch: 20,
      engagementPercent: 65,
      units: 'in',
      series: 'inch',
      kind: 'forming',
    });
    expect(d.drillLabel).toBe('#1');
    expect(d.engagementPercent).toBeCloseTo(64.71, 2);
    expect(d.targetLength).toBe('0.2279 in');
  });

  // Emuge's cold-forming chart: 5.6 mm for M6. By the rule that is 58.82 %,
  // below the cutting band's 60 % and inside the forming band's 55 %.
  it('puts an M6 forming tap on the 5.6 mm Emuge names', () => {
    const d = tapDrillDisplay({
      major: 6,
      pitch: 1,
      engagementPercent: 65,
      units: 'mm',
      series: 'metric',
      kind: 'forming',
    });
    expect(d.drillLabel).toBe('5.6 mm');
    expect(d.engagementPercent).toBeCloseTo(58.82, 2);
    expect(d.targetLength).toBe('5.558 mm');
  });
});

/**
 * Guhring's tables are this rule.
 *
 * Each figure must be the rule to within the half-hundredth of a millimetre it
 * is printed to: 5 000 nm. Four of them sit exactly ON that half — the rule
 * gives 19.065, 5.575, 18.895 and 7.405 mm, and Guhring prints 19.07, 5.58,
 * 18.90 and 7.41, rounding half up — so the limit is 5 000 nm plus a
 * millionth of a nanometre for floating-point noise, and no more.
 */
describe("Guhring's forming tables are this rule", () => {
  const LIMIT_NM = 5_000 + 1e-6;

  const metric: [number, number, number, number][] = [
    [1, 0.25, 55, 0.91],
    [2, 0.4, 55, 1.85],
    [3, 0.5, 55, 2.81],
    [6, 1, 55, 5.63],
    [8, 1.25, 55, 7.53],
    [10, 1.5, 55, 9.44],
    [12, 1.75, 55, 11.35],
    [20, 2.5, 55, 19.07],
    [16, 2, 55, 15.25],
    [5, 0.8, 57.5, 4.69],
    [8, 1.25, 57.5, 7.51],
    [12, 1.75, 57.5, 11.32],
    [6, 1, 60, 5.59],
    [8, 1.25, 60, 7.49],
    [4, 0.7, 60, 3.71],
    [18, 2.5, 60, 16.98],
    [6, 1, 62.5, 5.58],
    [8, 1.25, 62.5, 7.47],
    [10, 1.5, 62.5, 9.36],
    [20, 2.5, 62.5, 18.94],
    [3, 0.5, 65, 2.78],
    [4, 0.7, 65, 3.69],
    [5, 0.8, 65, 4.65],
    [6, 1, 65, 5.56],
    [8, 1.25, 65, 7.45],
    [10, 1.5, 65, 9.34],
    [12, 1.75, 65, 11.23],
    [14, 2, 65, 13.12],
    [16, 2, 65, 15.12],
    [20, 2.5, 65, 18.9],
    [8, 1.25, 67.5, 7.43],
    [10, 1.5, 67.5, 9.31],
    [6, 1, 70, 5.52],
    [8, 1.25, 70, 7.41],
    [12, 1.75, 70, 11.17],
    [8, 1.25, 72.5, 7.38],
  ];

  // Unified sizes by major diameter: ASME B1.1, #n = 0.060 + 0.013 n in.
  const unified: [string, number, number, number, number][] = [
    ['#2-56', 0.086, 56, 55, 2.01],
    ['#10-24', 0.19, 24, 55, 4.43],
    ['1/4-20', 0.25, 20, 55, 5.88],
    ['1/4-28', 0.25, 28, 55, 6.01],
    ['1-8', 1, 8, 55, 24.21],
    ['#4-40', 0.112, 40, 60, 2.59],
    ['3/8-16', 0.375, 16, 60, 8.88],
    ['1/2-13', 0.5, 13, 60, 11.9],
    ['#2-56', 0.086, 56, 65, 1.98],
    ['#4-40', 0.112, 40, 65, 2.56],
    ['#6-32', 0.138, 32, 65, 3.15],
    ['#8-32', 0.164, 32, 65, 3.81],
    ['#10-24', 0.19, 24, 65, 4.36],
    ['#10-32', 0.19, 32, 65, 4.48],
    ['1/4-20', 0.25, 20, 65, 5.79],
    ['1/4-28', 0.25, 28, 65, 5.95],
    ['5/16-18', 0.3125, 18, 65, 7.31],
    ['3/8-16', 0.375, 16, 65, 8.82],
    ['1/2-13', 0.5, 13, 65, 11.84],
    ['3/4-10', 0.75, 10, 65, 17.93],
    ['1-8', 1, 8, 65, 24],
    ['1/4-20', 0.25, 20, 70, 5.75],
    ['1/4-20', 0.25, 20, 72.5, 5.72],
  ];

  it('holds all 59 figures read off the two pages', () => {
    expect(metric.length + unified.length).toBe(59);
  });

  it.each(metric)('M%s × %s at %s percent is %s mm', (major, pitch, pct, printed) => {
    const t = metricThread(major, pitch);
    const target = drillDiameterFor(t.major, t.pitch, pct, 'forming');
    expect(Math.abs(target - mmToNm(printed))).toBeLessThanOrEqual(LIMIT_NM);
  });

  it.each(unified)('%s at %s percent is %s mm', (_name, major, tpi, pct, printed) => {
    const t = inchThread(major, tpi);
    const target = drillDiameterFor(t.major, t.pitch, pct, 'forming');
    expect(Math.abs(target - mmToNm(printed))).toBeLessThanOrEqual(LIMIT_NM);
  });
});

/**
 * The drill each index gives a forming tap at 65 %.
 *
 * DERIVED, not published: the rule's target snapped to the nearest real drill,
 * worked in exact arithmetic (Python fractions) before any TypeScript, and the
 * same table the Android app's core is tested against — so the two cores agree
 * here independently (Gate 7). #1 for 1/4-20 and 5.6 mm for M6 are also the
 * published picks above.
 */
describe('the drill a forming tap gets at 65 %', () => {
  it.each([
    [3, 0.5, '2.8 mm', 58.82],
    [4, 0.7, '3.7 mm', 63.03],
    [5, 0.8, '4.6 mm', 73.53],
    [6, 1, '5.6 mm', 58.82],
    [8, 1.25, '7.4 mm', 70.59],
    [10, 1.5, '9.3 mm', 68.63],
    [12, 1.75, '11.2 mm', 67.23],
  ])('M%s × %s gets %s at %s percent', (major, pitch, label, pct) => {
    const d = tapDrillDisplay({
      major,
      pitch,
      engagementPercent: 65,
      units: 'mm',
      series: 'metric',
      kind: 'forming',
    });
    expect(d.drillLabel).toBe(label);
    expect(d.engagementPercent).toBeCloseTo(pct, 2);
  });

  it.each([
    ['#4-40', 0.112, 40, '#38', 61.76],
    ['#6-32', 0.138, 32, '1/8"', 61.18],
    ['#8-32', 0.164, 32, '#25', 68.24],
    ['#10-24', 0.19, 24, '11/64"', 63.97],
    ['#10-32', 0.19, 32, '#16', 61.18],
    ['1/4-20', 0.25, 20, '#1', 64.71],
    ['5/16-18', 0.3125, 18, 'L', 59.56],
    ['3/8-16', 0.375, 16, 'S', 63.53],
  ])('%s (%s in, %s tpi) gets %s at %s percent', (_name, major, tpi, label, pct) => {
    const d = tapDrillDisplay({
      major,
      pitch: tpi,
      engagementPercent: 65,
      units: 'in',
      series: 'inch',
      kind: 'forming',
    });
    expect(d.drillLabel).toBe(label);
    expect(d.engagementPercent).toBeCloseTo(pct, 2);
  });
});

describe('the rule behaves like a rule', () => {
  it('needs a bigger hole than a cutting tap for the same percentage', () => {
    for (const [major, pitch] of [
      [3, 0.5],
      [6, 1],
      [8, 1.25],
      [12, 1.75],
      [20, 2.5],
    ] as const) {
      const t = metricThread(major, pitch);
      const cutting = drillDiameterFor(t.major, t.pitch, 65, 'cutting');
      const forming = drillDiameterFor(t.major, t.pitch, 65, 'forming');
      expect(forming, `M${major}`).toBeGreaterThan(cutting);
    }
  });

  it('round-trips: the percentage of its own target is the percentage asked for', () => {
    const t = metricThread(8, 1.25);
    for (let pct = 55; pct <= 75; pct += 2.5) {
      const target = drillDiameterFor(t.major, t.pitch, pct, 'forming');
      expect(engagementPercentExact(t.major, t.pitch, target, 'forming')).toBeCloseTo(
        pct,
        9,
      );
    }
  });

  it('chooses the same drill as a cutting tap would for the same target', () => {
    // Only the percentage changes with the kind of tap; which drill is nearest
    // a diameter does not. snapToSeries reports the forming percentage for it.
    const t = metricThread(6, 1);
    const target = mmToNm(5.558);
    const forming = snapToSeries(
      t.major,
      t.pitch,
      target,
      drillsFor('metric'),
      'forming',
    );
    const cutting = snapToSeries(t.major, t.pitch, target, drillsFor('metric'));
    expect(forming?.drill).toBe(cutting?.drill);
    expect(forming?.engagementPercent).toBeCloseTo(58.82, 2);
    expect(cutting?.engagementPercent).toBeCloseTo(30.79, 2);
  });
});

describe('what the page shows for a forming tap', () => {
  const forming = tapDrillDisplay({
    major: 6,
    pitch: 1,
    engagementPercent: 65,
    units: 'mm',
    series: 'metric',
    kind: 'forming',
  });
  const cutting = tapDrillDisplay({
    major: 6,
    pitch: 1,
    engagementPercent: 65,
    units: 'mm',
    series: 'metric',
  });

  it('says which rule it worked by', () => {
    expect(forming.kind).toBe('forming');
    expect(cutting.kind).toBe('cutting');
  });

  it('works every drill in the neighbour table by the forming rule too', () => {
    // The table is where a machinist compares a drill they own. 5.5 mm on an
    // M6 forming tap is 100 × (6 − 5.5) / (0.68 × 1) = 73.53 %; by the cutting
    // rule it would read 38.49 %, a different answer for the same hole.
    const chosen = forming.neighbours.find((n) => n.chosen);
    expect(chosen?.engagementPercent).toBe(forming.engagementPercent);
    expect(forming.neighbours.find((n) => n.label === '5.5 mm')?.engagementPercent).toBe(
      73.53,
    );
  });

  it("shows the makers' rule and its 0.68 in the working", () => {
    expect(forming.working).toContain('K = 0.68');
    expect(forming.working).toContain('d = D − 0.0068 × % × P');
    expect(forming.working).toContain('(0.68 × 1)');
    expect(forming.working).not.toContain('√3');
  });

  it('gives a cutting tap a smaller drill for the same thread and percentage', () => {
    // M6 × 1 at 65 %: cutting wants 6 − 1.2990381 × 0.65 = 5.1556 mm (5.2 mm);
    // forming wants 5.558 mm (5.6 mm).
    expect(cutting.drillLabel).toBe('5.2 mm');
    expect(cutting.targetLength).toBe('5.1556 mm');
    expect(forming.drillLabel).toBe('5.6 mm');
  });

  it('writes the cutting constant without the fraction slash', () => {
    // U+2044 between digits can be drawn as a built fraction: "3√3⁄4" became
    // "3√¾" on the Android app's phone, i.e. 3 × √(3/4) = 2.598.
    expect(cutting.working).toContain('K = 3 × √3 / 4 = 1.299038');
    expect(cutting.working).not.toContain('⁄');
    expect(forming.working).not.toContain('⁄');
  });
});

// The refusals (D73, D78) are about the hole, not about the rule that chose
// it, so they hold for a forming tap exactly as for a cutting one.
describe('the refusals apply to a forming tap too', () => {
  it('refuses a hole as wide as the fastener', () => {
    expect(() =>
      tapDrillDisplay({
        major: 6,
        pitch: 1,
        engagementPercent: 3,
        units: 'mm',
        series: 'metric',
        kind: 'forming',
      }),
    ).toThrow(/leaves no thread/i);
  });

  it('refuses a thread above the top of the index', () => {
    // M16 × 2 at 65 %: 16 − 0.0068 × 65 × 2 = 15.116 mm, above 13 mm.
    expect(() =>
      tapDrillDisplay({
        major: 16,
        pitch: 2,
        engagementPercent: 65,
        units: 'mm',
        series: 'metric',
        kind: 'forming',
      }),
    ).toThrow(/No drill in this index reaches 15\.116 mm/);
  });
});
