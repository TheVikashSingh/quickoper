import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { coneDepth, coneDiameter, shifted, MAX_LENGTH_NM } from '../../src/lib/calc/cone';
import { formatSteps } from '../../src/lib/calc/hole-pattern-display';
import { bracketSteps } from '../../src/lib/calc/true-position-display';

/**
 * Cones before any rounding: depths, diameters and point lengths as the exact
 * brackets the display rounds from.
 *
 * Expected values come from four places, each named where it is used:
 *
 *   - Severance Tool Industries, "Countersink Angle Guide" (retrieved
 *     2026-10-12, https://severancetools.com/resources/countersink-angle-guide.html):
 *     the rule, and its own calculator's example, an 82° countersink to
 *     Ø0.500 in over a 0.201 in pilot hole, "Depth: 0.1720", and back again,
 *     0.172 in deep over the same hole, "Countersink diameter: 0.5000". The
 *     maker's own figures: the rule-3 third-party check.
 *   - Omni Calculator, "Countersink Depth Calculator" (retrieved 2026-10-12,
 *     https://www.omnicalculator.com/construction/countersink-depth): 5000 mm
 *     at 36° is "7,694 mm", and 0.55 m at 75° is "0.358 m".
 *   - The research spec's golden values (`machinist-calc-research`
 *     03-spec/calculations.md, "Cones"), worked in Python before the app's
 *     code, which also holds them.
 *   - `tests/fixtures/cone-reference.csv`: 3000 cones worked to 60 digits by
 *     `tests/fixtures/cone-reference.py`, Python's decimal module with its own
 *     documented sine and cosine, and no floating point.
 */

const MM = 1_000_000;
const INCH = 25_400_000;
/** A length typed in millimetres or inches, as whole nanometres, as the page takes it. */
const inMm = (x: number): number => Math.round(x * MM);
const inIn = (x: number): number => Math.round(x * INCH);
const mm = (b: ReturnType<typeof coneDepth>): string =>
  formatSteps(bracketSteps(b, 'mm'));
const inch = (b: ReturnType<typeof coneDepth>): string =>
  formatSteps(bracketSteps(b, 'in'));

describe('the published examples', () => {
  it('Severance: 82° to Ø0.500 in over a 0.201 in pilot hole is 0.1720 deep', () => {
    // (0.5 − 0.201) / (2 tan 41°) = 0.171981 6… in.
    expect(inch(coneDepth(inIn(0.5), inIn(0.201), 82))).toBe('0.1720');
  });

  it('Severance: 0.172 in deep over the same hole is Ø0.5000', () => {
    // 0.201 + 2 × 0.172 × tan 41° = 0.500034 6… in.
    expect(inch(coneDiameter(inIn(0.201), inIn(0.172), 82))).toBe('0.5000');
  });

  it('Omni: 5000 mm at 36° is 7,694 mm deep', () => {
    // 2500 / tan 18° = 7694.2088 4… mm; Omni prints it to the whole millimetre.
    expect(mm(coneDepth(inMm(5000), 0, 36))).toBe('7694.2088');
  });

  it('Omni: 0.55 m at 75° is 0.358 m deep', () => {
    // 275 / tan 37.5° = 358.3869 78… mm; Omni prints 0.358 m.
    expect(mm(coneDepth(inMm(550), 0, 75))).toBe('358.3870');
  });
});

describe("the spec's golden values", () => {
  it.each([
    ['a 10 mm drill at 118°', inMm(10), 0, 118, '3.0043'],
    ['a 10 mm drill at 135°', inMm(10), 0, 135, '2.0711'],
    ['a 10 mm drill at 140°', inMm(10), 0, 140, '1.8199'],
    ['a sharp 90° countersink to Ø12', inMm(12), 0, 90, '6.0000'],
    ['the same with a 0.5 mm tip flat', inMm(12), inMm(0.5), 90, '5.7500'],
    ['an 82° countersink to Ø10', inMm(10), 0, 82, '5.7518'],
    ['a 100° countersink to Ø10', inMm(10), 0, 100, '4.1955'],
    ['a 60° centre drill to Ø5', inMm(5), 0, 60, '4.3301'],
    ['a 120° spot drill to Ø5', inMm(5), 0, 120, '1.4434'],
    ['an M6 head, Ø12, reaching into a 6.4 mm hole', inMm(12), inMm(6.4), 90, '2.8000'],
  ])('%s', (_, outer, inner, angle, expected) => {
    expect(mm(coneDepth(outer, inner, angle))).toBe(expected);
  });

  it('a 1/4 in drill at 118° has a 0.0751 in point', () => {
    expect(inch(coneDepth(inIn(0.25), 0, 118))).toBe('0.0751');
  });

  it('3 mm deep with a 0.2 mm tip flat at 90° is Ø6.2000', () => {
    expect(mm(coneDiameter(inMm(0.2), inMm(3), 90))).toBe('6.2000');
  });

  it('the angle trap: a 45° chamfer entered as 45 is 12.0711 deep, not 5.0000', () => {
    expect(mm(coneDepth(inMm(10), 0, 45))).toBe('12.0711');
    expect(mm(coneDepth(inMm(10), 0, 90))).toBe('5.0000');
  });
});

