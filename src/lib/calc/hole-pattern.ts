/**
 * Hole patterns: bolt circles, partial arcs and turned grids.
 *
 * ─── What this is, and what it is not ───────────────────────────────────────
 *
 * Geometry, not a standard. A hole on a circle of radius R at angle θ sits at
 *
 *     X = Xc + R × cos θ        Y = Yc + R × sin θ
 *     θ = θ0 ± (n − 1) × pitch
 *     pitch = 360° / N          (a whole circle)
 *           = arc / (N − 1)     (a partial arc, first hole to last)
 *     chord = D × sin(pitch / 2)
 *
 * and a grid turned φ about its first hole puts column i, row j (from 0) at
 *
 *     X = X1 + i·sx·cos φ − j·sy·sin φ      Y = Y1 + i·sx·sin φ + j·sy·cos φ
 *
 * Written from `machinist-calc-research` 03-spec/calculations.md §6, "Bolt
 * circles and grids", not from the Android app's code, so the two cores check
 * each other (Gate 7). The third-party check is Omni Calculator's published
 * worked example, 5 holes on a 50 mm radius from 0° (`tests/calc/
 * hole-pattern.test.ts`).
 *
 * ─── Conventions, which shops do not share, so the page states them ─────────
 *
 * 0° is at 3 o'clock, X runs right and Y up, and angles run counterclockwise
 * unless the pattern is set to clockwise. A bolt circle is placed from its
 * centre, a grid from its first hole, and both can sit anywhere from the datum.
 *
 * ─── Rounding (CLAUDE.md rule 3) ────────────────────────────────────────────
 *
 * WHERE:  nowhere in here. Lengths come in as whole nanometres and positions
 *         go out as the value as computed, a float of nanometres, NOT rounded
 *         to a whole nanometre. The display rounds each figure ONCE, half-even,
 *         from that value. The Android app learned this the hard way (its PR
 *         #58): rounding to whole nanometres first and then to four decimals
 *         put 0.50% of 200 000 bolt-circle chords a step out in the last digit.
 *
 * THE FINAL STEP: hole-to-hole moves are the differences of the positions AS
 *         SHOWN, worked in the display's own integer steps, never separately
 *         rounded steps. That is `hole-pattern-display.ts`. It is the only way
 *         the moves keyed into a machine in incremental mode land on every
 *         position the table shows, however many holes.
 *
 * ─── Angles that are exact, and why only those (Niven's theorem) ────────────
 *
 * `Math.cos` of 60° is 0.5000000000000001, not 0.5. On a 100.0002 mm circle
 * hole 2 of 6 sits at X = 25.00005 mm exactly — a tie, which half-even sends
 * to 25.0000 — and the float sends it to 25.0001.
 *
 * Niven's theorem says that for an angle that is a rational number of degrees,
 * the only rational values of its sine and cosine are 0, ±1/2 and ±1: the
 * multiples of 30°. Only a rational value can sit exactly on a rounding
 * boundary, so those angles are the only ones where float noise can decide a
 * tie, and they take exact values from a table. Multiples of 45° take
 * Math.SQRT1_2 from the same table, so a hole at 45° always shows equal X and
 * Y: the float sine and cosine of 45° differ in their last bit. Every other
 * angle goes to Math.cos and Math.sin.
 *
 * To know an angle IS a multiple of 30°, the angles are kept exact: every
 * input angle is taken to a millionth of a degree, and a hole's angle is a
 * fraction of millionths with the pitch's divisor below it, never a float
 * that drifted from 60 to 59.99999999999999.
 */

export type Direction = 'ccw' | 'cw';

/** Most holes in one pattern. More than this is not a pattern a table helps with. */
export const MAX_HOLES = 500;

/**
 * Furthest any figure may sit from the datum: 100 m, in nanometres. Far past
 * any machine's travel, and it keeps every length a safe integer.
 */
export const MAX_REACH_NM = 100_000_000_000;

/** A millionth of a degree: the resolution input angles are taken to. */
const MICRO = 1_000_000;
const FULL_TURN = 360 * MICRO;

export interface PlacedHole {
  /** 1-based, in the order the holes are worked. */
  readonly n: number;
  /** From the datum, in nanometres, as computed. Not rounded. */
  readonly xNm: number;
  readonly yNm: number;
  /** A bolt circle hole's angle in degrees, 0 to under 360. Null on a grid. */
  readonly angleDeg: number | null;
  /** A grid hole's column and row, counted from 0. Null on a bolt circle. */
  readonly column: number | null;
  readonly row: number | null;
}

