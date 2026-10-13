import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { triangleDisplay, type TriangleInput } from '../../src/lib/calc/triangle-display';
import { solveTriangle } from '../../src/lib/calc/triangle';

/**
 * Triangles from three parts, checked as the figures the page prints.
 *
 * Expected values come from four places, each named where it is used:
 *
 *   - Maths is Fun (mathsisfun.com, retrieved 2026-10-13), a worked example
 *     of every case, printed to one or two decimals: "Solving SSS
 *     Triangles", "Solving SAS Triangles", "Solving ASA Triangles", "Solving
 *     AAS Triangles", "Solving SSA Triangles", "Finding a Side in a Right
 *     Triangle", "Finding an Angle in a Right Triangle" and "Area of
 *     Triangles", under https://www.mathsisfun.com/algebra/. Each is matched
 *     at the precision it prints.
 *   - The research spec's golden values (`machinist-calc-research`
 *     03-spec/calculations.md, "Triangles"), which the Android core's tests
 *     also hold.
 *   - Ties built on purpose, with the arithmetic in each test.
 *   - `tests/fixtures/triangle-reference.csv`: 3234 triangles solved to 60
 *     digits by `tests/fixtures/triangle-reference.py`.
 */

const blank: TriangleInput = {
  mode: 'any',
  units: 'mm',
  a: '',
  b: '',
  c: '',
  alpha: '',
  beta: '',
  gamma: '',
};
const show = (over: Partial<TriangleInput>) => triangleDisplay({ ...blank, ...over });

/** The figure printed for one part, without its unit. */
const part = (over: Partial<TriangleInput>, name: string, n = 0): number => {
  const row = show(over).triangles[n]?.rows.find((r) => r.name === name);
  return Number((row?.value ?? 'NaN').replace(/[^0-9.-]/g, ''));
};
/** Rounded as the published page prints it. */
const at = (x: number, places: number): string => x.toFixed(places);

