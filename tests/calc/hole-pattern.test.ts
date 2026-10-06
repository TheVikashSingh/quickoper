import { describe, expect, it } from 'vitest';
import {
  boltCircle,
  holeGrid,
  MAX_HOLES,
  type BoltCircleInput,
} from '../../src/lib/calc/hole-pattern';

/**
 * Hole positions, before any rounding.
 *
 * Expected values here are exact identities of the geometry, not figures we
 * computed and then wrote down: holes 60° apart are exactly R apart, 90°
 * apart R√2, 120° apart R√3 (`machinist-calc-research` 03-spec/
 * calculations.md §6), and a hole at a multiple of 90° sits exactly on an
 * axis. The published third-party check, Omni Calculator's worked example,
 * is in `hole-pattern-display.test.ts`, because what it publishes is the
 * four-decimal figures.
 */

const MM = 1_000_000;

const circle = (over: Partial<BoltCircleInput>): ReturnType<typeof boltCircle> =>
  boltCircle({
    diameterNm: 100 * MM,
    holes: 6,
    startDeg: 0,
    arcDeg: null,
    direction: 'ccw',
    centreXNm: 0,
    centreYNm: 0,
    ...over,
  });

describe('a whole circle', () => {
  it('starts at 3 o’clock and runs counterclockwise', () => {
    const { holes } = circle({ holes: 4 });
    expect(holes.map((h) => [h.xNm, h.yNm])).toEqual([
      [50 * MM, 0],
      [0, 50 * MM],
      [-50 * MM, 0],
      [0, -50 * MM],
    ]);
  });

  it('runs clockwise when asked, from the same first hole', () => {
    const { holes } = circle({ holes: 4, direction: 'cw' });
    expect(holes.map((h) => [h.xNm, h.yNm])).toEqual([
      [50 * MM, 0],
      [0, -50 * MM],
      [-50 * MM, 0],
      [0, 50 * MM],
    ]);
    expect(holes.map((h) => h.angleDeg)).toEqual([0, 270, 180, 90]);
  });

  // Identities: a chord of 60° is the radius, of 90° R√2, of 120° R√3.
  it.each([
    [6, 50 * MM],
    [4, 50 * MM * Math.SQRT2],
    [3, 50 * MM * Math.sqrt(3)],
  ])('%i holes are the identity chord apart', (holes, chord) => {
    expect(circle({ holes }).chordNm).toBeCloseTo(chord, 3);
  });

  it('makes six holes exactly one radius apart, not nearly', () => {
    // sin 30° is 1/2 exactly by the table, so the chord is not 49999999.99…
    expect(circle({ holes: 6 }).chordNm).toBe(50 * MM);
    expect(circle({ holes: 6 }).pitchDeg).toBe(60);
  });

  it('takes the start angle modulo a whole turn', () => {
    const a = circle({ holes: 5, startDeg: 40 });
    const b = circle({ holes: 5, startDeg: 400 });
    const c = circle({ holes: 5, startDeg: -320 });
    expect(b.holes).toEqual(a.holes);
    expect(c.holes).toEqual(a.holes);
  });

  it('places one hole on its own, with no pitch and no chord', () => {
    const one = circle({ holes: 1, startDeg: 90 });
    expect(one.holes).toHaveLength(1);
    expect([one.holes[0]?.xNm, one.holes[0]?.yNm]).toEqual([0, 50 * MM]);
    expect(one.pitchDeg).toBeNull();
    expect(one.chordNm).toBeNull();
  });
});

describe('a partial arc', () => {
  it('spreads N holes over N − 1 spaces, first hole to last', () => {
    // Five holes over 90° are 22.5° apart, not 18°, and the last sits at 90°.
    const arc = circle({ holes: 5, arcDeg: 90 });
    expect(arc.pitchDeg).toBe(22.5);
    expect(arc.holes.map((h) => h.angleDeg)).toEqual([0, 22.5, 45, 67.5, 90]);
    expect([arc.holes[4]?.xNm, arc.holes[4]?.yNm]).toEqual([0, 50 * MM]);
  });

  it('refuses a 360° arc, which puts the last hole on the first', () => {
    expect(() => circle({ arcDeg: 360 })).toThrow(/360° arc puts the last hole/);
    expect(() => circle({ arcDeg: 400 })).toThrow(/360° arc puts the last hole/);
  });

  it('refuses an arc of zero or less', () => {
    expect(() => circle({ arcDeg: 0 })).toThrow(/must be more than 0°/);
    expect(() => circle({ arcDeg: -90 })).toThrow(/must be more than 0°/);
  });
});

/**
 * Exact where it can matter: Niven's theorem.
 *
 * The only rational sines and cosines of a rational number of degrees are 0,
 * ±1/2 and ±1, so only multiples of 30° can put a hole EXACTLY on a rounding
 * tie, and those come from a table. Math.cos(60°) is 0.5000000000000001.
 */