describe('exact at 90°, the one angle a tie can happen at', () => {
  it('a half nanometre is not exact, a whole one is', () => {
    expect(coneDepth(12_000_001, 0, 90)).toEqual({ floor: 6_000_000, exact: false });
    expect(coneDepth(12_000_002, 0, 90)).toEqual({ floor: 6_000_001, exact: true });
  });

  it('a depth exactly half a step past a whole one rounds to the even step', () => {
    // Ø12.0001 at 90° is exactly 6.00005 mm: a tie, to the even 6.0000.
    expect(mm(coneDepth(12_000_100, 0, 90))).toBe('6.0000');
    // Ø12.0003 is exactly 6.00015: to the even 6.0002.
    expect(mm(coneDepth(12_000_300, 0, 90))).toBe('6.0002');
    // Ø0.0001 in at 90° is exactly 0.00005 in: to the even 0.0000.
    expect(inch(coneDepth(2_540, 0, 90))).toBe('0.0000');
  });

  it('a diameter at 90° is whole nanometres, exact', () => {
    expect(coneDiameter(200_000, inMm(3), 90)).toEqual({ floor: 6_200_000, exact: true });
    expect(coneDiameter(500_000, 0, 82)).toEqual({ floor: 500_000, exact: true });
  });

  it('a shifted bracket keeps its exactness', () => {
    expect(shifted({ floor: 3, exact: false }, 20)).toEqual({ floor: 23, exact: false });
  });
});

describe('what it refuses', () => {
  it.each([0, 180, -5, 200, Number.NaN, Number.POSITIVE_INFINITY])(
    'an included angle of %s',
    (a) => {
      expect(() => coneDepth(inMm(10), 0, a)).toThrow(RangeError);
      expect(() => coneDiameter(0, MM, a)).toThrow(RangeError);
    },
  );

  it('a cone no wider at the top than where it stops', () => {
    expect(() => coneDepth(inMm(5), inMm(5), 90)).toThrow(RangeError);
    expect(() => coneDepth(inMm(5), inMm(6), 90)).toThrow(RangeError);
  });

  it('a length that is not a whole number of nanometres, below zero or over 10 m', () => {
    expect(() => coneDepth(1.5, 0, 90)).toThrow(RangeError);
    expect(() => coneDepth(inMm(10), -1, 90)).toThrow(RangeError);
    expect(() => coneDepth(MAX_LENGTH_NM + 1, 0, 90)).toThrow(RangeError);
    expect(() => coneDiameter(0, MAX_LENGTH_NM + 1, 90)).toThrow(RangeError);
  });
});

describe('the 60-digit reference', () => {
  const rows = readFileSync(
    new URL('../fixtures/cone-reference.csv', import.meta.url),
    'utf8',
  )
    .trim()
    .split('\n')
    .slice(1)
    .map((line) => line.split(','));

  it('holds 3000 cones', () => {
    expect(rows.length).toBe(3000);
  });

  it('every one rounds to the same figure in millimetres and in inches', () => {
    const wrong: string[] = [];
    for (const [kind, angle, a, b, inMm, inIn] of rows) {
      const bracket =
        kind === 'depth'
          ? coneDepth(Number(a), Number(b), Number(angle))
          : coneDiameter(Number(a), Number(b), Number(angle));
      if (mm(bracket) !== inMm || inch(bracket) !== inIn) {
        wrong.push(`${kind} ${angle}° ${a} ${b}: ${mm(bracket)} / ${inch(bracket)}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});
