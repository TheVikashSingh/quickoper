import { describe, expect, it } from 'vitest';
import {
  formatSteps,
  patternDisplay,
  roundHalfEvenWhole,
  steps,
  type PatternInput,
} from '../../src/lib/calc/hole-pattern-display';

/**
 * What the bolt circle page prints, checked as strings.
 *
 * Expected values come from three places, each named where it is used:
 *
 *   - Omni Calculator's bolt circle page, worked example (retrieved
 *     2026-10-06, https://www.omnicalculator.com/math/bolt-circle): 5 holes,
 *     R = 50 mm, first hole at 0°, centre (0, 0). It prints every position to
 *     four decimals. The rule-3 third-party check for this module.
 *   - Exact identities: holes 60° apart are R apart, 90° apart R√2, 120°
 *     apart R√3; a hole on an axis has an exact 0.
 *   - An independent reference in 60-digit decimal arithmetic (Python, no
 *     IEEE doubles: Taylor-series sine and cosine, angles as exact fractions,
 *     half-even once to four places), run before this module existed. Every
 *     derived figure below was printed by it.
 */

const circle = (over: Partial<Extract<PatternInput, { kind: 'circle' }>>) =>
  patternDisplay({
    kind: 'circle',
    units: 'mm',
    diameter: 100,
    holes: 5,
    startDeg: 0,
    arcDeg: null,
    direction: 'ccw',
    centreX: 0,
    centreY: 0,
    ...over,
  });

const xy = (d: ReturnType<typeof patternDisplay>) => d.rows.map((r) => [r.x, r.y]);

describe("Omni Calculator's published example", () => {
  it('prints the five positions Omni prints, to the last digit', () => {
    expect(xy(circle({}))).toEqual([
      ['50.0000', '0.0000'],
      ['15.4508', '47.5528'],
      ['-40.4508', '29.3893'],
      ['-40.4508', '-29.3893'],
      ['15.4508', '-47.5528'],
    ]);
  });

  it('prints the angles Omni prints', () => {
    expect(circle({}).rows.map((r) => r.angle)).toEqual([
      '0.0000',
      '72.0000',
      '144.0000',
      '216.0000',
      '288.0000',
    ]);
  });
});

describe('moves are the differences of the positions as shown', () => {
  /**
   * The case that shows why. Holes 3 and 4 of Omni's pattern are a chord
   * apart, 100 × sin 36° = 58.7785 mm. But their shown Y figures, 29.3893 and
   * −29.3893, are each rounded on their own, and their difference is
   * −58.7786. Keyed in, a −58.7785 move would land a step off the position
   * the table shows; −58.7786 lands on it.
   */
  it('makes hole 3 to 4 a −58.7786 move though the chord is 58.7785', () => {
    const d = circle({});
    expect(d.rows[3]?.dy).toBe('-58.7786');
    expect(d.summary.find((s) => s.label === 'Chord')?.value).toBe('58.7785 mm');
  });

  it('runs the first move from the datum to hole 1', () => {
    const d = circle({ centreX: 10, centreY: -20 });
    expect([d.rows[0]?.dx, d.rows[0]?.dy]).toEqual(['60.0000', '-20.0000']);
  });

  it('adds up to every shown position exactly, over 500 holes', () => {
    for (const d of [
      circle({ holes: 500, diameter: 6, units: 'in' }),
      circle({ holes: 29, diameter: 77.777 }),
      circle({ holes: 36, diameter: 100, centreX: 12.3456, centreY: -7.891 }),
    ]) {
      let x = 0;
      let y = 0;
      for (const r of d.rows) {
        x += Math.round(Number(r.dx) * 10_000);
        y += Math.round(Number(r.dy) * 10_000);
        expect([x, y]).toEqual([r.xSteps, r.ySteps]);
      }
    }
  });

  /**
   * Why it matters, measured: moves rounded one at a time from the true
   * positions wander off the table. On 500 holes round a 6 in circle the walk
   * reaches 7 steps, 0.0007 in, from a shown position (the 60-digit
   * reference finds the same 7). The page's moves cannot wander at all.
   */
  it('beats separately rounded moves, which wander 0.0007 in over 500 holes', () => {
    const d = circle({ holes: 500, diameter: 6, units: 'in' });
    const radiusNm = 3 * 25_400_000;
    let worst = 0;
    let sumX = 0;
    let sumY = 0;
    let lastX = 0;
    let lastY = 0;
    d.rows.forEach((r, k) => {
      const angle = (2 * Math.PI * k) / 500;
      const x = radiusNm * Math.cos(angle);
      const y = radiusNm * Math.sin(angle);
      sumX += steps(x - lastX, 'in');
      sumY += steps(y - lastY, 'in');
      lastX = x;
      lastY = y;
      worst = Math.max(worst, Math.abs(sumX - r.xSteps), Math.abs(sumY - r.ySteps));
    });
    expect(worst).toBe(7);
  });
});