describe('exact angles', () => {
  it('puts hole 2 of 6 at exactly half the radius in X', () => {
    // D 100.0002 mm: R = 50.0001 mm, so hole 2's X is 25.00005 mm exactly.
    const { holes } = circle({ diameterNm: 100_000_200, holes: 6 });
    expect(holes[1]?.xNm).toBe(25_000_050);
    // What the float would have given instead: just over the tie.
    expect(50_000_100 * Math.cos(Math.PI / 3)).toBeGreaterThan(25_000_050);
  });

  it('gives a hole at 45° exactly equal X and Y', () => {
    // Math.cos(π/4) and Math.sin(π/4) differ in their last bit.
    expect(Math.cos(Math.PI / 4)).not.toBe(Math.sin(Math.PI / 4));
    const { holes } = circle({ holes: 8 });
    expect(holes[1]?.xNm).toBe(holes[1]?.yNm);
  });

  it('keeps an arc’s angles exact, so 60° is never 59.99999999999999', () => {
    // 100° over 5 spaces is 20° a step: hole 4 is at 60° exactly, so its X
    // is exactly half the radius, from the table.
    const { holes } = circle({ holes: 6, arcDeg: 100 });
    expect(holes[3]?.angleDeg).toBe(60);
    expect(holes[3]?.xNm).toBe(25 * MM);
  });
});

describe('the centre moves the whole pattern', () => {
  it('adds the centre to every hole, exactly', () => {
    const at0 = circle({ holes: 5 });
    const moved = circle({ holes: 5, centreXNm: 10 * MM, centreYNm: -20 * MM });
    moved.holes.forEach((h, i) => {
      expect(h.xNm).toBe((at0.holes[i]?.xNm ?? NaN) + 10 * MM);
      expect(h.yNm).toBe((at0.holes[i]?.yNm ?? NaN) - 20 * MM);
    });
    expect(moved.chordNm).toBe(at0.chordNm);
  });
});

describe('a bolt circle refuses what it cannot place', () => {
  it.each([
    [{ holes: 0 }, /from 1 to 500/],
    [{ holes: MAX_HOLES + 1 }, /from 1 to 500/],
    [{ holes: 2.5 }, /whole number of holes/],
    [{ diameterNm: 0 }, /more than zero/],
    [{ diameterNm: -5 * MM }, /more than zero/],
    [{ startDeg: Number.NaN }, /start angle/],
    [{ centreXNm: 100_000 * MM }, /more than 100 m/],
  ] as const)('refuses %o', (over, message) => {
    expect(() => circle(over)).toThrow(message);
  });

  it('refuses a circle whose far side passes 100 m, by the triangle inequality', () => {
    // Centre 99.99 m out, radius 50 mm: the far side is 100.04 m away.
    expect(() => circle({ centreXNm: 99_990 * MM })).toThrow(/more than 100 m/);
    expect(() => circle({ centreXNm: 99_900 * MM })).not.toThrow();
  });
});

describe('a grid', () => {
  const grid = (over: Partial<Parameters<typeof holeGrid>[0]>) =>
    holeGrid({
      columns: 3,
      rows: 2,
      spacingXNm: 10 * MM,
      spacingYNm: 20 * MM,
      turnDeg: 0,
      firstXNm: 5 * MM,
      firstYNm: 5 * MM,
      ...over,
    });

  it('numbers its holes row by row from the first', () => {
    const holes = grid({});
    expect(holes.map((h) => [h.n, h.column, h.row, h.xNm / MM, h.yNm / MM])).toEqual([
      [1, 0, 0, 5, 5],
      [2, 1, 0, 15, 5],
      [3, 2, 0, 25, 5],
      [4, 0, 1, 5, 25],
      [5, 1, 1, 15, 25],
      [6, 2, 1, 25, 25],
    ]);
  });

  it('turns about its first hole, exactly at a right angle', () => {
    // Turned 90°: a step along the row goes up Y, a step up a column goes −X.
    const holes = grid({
      columns: 2,
      rows: 2,
      spacingYNm: 10 * MM,
      turnDeg: 90,
      firstXNm: 0,
      firstYNm: 0,
    });
    expect(holes.map((h) => [h.xNm / MM, h.yNm / MM])).toEqual([
      [0, 0],
      [0, 10],
      [-10, 0],
      [-10, 10],
    ]);
  });

  it.each([
    [{ columns: 0 }, /at most 500 holes/],
    [{ columns: 26, rows: 20 }, /at most 500 holes/],
    [{ spacingXNm: 0 }, /X spacing cannot be zero/],
    [{ spacingYNm: 0 }, /Y spacing cannot be zero/],
    [{ spacingXNm: -10 * MM }, /cannot be negative/],
    [{ firstXNm: 100_000 * MM }, /more than 100 m/],
  ] as const)('refuses %o', (over, message) => {
    expect(() => grid(over)).toThrow(message);
  });

  it('allows a zero spacing where there is only one column or row', () => {
    expect(grid({ columns: 1, spacingXNm: 0 })).toHaveLength(2);
    expect(grid({ rows: 1, spacingYNm: 0 })).toHaveLength(3);
  });
});
