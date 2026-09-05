import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  formatLength,
  lengthValue,
  tapDrillDisplay,
  type DisplayUnits,
} from '../../src/lib/calc/tap-drill-display';
import { inchToNm, mmToNm, SHOP_RULE_PERCENT } from '../../src/lib/calc/tap-drill';

/**
 * The display-versus-calculation gate.
 *
 * ─── The defect this exists for ─────────────────────────────────────────────
 *
 * D72 shipped a page that printed `201.2861 in` where the answer was
 * `0.2013 in` — a thousand times wrong, on the headline figure. The calculation
 * was correct throughout. The page divided nanometres by `25400`, the
 * MICROMETRE-per-inch constant, while formatting.
 *
 * 334 tests and eleven gates passed. Every one of them stops at the module
 * boundary: the calc suites check numbers, and the byte-budget, link, spacing
 * and schema gates have no opinion about arithmetic. Nothing looked at the
 * layer that turns a number into the string a machinist reads. It was found by
 * opening the page — the same way D70 was found, which is twice now.
 *
 * So this file checks the STRINGS. Not that the formula is right, which is
 * covered elsewhere, but that what the page displays is what the module
 * computed, in both unit systems, for every row of the published fixture.
 */

const CSV_PATH = fileURLToPath(
  new URL('../fixtures/golden-tap-drill.csv', import.meta.url),
);

interface Row {
  thread: string;
  system: 'metric' | 'unified_inch';
  major: number;
  pitchOrTpi: number;
  tapDrill: number;
  drillLabel: string;
  engagementPct: number;
}

const GOLDEN: Row[] = readFileSync(CSV_PATH, 'utf8')
  .trim()
  .split('\n')
  .slice(1)
  .map((line) => {
    const c = line.split(',');
    return {
      thread: c[0] ?? '',
      system: (c[1] ?? '') as Row['system'],
      major: Number(c[2]),
      pitchOrTpi: Number(c[3]),
      tapDrill: Number(c[4]),
      drillLabel: c[5] ?? '',
      engagementPct: Number(c[6]),
    };
  });

const unitsFor = (row: Row): DisplayUnits => (row.system === 'metric' ? 'mm' : 'in');

describe('a displayed length round-trips to the number that was entered', () => {
  /**
   * THE assertion that catches a scale error, and the one that was missing.
   *
   * Enter 0.25 in, and the page must say 0.25 in. Any factor-of-1000 slip in a
   * conversion — the exact shape of D72 — breaks this on the first row, in
   * whichever direction it was made.
   */
  it.each(GOLDEN)('$thread major diameter survives the round trip', (row) => {
    const units = unitsFor(row);
    const nm = units === 'mm' ? mmToNm(row.major) : inchToNm(row.major);
    expect(lengthValue(nm, units)).toBeCloseTo(row.major, 4);
  });

  it.each(GOLDEN)('$thread tap drill survives the round trip', (row) => {
    const units = unitsFor(row);
    const nm = units === 'mm' ? mmToNm(row.tapDrill) : inchToNm(row.tapDrill);
    expect(lengthValue(nm, units)).toBeCloseTo(row.tapDrill, 4);
  });

  it('appends the unit the caller asked for, and no other', () => {
    expect(formatLength(mmToNm(6.8), 'mm')).toBe('6.8 mm');
    expect(formatLength(inchToNm(0.25), 'in')).toBe('0.25 in');
  });

  it('never renders an inch length as though it were millimetres', () => {
    // The two must differ by exactly 25.4, and a formatter that has lost a
    // factor of a thousand cannot satisfy that.
    const quarterInch = inchToNm(1);
    expect(lengthValue(quarterInch, 'in')).toBeCloseTo(1, 6);
    expect(lengthValue(quarterInch, 'mm')).toBeCloseTo(25.4, 6);
  });
});

describe('the result panel shows what the module computed', () => {
  const metric = GOLDEN.filter((r) => r.system === 'metric');

  const CEILING_MM = 13;

  it.each(metric)('$thread renders its published drill and engagement', (row) => {
    const call = () =>
      tapDrillDisplay({
        major: row.major,
        pitch: row.pitchOrTpi,
        engagementPercent: SHOP_RULE_PERCENT,
        units: 'mm',
        series: 'metric',
      });

    if (row.tapDrill > CEILING_MM) {
      // Above the index there is no answer, and the largest drill is not an
      // approximation of one. This must REFUSE, not recommend 13 mm — see the
      // guard in tap-drill-display.ts and D73.
      expect(call).toThrow(RangeError);
      return;
    }

    const display = call();
    expect(display.drillLabel).toBe(row.drillLabel);
    expect(display.drillLength).toBe(formatLength(mmToNm(row.tapDrill), 'mm'));
    expect(display.engagementPercent).toBeCloseTo(row.engagementPct, 2);
  });

  /**
   * The recommendations this guard removed, pinned by name.
   *
   * Every one of these was reachable by typing a common thread into the page.
   * If any starts returning a drill again, the tool is telling a machinist to
   * put a 13 mm drill in an M30 hole.
   */
  it.each([
    { thread: 'M16', major: 16, pitch: 2 },
    { thread: 'M20', major: 20, pitch: 2.5 },
    { thread: 'M24', major: 24, pitch: 3 },
    { thread: 'M30', major: 30, pitch: 3.5 },
  ])('$thread is refused rather than sent to the 13 mm drill', ({ major, pitch }) => {
    expect(() =>
      tapDrillDisplay({
        major,
        pitch,
        engagementPercent: 75,
        units: 'mm',
        series: 'metric',
      }),
    ).toThrow(/No drill in this index reaches/);
  });

  it('shows the shop-rule target as exactly major − pitch', () => {
    const d = tapDrillDisplay({
      major: 12,
      pitch: 1.75,
      engagementPercent: SHOP_RULE_PERCENT,
      units: 'mm',
      series: 'metric',
    });
    expect(d.targetLength).toBe('10.25 mm');
    expect(d.drillLabel).toBe('10.2 mm'); // the half-even tie, D71
  });

  it('marks exactly one neighbour as the chosen drill', () => {
    const d = tapDrillDisplay({
      major: 8,
      pitch: 1.25,
      engagementPercent: 75,
      units: 'mm',
      series: 'metric',
    });
    expect(d.neighbours.filter((n) => n.chosen)).toHaveLength(1);
    expect(d.neighbours.find((n) => n.chosen)?.label).toBe(d.drillLabel);
  });

  it('signs the delta so a larger drill reads +', () => {
    const d = tapDrillDisplay({
      major: 8,
      pitch: 1.25,
      engagementPercent: 75,
      units: 'mm',
      series: 'metric',
    });
    const chosen = d.neighbours.find((n) => n.chosen)!;
    // 6.8 mm against a 6.7822 mm target: larger, so positive.
    expect(chosen.delta.startsWith('+')).toBe(true);
  });
});

