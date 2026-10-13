import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  angleSteps,
  fractionText,
  halfEvenBig,
  hundredthsOfSecond,
  lengthSteps,
  nearestFraction,
  parseAngle,
  parseLength,
  type LengthUnit,
} from '../../src/lib/calc/convert';
import { dmsText, fixed, lengthIn } from '../../src/lib/calc/convert-display';

/**
 * Conversions before any wording: lengths on the nanometre grid, the nearest
 * fractions of an inch, and angles, each rounded once.
 *
 * Expected values come from five places, each named where it is used:
 *
 *   - NIST Special Publication 811, Appendix B.8, "Factors for units listed
 *     alphabetically" (retrieved 2026-10-13,
 *     https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b8):
 *     inch to metre 2.54 E−02 and mil (0.001 in) to millimetre 2.54 E−02,
 *     both printed in bold, which the page says marks an exact factor; degree
 *     to radian 1.745 329 E−02, minute 2.908 882 E−04, second 4.848 137 E−06.
 *   - Inch Calculator, "Inch Fraction Calculator" (retrieved 2026-10-13,
 *     https://www.inchcalculator.com/inch-fraction-calculator/): 2.695 in to
 *     1/16 in is 2 11/16, rounding "to the nearest dyadic fractional inch";
 *     its chart prints 1/64″ 0.015625″ 0.396875 mm, 3/16″ 0.1875″ 4.7625 mm,
 *     13/64″ 0.203125″ 5.159375 mm and 17/64″ 0.265625″ 6.746875 mm.
 *   - Omni Calculator, "Inches to Fraction Calculator" (retrieved
 *     2026-10-13, https://www.omnicalculator.com/conversion/inches-to-fraction):
 *     12 mm is 15/32 in, 7 mm is 9/32 in, 11.81 in at 16ths is 11 13/16; and
 *     "Degrees Minutes Seconds Calculator"
 *     (https://www.omnicalculator.com/conversion/degrees-minutes-seconds):
 *     47.392° is 47°23'31.2".
 *   - The research spec's table (`machinist-calc-research`
 *     03-spec/calculations.md, "Conversions"), which the Android app's tests
 *     also hold.
 *   - `tests/fixtures/convert-*-reference.csv`: 3000 lengths and 3000 angles
 *     worked with exact fractions and 70-digit decimals by
 *     `tests/fixtures/convert-reference.py`.
 */

const nmOf = (text: string, unit: LengthUnit): number => parseLength(text, unit).nm;

describe('the published factors and examples', () => {
  it('NIST: an inch is 25.4 mm and a mil 0.0254 mm, exactly', () => {
    expect(nmOf('1', 'in')).toBe(25_400_000);
    expect(lengthIn(nmOf('1', 'in'), 'mm')).toBe('25.4000 mm');
    expect(lengthIn(nmOf('1', 'thou'), 'mm')).toBe('0.0254 mm');
    expect(lengthIn(nmOf('25.4', 'mm'), 'in')).toBe('1.0000 in');
    expect(parseLength('1', 'thou').exact).toBe(true);
  });

  it('NIST: a degree, a minute and a second in radians', () => {
    // 1.745 329 E−02, 2.908 882 E−04 and 4.848 137 E−06, each at the
    // page's eight places.
    const rad = (t: string): string =>
      fixed(angleSteps(parseAngle(t, 'deg'), 'rad', 8), 8);
    expect(rad('1')).toBe('0.01745329');
    expect(rad('0 1 0')).toBe('0.00029089');
    expect(rad('0 0 1')).toBe('0.00000485');
  });

  it('Inch Calculator: 2.695 in to the nearest 16th is 2 11/16', () => {
    const f = nearestFraction(nmOf('2.695', 'in'), 16);
    expect(fractionText(f.numerator, 16)).toBe('2 11/16');
  });

  it('Omni: 12 mm is 15/32, 7 mm is 9/32, 11.81 in is 11 13/16', () => {
    expect(fractionText(nearestFraction(nmOf('12', 'mm'), 32).numerator, 32)).toBe(
      '15/32',
    );
    expect(fractionText(nearestFraction(nmOf('7', 'mm'), 32).numerator, 32)).toBe('9/32');
    expect(fractionText(nearestFraction(nmOf('11.81', 'in'), 16).numerator, 16)).toBe(
      '11 13/16',
    );
  });

  it('Omni: 47.392° is 47° 23′ 31.20″', () => {
    expect(dmsText(hundredthsOfSecond(parseAngle('47.392', 'deg')))).toBe(
      '47° 23′ 31.20″',
    );
  });
});