describe('Maths is Fun', () => {
  it('SSS: a 8, b 6, c 7 is A 75.5224…°, B 46.5674…°, C 57.9°', () => {
    const t = { a: '8', b: '6', c: '7' };
    // Printed truncated, "75.5224...": the value is 75.52248…, shown 75.5225.
    expect(part(t, 'α')).toBe(75.5225);
    expect(part(t, 'β')).toBe(46.5675);
    expect(at(part(t, 'γ'), 1)).toBe('57.9');
  });

  it('SSS: x 5.1, y 7.9, z 3.5 is X 28.3881…°, Y 132.5684…°, Z 19.0°', () => {
    const t = { a: '5.1', b: '7.9', c: '3.5' };
    // Printed truncated: X is 28.38816…° and Y 132.56846…°, so 28.3882 and
    // 132.5685 to four places.
    expect(part(t, 'α')).toBe(28.3882);
    expect(part(t, 'β')).toBe(132.5685);
    expect(at(part(t, 'γ'), 1)).toBe('19.0');
  });

  it('SSS: a 11.6, b 15.2, c 7.4 is B 104.1°, C 28.2° — and A 47.8°, not their 47.7°', () => {
    const t = { a: '11.6', b: '15.2', c: '7.4' };
    expect(at(part(t, 'β'), 1)).toBe('104.1');
    expect(at(part(t, 'γ'), 1)).toBe('28.2');
    // Maths is Fun takes A as 180° − 104.1° − 28.2°, from figures already
    // rounded to one place, and prints 47.7°. Unrounded, cos A = (15.2² +
    // 7.4² − 11.6²) ÷ (2 × 15.2 × 7.4) = 151.24 ÷ 224.96 = 0.67230…, so A is
    // 47.7554°, 47.8° to one place: the difference the page's prose explains.
    expect(part(t, 'α')).toBe(47.7554);
    expect(at(part(t, 'α'), 1)).toBe('47.8');
  });

  it('SAS: A 49°, b 5, c 7 is a 5.30, B 45.4°, C 85.6°', () => {
    const t = { alpha: '49', b: '5', c: '7' };
    expect(at(part(t, 'a'), 2)).toBe('5.30');
    expect(at(part(t, 'β'), 1)).toBe('45.4');
    expect(at(part(t, 'γ'), 1)).toBe('85.6');
  });

  it('SAS: 6.9 and 2.6 at 117° is 8.41, with 47.0° and 16.0°', () => {
    // P is opposite 6.9 and Q opposite 2.6, the included angle R 117°.
    const t = { a: '6.9', b: '2.6', gamma: '117' };
    expect(at(part(t, 'c'), 2)).toBe('8.41');
    expect(at(part(t, 'α'), 1)).toBe('47.0');
    expect(at(part(t, 'β'), 1)).toBe('16.0');
  });

  it('ASA: A 76°, B 34°, c 9 is C 70°, a 9.29, b 5.36', () => {
    const t = { alpha: '76', beta: '34', c: '9' };
    expect(part(t, 'γ')).toBe(70);
    expect(at(part(t, 'a'), 2)).toBe('9.29');
    expect(at(part(t, 'b'), 2)).toBe('5.36');
    expect(show(t).detail).toBe('Two angles and the side between them (ASA).');
  });

  it('ASA: 87° and 42° about x 18.9 is X 51°, y 24.29, z 16.27', () => {
    const t = { beta: '87', gamma: '42', a: '18.9' };
    expect(part(t, 'α')).toBe(51);
    expect(at(part(t, 'b'), 2)).toBe('24.29');
    expect(at(part(t, 'c'), 2)).toBe('16.27');
  });

  it('AAS: A 35°, C 62°, c 7 is B 83°, a 4.55, b 7.87', () => {
    const t = { alpha: '35', gamma: '62', c: '7' };
    expect(part(t, 'β')).toBe(83);
    expect(at(part(t, 'a'), 2)).toBe('4.55');
    expect(at(part(t, 'b'), 2)).toBe('7.87');
    expect(show(t).detail).toBe('Two angles and a side not between them (AAS).');
  });

  it('AAS: C 41°, B 105°, b 12.6 is A 34°, c 8.56, a 7.29', () => {
    const t = { gamma: '41', beta: '105', b: '12.6' };
    expect(part(t, 'α')).toBe(34);
    expect(at(part(t, 'c'), 2)).toBe('8.56');
    expect(at(part(t, 'a'), 2)).toBe('7.29');
  });

  it('SSA: B 31°, b 8, c 13 is two triangles', () => {
    const t = { beta: '31', b: '8', c: '13' };
    expect(show(t).triangles).toHaveLength(2);
    expect([
      at(part(t, 'γ', 0), 1),
      at(part(t, 'α', 0), 1),
      at(part(t, 'a', 0), 2),
    ]).toEqual(['56.8', '92.2', '15.52']);
    expect([
      at(part(t, 'γ', 1), 1),
      at(part(t, 'α', 1), 1),
      at(part(t, 'a', 1), 2),
    ]).toEqual(['123.2', '25.8', '6.76']);
  });

  it('SSA: M 125°, m 12.4, l 7.6 is one triangle, L 30.1°, N 24.9°, n 6.36', () => {
    const t = { alpha: '125', a: '12.4', b: '7.6' };
    expect(show(t).triangles).toHaveLength(1);
    expect(at(part(t, 'β'), 1)).toBe('30.1');
    expect(at(part(t, 'γ'), 1)).toBe('24.9');
    expect(at(part(t, 'c'), 2)).toBe('6.36');
  });

  it('SSA: A 35°, a 4, c 9 has none: sin C would be 1.29', () => {
    expect(() => show({ alpha: '35', a: '4', c: '9' })).toThrow('No triangle fits');
  });

  it.each([
    // [what is given, the part found, the figure printed]
    [
      'hypotenuse 30 at 39°: the opposite side 18.88',
      { c: '30', alpha: '39' },
      'a',
      2,
      '18.88',
    ],
    [
      'hypotenuse 1000, 60° at the top: the adjacent side 500',
      { c: '1000', alpha: '60' },
      'b',
      0,
      '500',
    ],
    [
      'adjacent 7 at 53°: the opposite side 9.29',
      { b: '7', alpha: '53' },
      'a',
      2,
      '9.29',
    ],
    ['opposite 70 at 68°: the hypotenuse 75.5', { a: '70', alpha: '68' }, 'c', 1, '75.5'],
    ['opposite 2.5, hypotenuse 5: 30°', { a: '2.5', c: '5' }, 'α', 0, '30'],
    ['opposite 300, adjacent 400: 36.9°', { a: '300', b: '400' }, 'α', 1, '36.9'],
    ['adjacent 6750, hypotenuse 8100: 33.6°', { b: '6750', c: '8100' }, 'α', 1, '33.6'],
  ] as const)('right triangle: %s', (_, given, name, places, want) => {
    expect(at(part({ mode: 'right', ...given }, name), places)).toBe(want);
  });

  it('area: a 7, b 10 about C 25° is 14.8', () => {
    const area = show({ a: '7', b: '10', gamma: '25' }).triangles[0]?.area;
    expect(area).toBe('14.7916 mm²');
  });

  it('area: a 231, c 150 about B 123° is 14,530 (metres there, millimetres here)', () => {
    const area = show({ a: '231', c: '150', beta: '123' }).triangles[0]?.area ?? '';
    expect(Math.round(Number(area.replace(' mm²', '')))).toBe(14530);
  });
});

