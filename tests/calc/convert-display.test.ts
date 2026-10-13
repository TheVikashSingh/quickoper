import { describe, expect, it } from 'vitest';
import {
  angleDisplay,
  lengthDisplay,
  sixtyFourthsChart,
} from '../../src/lib/calc/convert-display';

/**
 * What the unit converter page prints, checked as strings.
 *
 * Expected values come from:
 *
 *   - The research spec's table (`machinist-calc-research`
 *     03-spec/calculations.md, "Conversions"): 10 mm is 0.3937 in, 393.7 thou
 *     and 10000.0 µm; 0.201 in is 13/64, 0.0021 in over, and 3/16 at 32nds
 *     and 16ths, 0.0135 in under; 12 30 15 is 12.504167° and 0.21823888 rad;
 *     1 rad is 57° 17′ 44.81″.
 *   - Inch Calculator, "Inch Fraction Calculator" (retrieved 2026-10-13,
 *     https://www.inchcalculator.com/inch-fraction-calculator/): its chart's
 *     rows 1/64″ 0.015625″ 0.396875 mm, 3/16″ 0.1875″ 4.7625 mm,
 *     13/64″ 0.203125″ 5.159375 mm and 17/64″ 0.265625″ 6.746875 mm.
 *   - Omni Calculator, "Degrees Minutes Seconds Calculator" (retrieved
 *     2026-10-13, https://www.omnicalculator.com/conversion/degrees-minutes-seconds):
 *     47.392° is 47°23'31.2".
 *   - Arithmetic shown in each test for the rest: 0.201 in is 5.1054 mm
 *     because 0.201 × 25.4 = 5.1054 exactly; 13/64 − 0.201 = 0.002125 in,
 *     0.053975 mm.
 */

describe('a length', () => {
  it('0.201 in: millimetres first, every unit, and the fractions', () => {
    const d = lengthDisplay('0.201', 'in');
    expect(d.headline).toBe('5.1054 mm');
    expect(d.detail).toBe(
      'In millimetres, to four places. The nearest 64th is 13/64 in.',
    );
    expect(d.units).toEqual([
      { label: 'Millimetres', value: '5.1054 mm' },
      { label: 'Inches', value: '0.2010 in' },
      { label: 'Thou', value: '201.0 thou' },
      { label: 'Micrometres', value: '5105.4 µm' },
    ]);
    expect(d.fractions).toEqual([
      {
        label: 'Nearest 1/64',
        fraction: '13/64 in',
        inch: '0.203125 in',
        mm: '5.159375 mm',
        error: '0.0021 in (0.0540 mm) over',
      },
      {
        label: 'Nearest 1/32',
        fraction: '3/16 in',
        inch: '0.1875 in',
        mm: '4.7625 mm',
        error: '0.0135 in (0.3429 mm) under',
      },
      {
        label: 'Nearest 1/16',
        fraction: '3/16 in',
        inch: '0.1875 in',
        mm: '4.7625 mm',
        error: '0.0135 in (0.3429 mm) under',
      },
    ]);
    expect(d.chartRow).toBe(13);
  });

  it('10 mm: inches first', () => {
    const d = lengthDisplay('10', 'mm');
    expect(d.headline).toBe('0.3937 in');
    expect(d.units.map((u) => u.value)).toEqual([
      '10.0000 mm',
      '0.3937 in',
      '393.7 thou',
      '10000.0 µm',
    ]);
    expect(d.fractions[0]?.fraction).toBe('25/64 in');
  });

  it('a mixed number above an inch: exact, and the chart row is what is below the inch', () => {
    const d = lengthDisplay('1 3/8', 'in');
    expect(d.headline).toBe('34.9250 mm');
    expect(d.fractions.map((f) => [f.fraction, f.error])).toEqual([
      ['1 3/8 in', 'exact'],
      ['1 3/8 in', 'exact'],
      ['1 3/8 in', 'exact'],
    ]);
    expect(d.chartRow).toBe(24);
  });

  it('a whole inch has no chart row', () => {
    expect(lengthDisplay('2', 'in').chartRow).toBeNull();
    expect(lengthDisplay('0', 'mm').chartRow).toBeNull();
  });

  it('a tie says so', () => {
    expect(lengthDisplay('17/64', 'in').fractions[1]?.error).toBe(
      '0.0156 in (0.3969 mm) under, exactly halfway: the even one is taken',
    );
  });

  it('an error under half a step says so rather than printing 0.0000', () => {
    // 1/64 in less a micrometre: 1 µm under, 0.0000394 in.
    expect(lengthDisplay('395.875', 'um').fractions[0]?.error).toBe(
      'less than 0.00005 in (0.0010 mm) over',
    );
  });

  it('the working shows the nanometres and each division', () => {
    const w = lengthDisplay('0.201', 'in').working;
    expect(w).toMatch(/^0\.201 in = 5105400 nm\n/);
    expect(w).toContain('1 in = 25.4 mm exactly');
    expect(w).toContain('mm   5105400 ÷ 1000000     = 5.1054  → 5.1054 mm');
    expect(w).toContain('thou 5105400 ÷ 25400       = 201  → 201.0 thou');
    expect(w).toContain('64ths  5105400 × 64 ÷ 25400000 = 12.864  → 13/64');
    expect(w).toContain('32nds  5105400 × 32 ÷ 25400000 = 6.432  → 6/32 = 3/16');
    expect(lengthDisplay('10', 'mm').working).toContain(
      'in   10000000 ÷ 25400000   ≈ 0.3937',
    );
  });

  it('a length off the nanometre grid says it was taken as the nearest', () => {
    expect(lengthDisplay('0.123456', 'in').working).toMatch(
      /^0\.123456 in is not a whole number of nanometres: taken as 3135782 nm, the nearest\n/,
    );
  });

  it('refuses in words', () => {
    expect(() => lengthDisplay('', 'mm')).toThrow('Enter a length.');
    expect(() => lengthDisplay('3/8', 'mm')).toThrow('A fraction is taken in inches.');
  });
});