describe("the spec's table", () => {
  it('10 mm is 0.3937 in, 393.7 thou, 10000.0 µm', () => {
    const nm = nmOf('10', 'mm');
    expect(lengthIn(nm, 'in')).toBe('0.3937 in');
    expect(lengthIn(nm, 'thou')).toBe('393.7 thou');
    expect(lengthIn(nm, 'um')).toBe('10000.0 µm');
  });

  it('0.201 in is 13/64, 0.0021 in over; 3/16 at 32nds and 16ths, 0.0135 in under', () => {
    const nm = nmOf('0.201', 'in');
    const f64 = nearestFraction(nm, 64);
    expect(fractionText(f64.numerator, 64)).toBe('13/64');
    expect(fixed(lengthSteps(f64.errorNm, 'in'), 4)).toBe('0.0021');
    for (const den of [32, 16] as const) {
      const f = nearestFraction(nm, den);
      expect(fractionText(f.numerator, den)).toBe('3/16');
      expect(fixed(lengthSteps(f.errorNm, 'in'), 4)).toBe('-0.0135');
    }
  });

  it('17/64 in at 32nds is 1/4: the tie goes to the even 8/32', () => {
    const f = nearestFraction(nmOf('17/64', 'in'), 32);
    expect(f.tie).toBe(true);
    expect(f.numerator).toBe(8);
    expect(fractionText(f.numerator, 32)).toBe('1/4');
    // 19/64 ties between 9/32 and 10/32, and goes up to the even one.
    expect(nearestFraction(nmOf('19/64', 'in'), 32).numerator).toBe(10);
  });

  it('0.2578125 in is 17/64: an odd 128th is half a nanometre off the grid', () => {
    const l = parseLength('0.2578125', 'in');
    expect(l).toEqual({ nm: 6_548_438, exact: false });
    const f = nearestFraction(l.nm, 64);
    expect(f.numerator).toBe(17);
    expect(f.tie).toBe(false);
  });

  it('12 30 15 is 12.504167° and 0.21823888 rad', () => {
    const a = parseAngle('12 30 15', 'deg');
    expect(fixed(angleSteps(a, 'deg', 6), 6)).toBe('12.504167');
    expect(fixed(angleSteps(a, 'rad', 8), 8)).toBe('0.21823888');
  });

  it('29.999999° is 30° 0′ 0.00″, never 29° 59′ 60.00″', () => {
    expect(dmsText(hundredthsOfSecond(parseAngle('29.999999', 'deg')))).toBe(
      '30° 0′ 0.00″',
    );
  });

  it('1 rad is 57° 17′ 44.81″', () => {
    expect(dmsText(hundredthsOfSecond(parseAngle('1', 'rad')))).toBe('57° 17′ 44.81″');
  });
});

describe('typed lengths', () => {
  it.each([
    ['0.201', 'in', 5_105_400],
    ['.5', 'mm', 500_000],
    ['5.', 'mm', 5_000_000],
    ['13/64', 'in', 5_159_375],
    ['1 3/8', 'in', 34_925_000],
    ['1-3/8', 'in', 34_925_000],
    ['  1  -  3 / 8 ', 'in', 34_925_000],
    ['393.7', 'thou', 9_999_980],
    ['0.5', 'um', 500],
    ['0', 'mm', 0],
  ] as const)('%s %s is %i nm', (text, unit, nm) => {
    expect(parseLength(text, unit)).toEqual({ nm, exact: true });
  });

  it('off the grid, to the nearest whole nanometre, half to even', () => {
    expect(parseLength('0.123456', 'in')).toEqual({ nm: 3_135_782, exact: false });
    // 0.0000005 mm is half a nanometre: a tie, to the even 0.
    expect(parseLength('0.0000005', 'mm')).toEqual({ nm: 0, exact: false });
    expect(parseLength('0.0000015', 'mm')).toEqual({ nm: 2, exact: false });
    // 1/3 in is 8 466 666.67 nm.
    expect(parseLength('1/3', 'in')).toEqual({ nm: 8_466_667, exact: false });
  });

  it.each([
    ['', 'mm', 'Enter a length.'],
    ['-1', 'mm', 'A length is zero or more.'],
    ['−1', 'in', 'A length is zero or more.'],
    ['1/0', 'in', 'more than zero'],
    ['1 9/8', 'in', 'the fraction is less than one'],
    ['3/8', 'mm', 'A fraction is taken in inches.'],
    ['12,5', 'mm', 'such as 12.5'],
    ['1e3', 'mm', 'such as 12.5'],
    ['abc', 'in', 'or a fraction, such as 13/64'],
    ['10000.0001', 'mm', 'A length over 10 m'],
  ] as const)('%j %s is refused', (text, unit, words) => {
    expect(() => parseLength(text, unit)).toThrow(words);
  });

  it('10 m is taken, and every unit agrees on it', () => {
    const nm = nmOf('10000', 'mm');
    expect(lengthIn(nm, 'in')).toBe('393.7008 in');
    expect(lengthIn(nm, 'um')).toBe('10000000.0 µm');
  });
});

