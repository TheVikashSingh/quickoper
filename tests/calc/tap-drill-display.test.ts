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