describe('the 64ths chart', () => {
  const chart = sixtyFourthsChart();

  it('runs 1/64 to 1, every row exact at six places', () => {
    expect(chart).toHaveLength(64);
    expect(chart[0]).toEqual({
      sixtyFourths: 1,
      fraction: '1/64',
      inch: '0.015625',
      mm: '0.396875',
    });
    expect(chart[63]).toEqual({
      sixtyFourths: 64,
      fraction: '1',
      inch: '1.000000',
      mm: '25.400000',
    });
  });

  it("matches Inch Calculator's chart", () => {
    const row = (k: number) => chart[k - 1];
    expect(row(13)).toEqual({
      sixtyFourths: 13,
      fraction: '13/64',
      inch: '0.203125',
      mm: '5.159375',
    });
    expect(row(17)).toEqual({
      sixtyFourths: 17,
      fraction: '17/64',
      inch: '0.265625',
      mm: '6.746875',
    });
    // Printed there as 0.1875″ and 4.7625 mm; here to six places for a column.
    expect(row(12)?.fraction).toBe('3/16');
    expect(Number(row(12)?.inch)).toBe(0.1875);
    expect(Number(row(12)?.mm)).toBe(4.7625);
  });

  it('reduces each fraction', () => {
    expect(chart.slice(0, 8).map((r) => r.fraction)).toEqual([
      '1/64',
      '1/32',
      '3/64',
      '1/16',
      '5/64',
      '3/32',
      '7/64',
      '1/8',
    ]);
    expect(chart[31]?.fraction).toBe('1/2');
  });
});

describe('an angle', () => {
  it('12 30 15: decimal degrees first', () => {
    const d = angleDisplay('12 30 15', 'deg');
    expect(d.headline).toBe('12.504167°');
    expect(d.detail).toBe(
      'In decimal degrees, to six places. In radians, 0.21823888 rad.',
    );
    expect(d.facts).toEqual([
      { label: 'Degrees, minutes, seconds', value: '12° 30′ 15.00″' },
      { label: 'Decimal degrees', value: '12.504167°' },
      { label: 'Radians', value: '0.21823888 rad' },
    ]);
    expect(d.working).toContain('12 30 15 = d + m ÷ 60 + s ÷ 3600 = 12.5041666666…°');
    expect(d.working).toContain('  45015.00″ = 12 × 3600″ + 30 × 60″ + 15.00″');
  });

  it("Omni's 47.392°: degrees, minutes and seconds first", () => {
    const d = angleDisplay('47.392', 'deg');
    expect(d.headline).toBe('47° 23′ 31.20″');
    expect(d.facts[1]?.value).toBe('47.392000°');
  });

  it('1 rad', () => {
    const d = angleDisplay('1', 'rad');
    expect(d.headline).toBe('57° 17′ 44.81″');
    expect(d.detail).toBe(
      'In degrees, minutes and seconds. In decimal degrees, 57.295780°.',
    );
    expect(d.working).toMatch(/^1 rad × 180 ÷ π = 57\.295780°/);
  });

  it('a negative angle', () => {
    const d = angleDisplay('-12°30′', 'deg');
    expect(d.facts.map((f) => f.value)).toEqual([
      '-12° 30′ 0.00″',
      '-12.500000°',
      '-0.21816616 rad',
    ]);
    expect(d.working).toContain('45000.00″ (its size) = 12 × 3600″');
  });

  it('refuses in words', () => {
    expect(() => angleDisplay('12 75', 'deg')).toThrow(
      'Minutes have to be less than 60.',
    );
  });
});