describe("the spec's golden values", () => {
  const rows = (over: Partial<TriangleInput>, n = 0) =>
    show(over).triangles[n]?.rows.map((r) => r.value);

  it('3-4-5 and 5-12-13', () => {
    expect(rows({ mode: 'right', a: '3', b: '4' })).toEqual([
      '3.0000 mm',
      '4.0000 mm',
      '5.0000 mm',
      '36.8699°',
      '53.1301°',
      '90.0000°',
    ]);
    expect(part({ mode: 'right', a: '5', b: '12' }, 'c')).toBe(13);
  });

  it('1 : √3 : 2 and 1 : 1 : √2', () => {
    expect(rows({ mode: 'right', a: '1', c: '2' })).toEqual([
      '1.0000 mm',
      '1.7321 mm',
      '2.0000 mm',
      '30.0000°',
      '60.0000°',
      '90.0000°',
    ]);
    expect(rows({ mode: 'right', a: '1', b: '1' })?.slice(2)).toEqual([
      '1.4142 mm',
      '45.0000°',
      '45.0000°',
      '90.0000°',
    ]);
  });

  it('equilateral: 60° each', () => {
    expect(rows({ a: '2', b: '2', c: '2' })?.slice(3)).toEqual([
      '60.0000°',
      '60.0000°',
      '60.0000°',
    ]);
  });

  it('SAS a 5, b 7, γ 60° gives c = √39 = 6.2450', () => {
    expect(part({ a: '5', b: '7', gamma: '60' }, 'c')).toBe(6.245);
  });

  it('SSA a 6, b 8, α 30° gives two triangles, c 11.4003 or 2.4561', () => {
    const t = { a: '6', b: '8', alpha: '30' };
    expect(show(t).headline).toBe('Two triangles fit');
    expect(part(t, 'c', 0)).toBe(11.4003);
    expect(part(t, 'c', 1)).toBe(2.4561);
  });

  it('the right angle hidden in SSA: a 4, b 8, α 30° is one triangle, β exactly 90°', () => {
    const t = { a: '4', b: '8', alpha: '30' };
    expect(show(t).triangles).toHaveLength(1);
    expect(rows(t)?.slice(2)).toEqual(['6.9282 mm', '30.0000°', '90.0000°', '60.0000°']);
    expect(show(t).working).toContain('sin β is exactly 1, so β = 90°');
  });
});

describe('exact where a tie can happen', () => {
  it('a hypotenuse exactly halfway: legs 0.00009 and 0.00012 mm are c = 0.00015, to the even 0.0002', () => {
    expect(part({ mode: 'right', a: '0.00009', b: '0.00012' }, 'c')).toBe(0.0002);
    // And 0.00003 / 0.00004 is c = 0.00005, to the even 0.0000.
    expect(part({ mode: 'right', a: '0.00003', b: '0.00004' }, 'c')).toBe(0);
  });

  it('a leg exactly halfway, from the hypotenuse: 0.00039 and 0.00036 give 0.00015', () => {
    expect(part({ mode: 'right', b: '0.00036', c: '0.00039' }, 'a')).toBe(0.0002);
  });

  it('a side from sin 30°: c 0.0003 at α 30° is a = 0.00015 exactly, to 0.0002', () => {
    // In floating point 300 × sin 30° is 149.99999999999997 nm, which would
    // round down to 0.0001.
    expect(part({ mode: 'right', c: '0.0003', alpha: '30' }, 'a')).toBe(0.0002);
  });

  it('SAS at 60° with equal sides is equilateral: 0.00015 to the even 0.0002', () => {
    expect(part({ a: '0.00015', b: '0.00015', gamma: '60' }, 'c')).toBe(0.0002);
  });

  it('an area exactly halfway: legs 0.02 and 0.03 at 30° are 0.00015 mm², to 0.0002', () => {
    // ½ × 20 000 × 30 000 × ½ nm² = 1.5 × 10⁸ nm²; in floating point sin 30°
    // is 0.49999999999999994 and the area would round down.
    expect(show({ a: '0.02', b: '0.03', gamma: '30' }).triangles[0]?.area).toBe(
      '0.0002 mm²',
    );
  });

  it("Heron's formula exactly: 0.015, 0.02, 0.025 mm is 0.00015 mm², to 0.0002", () => {
    expect(show({ a: '0.015', b: '0.02', c: '0.025' }).triangles[0]?.area).toBe(
      '0.0002 mm²',
    );
  });

  it('SSA at 60°: a 0.00035, b 0.0004 is c = 0.00025 or 0.00015 exactly, both to the even 0.0002', () => {
    // (7, 8, 5) and (7, 8, 3) are 60° triangles; scaled by 50 nm both third
    // sides end in 50 nm. Worked by the law of sines in floating point they
    // come out 250.00000000000006 and 149.99999999999997 nm, 0.0003 and 0.0001.
    const t = { a: '0.00035', b: '0.0004', alpha: '60' };
    expect(part(t, 'c', 0)).toBe(0.0002);
    expect(part(t, 'c', 1)).toBe(0.0002);
  });

  it("Heron's formula where floating point misses: 0.035, 0.075, 0.1 mm is 0.00105 mm², to 0.0010", () => {
    // (7, 15, 20) has area 42; scaled by 5000 nm it is 1.05 × 10⁹ nm²,
    // exactly halfway. ½ab sin C in floating point is 1050000000.0000002.
    expect(show({ a: '0.035', b: '0.075', c: '0.1' }).triangles[0]?.area).toBe(
      '0.0010 mm²',
    );
  });

  it('the third angle from two given ones is exact', () => {
    const s = solveTriangle({
      sides: [null, null, 9_000_000],
      angles: [
        { num: 7_600_001n, den: 100_000n },
        { num: 3_399_999n, den: 100_000n },
        null,
      ],
    });
    expect(s.triangles[0]?.angles[2].exact).toEqual({
      num: 700_000_000_000n,
      den: 10_000_000_000n,
    });
  });
});