describe('exact identities, printed', () => {
  it.each([
    [6, '50.0000'],
    [4, '70.7107'],
    [3, '86.6025'],
  ])('%i holes on Ø100 give the identity chord %s', (holes, chord) => {
    expect(circle({ holes }).summary.find((s) => s.label === 'Chord')?.value).toBe(
      `${chord} mm`,
    );
  });

  it('prints a zero as 0.0000, never -0.0000', () => {
    const d = circle({ holes: 4 });
    expect(xy(d)).toEqual([
      ['50.0000', '0.0000'],
      ['0.0000', '50.0000'],
      ['-50.0000', '0.0000'],
      ['0.0000', '-50.0000'],
    ]);
    for (const r of d.rows) {
      expect(`${r.x} ${r.y} ${r.dx} ${r.dy}`).not.toContain('-0.0000');
    }
  });

  it('sends an exact tie to the even step: 25.00005 shows as 25.0000', () => {
    // D 100.0002 mm, 6 holes: hole 2's X is 25.00005 mm exactly. Through
    // Math.cos it would read 25.0001; the 60-digit reference says 25.0000.
    const d = circle({ holes: 6, diameter: 100.0002 });
    expect(xy(d).slice(0, 3)).toEqual([
      ['50.0001', '0.0000'],
      ['25.0000', '43.3014'],
      ['-25.0000', '43.3014'],
    ]);
  });

  /**
   * Rounded once, from the value as computed: the Android app's PR #58 bug.
   * 5 holes on Ø58.4 mm put hole 2 at Y = 27.770850276 mm. Rounded once that
   * is 27.7709. Rounded to a whole nanometre first, 27 770 850 nm, it becomes
   * an exact tie and goes to the even 27.7708. Found by searching with the
   * 60-digit reference for a value within half a nanometre of a half-step.
   */
  it('rounds once: 5 holes on Ø58.4 put hole 2 at Y 27.7709, not 27.7708', () => {
    const d = circle({ holes: 5, diameter: 58.4 });
    expect(d.rows[1]?.y).toBe('27.7709');
    expect(d.rows[4]?.y).toBe('-27.7709');
  });

  it('prints a hole at 45° with equal X and Y', () => {
    expect(xy(circle({ holes: 8 }))[1]).toEqual(['35.3553', '35.3553']);
  });
});

describe('the other settings, against the 60-digit reference', () => {
  it('spreads an arc over N − 1 spaces', () => {
    const d = circle({ holes: 5, arcDeg: 90 });
    expect(xy(d)).toEqual([
      ['50.0000', '0.0000'],
      ['46.1940', '19.1342'],
      ['35.3553', '35.3553'],
      ['19.1342', '46.1940'],
      ['0.0000', '50.0000'],
    ]);
    expect(d.summary.find((s) => s.label === 'Hole to hole')?.value).toBe('22.5°');
  });

  it('runs clockwise', () => {
    expect(xy(circle({ holes: 4, direction: 'cw' }))).toEqual([
      ['50.0000', '0.0000'],
      ['0.0000', '-50.0000'],
      ['-50.0000', '0.0000'],
      ['0.0000', '50.0000'],
    ]);
  });

  it('moves the whole pattern to its centre, step for step', () => {
    expect(xy(circle({ centreX: 10, centreY: -20 }))).toEqual([
      ['60.0000', '-20.0000'],
      ['25.4508', '27.5528'],
      ['-30.4508', '9.3893'],
      ['-30.4508', '-49.3893'],
      ['25.4508', '-67.5528'],
    ]);
  });

  it('works in inches', () => {
    const d = circle({ holes: 6, diameter: 6, units: 'in' });
    expect(xy(d).slice(0, 2)).toEqual([
      ['3.0000', '0.0000'],
      ['1.5000', '2.5981'],
    ]);
    expect(d.summary.find((s) => s.label === 'Chord')?.value).toBe('3.0000 in');
    expect(d.csv[0]).toEqual(['hole', 'angle_deg', 'x_in', 'y_in', 'dx_in', 'dy_in']);
  });
});