export interface BoltCircleInput {
  /** Bolt circle diameter, whole nanometres, above zero. */
  readonly diameterNm: number;
  /** Whole number of holes, 1 to MAX_HOLES. */
  readonly holes: number;
  /** Where hole 1 sits, in degrees from 3 o'clock. */
  readonly startDeg: number;
  /** Null for a whole circle; else first hole to last, above 0° and under 360°. */
  readonly arcDeg: number | null;
  readonly direction: Direction;
  /** The circle's centre from the datum, whole nanometres. */
  readonly centreXNm: number;
  readonly centreYNm: number;
}

export interface BoltCircle {
  readonly holes: readonly PlacedHole[];
  /** Degrees between neighbouring holes. Null for a single hole. */
  readonly pitchDeg: number | null;
  /** Straight line between neighbouring holes, nanometres, as computed. */
  readonly chordNm: number | null;
}

export interface GridInput {
  /** Whole numbers, at least 1, MAX_HOLES in all at most. */
  readonly columns: number;
  readonly rows: number;
  /** Centre-to-centre spacing along a row and up a column, whole nanometres. */
  readonly spacingXNm: number;
  readonly spacingYNm: number;
  /** How far the whole grid is turned about its first hole, degrees. */
  readonly turnDeg: number;
  /** The first hole from the datum, whole nanometres. */
  readonly firstXNm: number;
  readonly firstYNm: number;
}

// ─── Exact angles ───────────────────────────────────────────────────────────

/** An angle as an exact fraction: `num / den` millionths of a degree. */
interface Angle {
  readonly num: number;
  readonly den: number;
}

/**
 * Degrees as whole millionths, after taking whole turns off: `% 360` is exact
 * in floating point, so 400.1° becomes 40.1° before it is scaled, and no
 * angle a user can type grows past a safe integer.
 */
function micro(deg: number, what: string): number {
  if (!Number.isFinite(deg)) throw new RangeError(`Enter ${what} in degrees.`);
  return Math.round((deg % 360) * MICRO);
}

/** The same angle, reduced to 0 up to (not including) a full turn. */
function normalise(a: Angle): Angle {
  const turn = FULL_TURN * a.den;
  return { num: ((a.num % turn) + turn) % turn, den: a.den };
}

const H = Math.sqrt(3) / 2;
const Q = Math.SQRT1_2;

/** cos and sin at every 30° (index 0 to 11): exact where Niven allows. */
const BY_30: readonly (readonly [number, number])[] = [
  [1, 0],
  [H, 0.5],
  [0.5, H],
  [0, 1],
  [-0.5, H],
  [-H, 0.5],
  [-1, 0],
  [-H, -0.5],
  [-0.5, -H],
  [0, -1],
  [0.5, -H],
  [H, -0.5],
];

/** cos and sin at every 45° (index 0 to 7), with one value for √2/2. */
const BY_45: readonly (readonly [number, number])[] = [
  [1, 0],
  [Q, Q],
  [0, 1],
  [-Q, Q],
  [-1, 0],
  [-Q, -Q],
  [0, -1],
  [Q, -Q],
];

/** [cos, sin] of an exact angle. */
function cosSin(angle: Angle): readonly [number, number] {
  const { num, den } = normalise(angle);
  const step30 = 30 * MICRO * den;
  if (num % step30 === 0) return BY_30[num / step30] ?? [1, 0];
  const step45 = 45 * MICRO * den;
  if (num % step45 === 0) return BY_45[num / step45] ?? [1, 0];
  const radians = (num / den / MICRO) * (Math.PI / 180);
  return [Math.cos(radians), Math.sin(radians)];
}

/** Degrees, 0 up to 360, for display. */
function degrees(angle: Angle): number {
  const { num, den } = normalise(angle);
  return num / den / MICRO;
}

// ─── Guards ─────────────────────────────────────────────────────────────────