describe('what it refuses, in words', () => {
  it.each([
    [{ a: '3', b: '4' }, 'Enter exactly three of the six'],
    [{ a: '3', b: '4', c: '5', alpha: '30' }, 'Enter exactly three of the six'],
    [{ alpha: '30', beta: '60', gamma: '90' }, 'enter at least one side'],
    [{ a: '1', b: '2', c: '3' }, 'These sides do not close'],
    [{ a: '1', alpha: '100', beta: '80' }, 'add up to less than 180°'],
    [{ a: '1', alpha: '180', beta: '1' }, 'more than 0° and less than 180°'],
    [{ a: '0', b: '1', c: '1' }, 'Side a has to be more than zero.'],
    [{ a: 'x', b: '1', c: '1' }, 'Side a: Enter the length as a decimal'],
    [
      { a: '5', b: '6', alpha: '100' },
      'the side opposite a right or obtuse angle has to be the longest',
    ],
    [{ mode: 'right', a: '3' }, 'Enter two of a, b, c, α and β'],
    [{ mode: 'right', alpha: '30', beta: '60' }, 'Enter two of a, b, c, α and β'],
    [{ mode: 'right', a: '5', c: '4' }, 'The hypotenuse c is the longest side'],
    [{ mode: 'right', a: '5', alpha: '90' }, 'α and β are each less than 90°'],
  ] as const)('%j', (over, words) => {
    expect(() => show(over as Partial<TriangleInput>)).toThrow(words);
  });
});

describe('the 60-digit reference', () => {
  const rows = readFileSync(
    new URL('../fixtures/triangle-reference.csv', import.meta.url),
    'utf8',
  )
    .trim()
    .split('\n')
    .slice(1)
    .map((line) => line.split(','));
  const mm = (nm: string): string =>
    nm === ''
      ? ''
      : `${Math.floor(Number(nm) / 1e6)}.${String(Number(nm) % 1e6).padStart(6, '0')}`;

  it('holds 3234 triangles, every case, with none, one and two that fit', () => {
    expect(rows.length).toBe(3234);
    expect(new Set(rows.map((r) => r[6]))).toEqual(new Set(['0', '1', '2']));
  });

  it('every one prints the same figures', () => {
    const wrong: string[] = [];
    for (const [a, b, c, alpha, beta, gamma, n, first, second] of rows) {
      const input = {
        a: mm(a ?? ''),
        b: mm(b ?? ''),
        c: mm(c ?? ''),
        alpha: alpha ?? '',
        beta: beta ?? '',
        gamma: gamma ?? '',
      };
      let got: string[];
      try {
        got = show(input).triangles.map((t) =>
          [...t.rows.map((r) => r.value), t.area]
            .map((v) => v.split(' ')[0]?.replace('°', ''))
            .join(' '),
        );
      } catch {
        got = [];
      }
      const want = [first, second].filter((x) => x !== undefined && x !== '');
      if (String(got.length) !== n || got.join('|') !== want.join('|')) {
        wrong.push(`${JSON.stringify(input)}: ${got.join('|')} != ${want.join('|')}`);
      }
    }
    expect(wrong.slice(0, 10)).toEqual([]);
  });
});
