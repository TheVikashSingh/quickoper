import { describe, expect, it } from 'vitest';
import { triangleDisplay, type TriangleInput } from '../../src/lib/calc/triangle-display';

/**
 * What the triangle page prints, checked as strings: the table, which parts
 * were given, the headline, the note on two triangles, the working and the
 * drawing's corners.
 *
 * Expected values: the 3-4-5 triangle (36.8699° is atan(3/4) = 36.86989…°),
 * the research spec's SSA a 6, b 8, α 30° (c 11.4003 or 2.4561, β 41.8103°
 * as asin(2/3)), and Maths is Fun's ASA A 76°, B 34°, c 9 (a 9.29, b 5.36).
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

describe('a right triangle', () => {
  const d = show({ mode: 'right', a: '3', b: '4' });

  it('heads with the side found, and marks what was given', () => {
    expect(d.headline).toBe('c = 5.0000 mm');
    expect(d.detail).toBe(
      'A right triangle, γ = 90°. Two sides and the angle between them (SAS).',
    );
    expect(d.triangles[0]?.rows).toEqual([
      { name: 'a', value: '3.0000 mm', given: true },
      { name: 'b', value: '4.0000 mm', given: true },
      { name: 'c', value: '5.0000 mm', given: false },
      { name: 'α', value: '36.8699°', given: false },
      { name: 'β', value: '53.1301°', given: false },
      { name: 'γ', value: '90.0000°', given: true },
    ]);
    expect(d.triangles[0]?.area).toBe('6.0000 mm²');
    expect(d.note).toBeNull();
  });

  it('works the third side by the law of cosines, as printed', () => {
    expect(d.working).toContain(
      [
        'c² = a² + b² − 2ab × cos γ',
        '   = 3² + 4² − 2 × 3 × 4 × cos 90°',
        'c  = 5.0000 mm',
      ].join('\n'),
    );
    expect(d.working).toContain(
      'Area = ½ × a × b × sin γ = ½ × 3 × 4 × sin 90° = 6.0000 mm²',
    );
  });

  it('draws it to scale, A at the origin and c along x, with the right angle marked', () => {
    const f = d.triangles[0]?.figure;
    expect(f?.right).toBe(true);
    expect(f?.points[0]).toEqual([0, 0]);
    expect(f?.points[1]).toEqual([5, 0]);
    expect(f?.points[2][0]).toBeCloseTo(3.2, 12);
    expect(f?.points[2][1]).toBeCloseTo(2.4, 12);
  });

  it('in inches, and a side typed as a fraction', () => {
    const i = show({ mode: 'right', units: 'in', a: '3/8', b: '1/2' });
    expect(i.headline).toBe('c = 0.6250 in');
    expect(i.triangles[0]?.area).toBe('0.0938 in²');
  });
});

describe('two triangles', () => {
  const d = show({ a: '6', b: '8', alpha: '30' });

  it('shows both, says why, and works both', () => {
    expect(d.headline).toBe('Two triangles fit');
    expect(d.triangles.map((t) => t.rows[2]?.value)).toEqual(['11.4003 mm', '2.4561 mm']);
    expect(d.note).toMatch(/^Two sides and an angle not between them can close two ways/);
    expect(d.working).toContain('sin β = b × sin α ÷ a = 8 × sin 30° ÷ 6 = 0.66666667');
    expect(d.working).toContain(
      'β = 41.8103°, or 180° − 41.8103° = 138.1897°: both fit, so two triangles.',
    );
    expect(d.working).toContain('Triangle 2: γ = 180° − α − β = 11.8103°');
  });

  it('one, when the other value leaves no room', () => {
    const one = show({ a: '8', b: '6', alpha: '30' });
    expect(one.triangles).toHaveLength(1);
    expect(one.working).toContain('leaves no room for γ: one triangle.');
  });
});

describe('two angles and a side', () => {
  it('the third angle from 180°, then the sides', () => {
    const d = show({ alpha: '76', beta: '34', c: '9' });
    expect(d.headline).toBe('a = 9.2931 mm');
    expect(d.working).toContain('γ = 180° − α − β = 70°');
    expect(d.working).toContain(
      'a = c × sin α ÷ sin γ = 9 × sin 76° ÷ sin 70° = 9.2931 mm',
    );
    expect(d.triangles[0]?.rows.map((r) => r.given)).toEqual([
      false,
      false,
      true,
      true,
      true,
      false,
    ]);
  });
});

describe('an angle typed in degrees and minutes', () => {
  it('30 15 is 30.25°', () => {
    const d = show({ a: '10', b: '10', gamma: '30 15' });
    expect(d.triangles[0]?.rows[5]?.value).toBe('30.2500°');
  });
});