describe('the exact figures D72 got wrong', () => {
  /**
   * Pinned by value, in the unit system that broke. If either of these moves by
   * three orders of magnitude again, this is the test that says so.
   */
  it('renders 1/4-20 UNC in inches, not in thousands of inches', () => {
    const d = tapDrillDisplay({
      major: 0.25,
      pitch: 20,
      engagementPercent: 75,
      units: 'in',
      series: 'fractional',
    });
    expect(d.targetLength).toBe('0.2013 in'); // shipped as "201.2861 in"
    expect(d.minorLength).toBe('0.1959 in'); // shipped as "195.8734 in"
  });

  it('renders M8 × 1.25 in millimetres unchanged', () => {
    const d = tapDrillDisplay({
      major: 8,
      pitch: 1.25,
      engagementPercent: 75,
      units: 'mm',
      series: 'metric',
    });
    expect(d.drillLabel).toBe('6.8 mm');
    expect(d.engagementPercent).toBeCloseTo(73.9, 2);
    expect(d.targetLength).toBe('6.7822 mm');
    expect(d.minorLength).toBe('6.6468 mm'); // 6.6469 before the √3 constants
  });
});

/**
 * A hole at or above the major diameter cuts no thread.
 *
 * D73 guarded the top of the drill INDEX -- M30 was being sent to a 13 mm drill
 * at 373% engagement. This is the top of the THREAD, and it is a different
 * failure: the target sits comfortably inside the index, so D73's guard never
 * fires, but the drill nearest that target is as wide as the fastener.
 *
 * All three cases below were headlined "Use this drill: 6 mm" in 3xl
 * brand-coloured type, with the 0% relegated to a stat beside it. The last is a
 * hole WIDER than the thread it is meant to tap.
 *
 * The Kotlin core already refused these ("That leaves no thread"), so the two
 * implementations disagreed -- the Gate 7 signal. Expected behaviour here is
 * taken from the standard, not from the Kotlin: engagement is
 * 100 x (D - d) / (K x P), which is zero at d = D and negative above it, and a
 * drill diameter that produces a non-positive engagement is not a tap drill.
 */
describe('a drill that leaves no thread is refused, not headlined', () => {
  const metric = { units: 'mm', series: 'metric' } as const;

  it.each([
    ['M6 x 1 at 1%', 6, 1, 1],
    ['M6 x 1 at 3%', 6, 1, 3],
    ['M5.99 x 1 at 1% (engagement would be negative)', 5.99, 1, 1],
  ])('refuses %s', (_name, major, pitch, engagementPercent) => {
    expect(() => tapDrillDisplay({ major, pitch, engagementPercent, ...metric })).toThrow(
      /leaves no thread/i,
    );
  });

  it('names the drill, the target and the major diameter in the refusal', () => {
    // A refusal that does not say WHICH sizes collided is not actionable.
    try {
      tapDrillDisplay({ major: 6, pitch: 1, engagementPercent: 3, ...metric });
      throw new Error('expected a refusal');
    } catch (e) {
      const m = (e as Error).message;
      expect(m).toContain('6 mm'); // the drill, and the major diameter
      expect(m).toContain('5.961 mm'); // the target it was nearest to
      expect(m).toMatch(/more engagement/i); // and what to do about it
    }
  });

  /**
   * The guard must not eat legitimately low engagements. A drill genuinely
   * smaller than the major diameter is an answer however thin the thread, and
   * the Kotlin core returns these too -- 5.9 mm at 7.7% for M6 at 10%.
   */
  it('still answers when the drill is below the major diameter', () => {
    // NB the label carries its unit on this side ('5.9 mm'); the Kotlin core
    // labels the same drill '5.9' and puts the unit on drillLength. A
    // presentation difference, not a disagreement about the drill.
    const thin = tapDrillDisplay({
      major: 6,
      pitch: 1,
      engagementPercent: 10,
      ...metric,
    });
    expect(thin.drillLabel).toBe('5.9 mm');
    expect(thin.engagementPercent).toBeCloseTo(7.7, 2);
    expect(thin.engagementPercent).toBeGreaterThan(0);

    const shop = tapDrillDisplay({
      major: 6,
      pitch: 1,
      engagementPercent: 76.98,
      ...metric,
    });
    expect(shop.drillLabel).toBe('5 mm');

    const m8 = tapDrillDisplay({
      major: 8,
      pitch: 1.25,
      engagementPercent: 75,
      ...metric,
    });
    expect(m8.drillLabel).toBe('6.8 mm');
    expect(m8.engagementPercent).toBeCloseTo(73.9, 2);
  });
});