function requireWholeNm(value: number, what: string): void {
  if (!Number.isFinite(value) || Math.abs(value) > MAX_REACH_NM * 2) {
    throw new RangeError(`${what} is out of range: nothing here reaches past 100 m.`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${what} must be a whole number of nanometres.`);
  }
}

/**
 * Refuse a pattern that reaches more than 100 m from the datum: the origin's
 * own distance plus `span`, the furthest any hole sits from that origin. By
 * the triangle inequality no hole can be further out than that sum.
 */
function requireReach(xNm: number, yNm: number, span: number, what: string): void {
  requireWholeNm(xNm, what);
  requireWholeNm(yNm, what);
  if (Math.hypot(xNm, yNm) + span > MAX_REACH_NM) {
    throw new RangeError(`${what} reaches more than 100 m from the datum.`);
  }
}

// ─── Bolt circles ───────────────────────────────────────────────────────────

/**
 * Every hole of a bolt circle or partial arc, from its centre.
 *
 * Throws `RangeError` with the sentence the page shows; the caller displays
 * it rather than wording it.
 */
export function boltCircle(input: BoltCircleInput): BoltCircle {
  const { diameterNm, holes, startDeg, arcDeg, direction } = input;

  requireWholeNm(diameterNm, 'The diameter');
  if (diameterNm <= 0) throw new RangeError('The diameter must be more than zero.');
  if (!Number.isInteger(holes) || holes < 1 || holes > MAX_HOLES) {
    throw new RangeError(`Enter a whole number of holes, from 1 to ${MAX_HOLES}.`);
  }
  requireReach(input.centreXNm, input.centreYNm, diameterNm / 2, 'The circle');

  const start = micro(startDeg, 'the start angle');
  const sign = direction === 'cw' ? -1 : 1;

  /*
   * The pitch as an exact fraction of millionths, `step / den`.
   *
   * A whole circle divides a full turn by N. An arc divides the arc by N − 1,
   * because it runs from the first hole to the last: five holes over 90° are
   * 22.5° apart, not 18°.
   */
  let step: number;
  let den: number;
  if (arcDeg === null) {
    step = FULL_TURN;
    den = holes;
  } else {
    // NOT micro(): taking whole turns off would make a 360° arc a 0° one and
    // refuse it with the wrong reason. An arc is checked as entered.
    if (!Number.isFinite(arcDeg)) throw new RangeError('Enter the arc in degrees.');
    const arc = arcDeg >= 360 ? FULL_TURN : Math.round(arcDeg * MICRO);
    if (arc >= FULL_TURN) {
      throw new RangeError(
        'A 360° arc puts the last hole on top of the first. Leave the arc blank for a whole circle.',
      );
    }
    if (arc <= 0) {
      throw new RangeError(
        'The arc runs from the first hole to the last, so it must be more than 0°. Leave it blank for a whole circle.',
      );
    }
    step = arc;
    den = Math.max(holes - 1, 1);
  }

  const radius = diameterNm / 2;
  const placed: PlacedHole[] = [];
  for (let k = 0; k < holes; k++) {
    const angle: Angle = { num: start * den + sign * k * step, den };
    const [c, s] = cosSin(angle);
    placed.push({
      n: k + 1,
      xNm: input.centreXNm + radius * c,
      yNm: input.centreYNm + radius * s,
      angleDeg: degrees(angle),
      column: null,
      row: null,
    });
  }

  if (holes === 1) return { holes: placed, pitchDeg: null, chordNm: null };

  // chord = D × sin(pitch / 2), with half the pitch kept exact too: 6 holes
  // are 60° apart, so the chord is D × sin 30°, exactly the radius.
  const [, halfSin] = cosSin({ num: step, den: 2 * den });
  return {
    holes: placed,
    pitchDeg: step / den / MICRO,
    chordNm: diameterNm * halfSin,
  };
}

// ─── Grids ──────────────────────────────────────────────────────────────────

/**
 * Every hole of a rectangular grid, turned about its first hole.
 *
 * Holes are numbered row by row: along the first row in X, then the next row
 * up. Column i and row j count from 0, so the first hole is (0, 0).
 */
export function holeGrid(input: GridInput): readonly PlacedHole[] {
  const { columns, rows, spacingXNm, spacingYNm, turnDeg } = input;

  if (
    !Number.isInteger(columns) ||
    !Number.isInteger(rows) ||
    columns < 1 ||
    rows < 1 ||
    columns * rows > MAX_HOLES
  ) {
    throw new RangeError(
      `Enter whole numbers of columns and rows, at most ${MAX_HOLES} holes in all.`,
    );
  }
  requireWholeNm(spacingXNm, 'The X spacing');
  requireWholeNm(spacingYNm, 'The Y spacing');
  if (spacingXNm < 0 || spacingYNm < 0) {
    throw new RangeError(
      'Spacing cannot be negative. Turn the grid 180° to run it the other way.',
    );
  }
  if (columns > 1 && spacingXNm === 0) {
    throw new RangeError(
      'With more than one column the X spacing cannot be zero: every column would land on the first.',
    );
  }
  if (rows > 1 && spacingYNm === 0) {
    throw new RangeError(
      'With more than one row the Y spacing cannot be zero: every row would land on the first.',
    );
  }
  // The far corner is the furthest any hole sits from the first, whatever the turn.
  requireReach(
    input.firstXNm,
    input.firstYNm,
    Math.hypot((columns - 1) * spacingXNm, (rows - 1) * spacingYNm),
    'The grid',
  );

  const [c, s] = cosSin({ num: micro(turnDeg, 'the turn'), den: 1 });
  const placed: PlacedHole[] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
      const u = i * spacingXNm;
      const v = j * spacingYNm;
      placed.push({
        n: j * columns + i + 1,
        xNm: input.firstXNm + u * c - v * s,
        yNm: input.firstYNm + u * s + v * c,
        angleDeg: null,
        column: i,
        row: j,
      });
    }
  }
  return placed;
}