describe('typed angles', () => {
  it.each([
    ['12.5', 12.5],
    ['12 30', 12.5],
    ['12°30′', 12.5],
    ['12° 30′ 0″', 12.5],
    ['12° 30\' 0"', 12.5],
    ["12°30'0''", 12.5],
    ['12d 30m 0s', 12.5],
    ['12deg 30min 0sec', 12.5],
    ['12°', 12],
    ['-12 30', -12.5],
    ['−12.5', -12.5],
    ['0 0 1.5', 1.5 / 3600],
  ] as const)('%s', (text, degrees) => {
    const a = parseAngle(text, 'deg');
    expect(Number(a.num) / Number(a.den)).toBeCloseTo(degrees, 12);
  });

  it.each([
    ['', 'Enter an angle.'],
    ['12 60', 'Minutes have to be less than 60.'],
    ['12 30 60', 'Seconds have to be less than 60.'],
    ['12.5 30', 'Only the last part can have decimals'],
    ['abc', 'such as 12 30 15'],
    ['3600.000001', 'more than ten turns'],
  ])('%j is refused', (text, words) => {
    expect(() => parseAngle(text, 'deg')).toThrow(words);
  });

  it('radians: a decimal, up to ten turns', () => {
    expect(() => parseAngle('12 30', 'rad')).toThrow('in radians as a decimal');
    expect(() => parseAngle('63', 'rad')).toThrow('more than ten turns');
    expect(() => parseAngle('62.8', 'rad')).not.toThrow();
  });

  it('a negative angle splits by its size and keeps its sign', () => {
    expect(dmsText(hundredthsOfSecond(parseAngle('-12.5', 'deg')))).toBe(
      '-12° 30′ 0.00″',
    );
    expect(dmsText(hundredthsOfSecond(parseAngle('0', 'deg')))).toBe('0° 0′ 0.00″');
  });

  it('a tie in its own unit is worked exactly, where floating point misses it', () => {
    // 0.0001255° is exactly halfway between 0.000125 and 0.000126, to the even
    // 0.000126; in floating point 0.0001255 × 10^6 is 125.49999999999999.
    expect(fixed(angleSteps(parseAngle('0.0001255', 'deg'), 'deg', 6), 6)).toBe(
      '0.000126',
    );
    // 0.000000015 rad is halfway to eight places, to the even 0.00000002;
    // in floating point × 10^8 it is 1.4999999999999998.
    expect(fixed(angleSteps(parseAngle('0.000000015', 'rad'), 'rad', 8), 8)).toBe(
      '0.00000002',
    );
  });

  it('a tie in the hundredths of a second goes to the even one', () => {
    // 0.000001° is 0.0036″ exactly; 0.0000125° is 0.045″, a tie, to 0.04″.
    expect(hundredthsOfSecond(parseAngle('0.0000125', 'deg'))).toBe(4);
    expect(hundredthsOfSecond(parseAngle('0.0000375', 'deg'))).toBe(14);
  });
});

describe('half to even, exactly', () => {
  it.each([
    [5n, 2n, 2n],
    [7n, 2n, 4n],
    [-5n, 2n, -2n],
    [-7n, 2n, -4n],
    [11n, 4n, 3n],
    [9n, 4n, 2n],
  ])('%i / %i is %i', (num, den, want) => {
    expect(halfEvenBig(num, den)).toBe(want);
  });
});

describe('the reference', () => {
  const read = (name: string): string[][] =>
    readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8')
      .trim()
      .split('\n')
      .slice(1)
      .map((line) => line.split(','));

  it('3000 lengths: the grid, every unit and every fraction', () => {
    const rows = read('convert-length-reference.csv');
    expect(rows.length).toBe(3000);
    const wrong: string[] = [];
    for (const [unit, typed, nm, mm, inch, thou, um, n64, n32, n16] of rows) {
      const u = unit as LengthUnit;
      const got = parseLength(typed ?? '', u).nm;
      const line = [
        String(got),
        fixed(lengthSteps(got, 'mm'), 4),
        fixed(lengthSteps(got, 'in'), 4),
        fixed(lengthSteps(got, 'thou'), 1),
        fixed(lengthSteps(got, 'um'), 1),
        String(nearestFraction(got, 64).numerator),
        String(nearestFraction(got, 32).numerator),
        String(nearestFraction(got, 16).numerator),
      ].join(',');
      const want = [nm, mm, inch, thou, um, n64, n32, n16].join(',');
      if (line !== want) wrong.push(`${unit} ${typed}: ${line} != ${want}`);
    }
    expect(wrong).toEqual([]);
  });

  it('3000 angles: degrees, radians and seconds', () => {
    const rows = read('convert-angle-reference.csv');
    expect(rows.length).toBe(3000);
    const wrong: string[] = [];
    for (const [unit, typed, deg6, rad8, hundredths] of rows) {
      const a = parseAngle(typed ?? '', unit === 'rad' ? 'rad' : 'deg');
      const line = [
        fixed(angleSteps(a, 'deg', 6), 6),
        fixed(angleSteps(a, 'rad', 8), 8),
        String(hundredthsOfSecond(a)),
      ].join(',');
      const want = [deg6, rad8, hundredths].join(',');
      if (line !== want) wrong.push(`${unit} ${typed}: ${line} != ${want}`);
    }
    expect(wrong).toEqual([]);
  });
});