describe('grids, as printed', () => {
  const grid = (over: Partial<Extract<PatternInput, { kind: 'grid' }>>) =>
    patternDisplay({
      kind: 'grid',
      units: 'mm',
      columns: 2,
      rows: 2,
      spacingX: 10,
      spacingY: 10,
      turnDeg: 0,
      firstX: 0,
      firstY: 0,
      ...over,
    });

  it('turns about the first hole: 30°', () => {
    expect(xy(grid({ turnDeg: 30 }))).toEqual([
      ['0.0000', '0.0000'],
      ['8.6603', '5.0000'],
      ['-5.0000', '8.6603'],
      ['3.6603', '13.6603'],
    ]);
  });

  it('places from its first hole and moves from the datum', () => {
    const d = grid({ columns: 3, rows: 2, spacingY: 20, firstX: 5, firstY: 5 });
    expect(d.rows.map((r) => [r.column, r.row, r.x, r.y, r.dx, r.dy])).toEqual([
      [1, 1, '5.0000', '5.0000', '5.0000', '5.0000'],
      [2, 1, '15.0000', '5.0000', '10.0000', '0.0000'],
      [3, 1, '25.0000', '5.0000', '10.0000', '0.0000'],
      [1, 2, '5.0000', '25.0000', '-20.0000', '20.0000'],
      [2, 2, '15.0000', '25.0000', '10.0000', '0.0000'],
      [3, 2, '25.0000', '25.0000', '10.0000', '0.0000'],
    ]);
    expect(d.csv[0]).toEqual(['hole', 'column', 'row', 'x_mm', 'y_mm', 'dx_mm', 'dy_mm']);
  });
});

/**
 * Gate 7: the Android core, written separately from the same spec, asserts
 * these figures in its own test (`machinist-calc-app` HolePatternTest:
 * aGridTurned30Degrees, aCentreMovesTheCircle). This module was written
 * before they were read, and agrees.
 */
describe('the Android core prints the same', () => {
  it('turns a 3 × 2 grid, 10 by 20, through 30°', () => {
    const d = patternDisplay({
      kind: 'grid',
      units: 'mm',
      columns: 3,
      rows: 2,
      spacingX: 10,
      spacingY: 20,
      turnDeg: 30,
      firstX: 0,
      firstY: 0,
    });
    expect(xy(d).slice(1)).toEqual([
      ['8.6603', '5.0000'],
      ['17.3205', '10.0000'],
      ['-10.0000', '17.3205'],
      ['-1.3397', '22.3205'],
      ['7.3205', '27.3205'],
    ]);
  });

  it('centres four holes on Ø100 at X 100, Y −50', () => {
    expect(xy(circle({ holes: 4, centreX: 100, centreY: -50 }))).toEqual([
      ['150.0000', '-50.0000'],
      ['100.0000', '0.0000'],
      ['50.0000', '-50.0000'],
      ['100.0000', '-100.0000'],
    ]);
  });
});

describe('the working substitutes real figures', () => {
  it('works hole 2 of the Omni pattern out loud', () => {
    const w = circle({}).working;
    expect(w).toContain('pitch = 360° / 5 = 72°');
    expect(w).toContain('X = 0 + 50 × cos 72° = 15.4508 mm');
    expect(w).toContain('Y = 0 + 50 × sin 72° = 47.5528 mm');
    expect(w).toContain('chord = D × sin(pitch / 2) = 100 × sin 36° = 58.7785 mm');
  });

  it('says which way it turns', () => {
    expect(circle({ direction: 'cw' }).working).toContain('clockwise from 3 o');
    expect(circle({ arcDeg: 90 }).working).toContain(
      'pitch = arc / (N − 1) = 90° / 4 = 22.5°',
    );
  });

  it('uses no fraction slash anywhere', () => {
    expect(circle({}).working).not.toContain('⁄');
  });
});

describe('the rounding helpers', () => {
  it('rounds half to even, exactly, both signs', () => {
    expect(
      [0.5, 1.5, 2.5, -0.5, -1.5, -2.5, 2.4999, -2.5001].map(roundHalfEvenWhole),
    ).toEqual([0, 2, 2, 0, -2, -2, 2, -3]);
    expect(Object.is(roundHalfEvenWhole(-0.4), 0)).toBe(true);
  });

  it('prints whole steps at four places', () => {
    expect([0, 1, -1, 123_456, -500_000].map(formatSteps)).toEqual([
      '0.0000',
      '0.0001',
      '-0.0001',
      '12.3456',
      '-50.0000',
    ]);
  });
});
