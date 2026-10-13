/**
 * Triangles: the sides, angles and area of any triangle from three of its six
 * parts, at least one a side.
 *
 * ─── What this is ───────────────────────────────────────────────────────────
 *
 * The law of cosines and the law of sines, nothing else. Side a is opposite
 * angle α, b opposite β, c opposite γ. Written from `machinist-calc-research`
 * 03-spec/calculations.md, "Triangles", not from the Android app's code, so
 * the two check each other (Gate 7). The published checks, Maths is Fun's
 * worked examples of every case, are in `tests/calc/triangle.test.ts`.
 *
 *   SSS  three sides                      law of cosines for each angle
 *   SAS  two sides and the angle between  law of cosines for the third side
 *   ASA  two angles and the side between  the third angle from 180°, then
 *   AAS  two angles and another side      the law of sines for the sides
 *   SSA  two sides and an angle not       the law of sines; none, one or two
 *        between them                     triangles fit, and every one that
 *                                         fits is returned
 *
 * A right triangle is the same solver with γ = 90° given.
 *
 * ─── Rounding (CLAUDE.md rule 3) ────────────────────────────────────────────
 *
 * WHERE: nowhere in here. A side goes out as a Bracket, the whole nanometre at
 *        or below it and whether it is exactly that; an angle and an area as a
 *        float, with the exact rational alongside where there is one. The
 *        display rounds each once, half to even.
 * WHERE A TIE CAN HAPPEN: a figure can sit exactly halfway between two shown
 *        ones only if it is rational. For angles in whole or decimal degrees
 *        (Niven's theorem) a cosine is rational only at 60°, 90° and 120°, and
 *        a sine only at 30°, 90° and 150°, so a side is rational only:
 *          - as the square root of a whole number of nm², which the law of
 *            cosines gives at 60°, 90° and 120° (SAS, and SSA, where the
 *            third side is t cos θ ± √(s² − t² sin² θ));
 *          - as a known side times a rational ratio of sines: both sines
 *            rational (30°, 90°, 150°), or the two angles equal or adding to
 *            180°, when the ratio is 1.
 *        Those are worked exactly, the roots as integer square roots in BigInt
 *        (`rootBracket`, as true position does). A given angle and an angle
 *        from 180° less two given ones are exact rationals. An area is exact
 *        from two exact sides and an angle with a rational sine, or from three
 *        whole-nanometre sides by Heron's formula when that is a whole root.
 * EVERY OTHER FIGURE is irrational and can never sit on a rounding boundary.
 *        It is worked in floating point and handed over as the nanometre below
 *        it; `tests/calc/triangle.test.ts` checks thousands of random
 *        triangles against a 60-digit reference.
 * THE RIGHT ANGLE HIDDEN IN SSA: a 4, b 8, α 30° is exactly right-angled at β.
 *        Where the angle's sine is rational the test is exact (b sin α = a);
 *        elsewhere a sine within 1e−14 of 1 is taken as exactly 90°, as the
 *        spec says: under 0.00001°, far below the four places shown.
 */

import { isqrt, rootBracket, type Bracket } from './true-position';

/** A positive exact fraction: degrees, or nanometres, or nm². */
export interface Rational {
  readonly num: bigint;
  readonly den: bigint;
}

/** A side: its value for drawing and for further floating-point work, and its bracket. */
export interface Side {
  readonly approx: number;
  readonly bracket: Bracket;
  /** The exact value in nanometres, where it is rational. */
  readonly exact: Rational | null;
}

export interface Angle {
  /** Degrees. */
  readonly approx: number;
  /** Degrees, exactly, where they are rational: a given angle, or 180° less two of them. */
  readonly exact: Rational | null;
}

export interface Area {
  /** nm². */
  readonly approx: number;
  readonly exact: Rational | null;
}

export type Case = 'SSS' | 'SAS' | 'ASA' | 'AAS' | 'SSA';

export interface Solved {
  /** a, b, c: side i is opposite angle i. */
  readonly sides: readonly [Side, Side, Side];
  /** α, β, γ. */
  readonly angles: readonly [Angle, Angle, Angle];
  readonly area: Area;
}

export interface Solution {
  readonly case: Case;
  /** One triangle, or two in the ambiguous case. */
  readonly triangles: readonly Solved[];
  /** SSA only: the sine of the angle worked out first, for the working. */
  readonly sine?: number;
}

/** What is known: sides in whole nanometres, angles as exact degrees; null where unknown. */
export interface Given {
  readonly sides: readonly [number | null, number | null, number | null];
  readonly angles: readonly [Rational | null, Rational | null, Rational | null];
}

/** The longest side taken: 10 m, as the other shop pages. */
export const MAX_SIDE_NM = 10_000_000_000;

// ─── Exact helpers ───────────────────────────────────────────────────────────

const R = (num: bigint, den: bigint = 1n): Rational => ({ num, den });
const approxOf = (r: Rational): number => Number(r.num) / Number(r.den);
const is = (r: Rational | null, deg: bigint): boolean =>
  r !== null && r.num === deg * r.den;
const sub = (x: Rational, y: Rational): Rational =>
  R(x.num * y.den - y.num * x.den, x.den * y.den);
const lt = (x: Rational, y: Rational): boolean => x.num * y.den < y.num * x.den;

/** sin of an exact angle, where it is rational: 30° and 150° are 1/2, 90° is 1. */
function rationalSine(a: Rational | null): Rational | null {
  if (is(a, 30n) || is(a, 150n)) return R(1n, 2n);
  if (is(a, 90n)) return R(1n);
  return null;
}

function sideFromRational(r: Rational): Side {
  const floor = r.num / r.den;
  return {
    approx: approxOf(r),
    bracket: { floor: Number(floor), exact: floor * r.den === r.num },
    exact: r,
  };
}

/** An irrational side, worked in floating point: the nanometre below it. */
function sideFromFloat(x: number): Side {
  return { approx: x, bracket: { floor: Math.floor(x), exact: false }, exact: null };
}

/** √n nanometres, n a whole number of nm². */
function sideFromRoot(n: bigint): Side {
  const b = rootBracket(n);
  return {
    approx: Math.sqrt(Number(n)),
    bracket: b,
    exact: b.exact ? R(BigInt(b.floor)) : null,
  };
}

/** (t + sign × √d) / 2 nanometres, t and d whole. Positive by the caller's choice of sign. */
function sideFromHalfRoot(t: bigint, sign: 1 | -1, d: bigint): Side {
  const r = isqrt(d);
  if (r * r === d) return sideFromRational(R(t + BigInt(sign) * r, 2n));
  // √d lies strictly between r and r + 1, so the sum strictly between
  // `lower` and `lower` + 1, and half of it below the next whole nanometre.
  const lower = sign === 1 ? t + r : t - r - 1n;
  return {
    approx: (Number(t) + sign * Math.sqrt(Number(d))) / 2,
    bracket: { floor: Number(lower / 2n), exact: false },
    exact: null,
  };
}

const given = (nm: number): Side => sideFromRational(R(BigInt(nm)));
const angleExact = (r: Rational): Angle => ({ approx: approxOf(r), exact: r });
const angleFloat = (deg: number): Angle => ({ approx: deg, exact: null });

const RAD = Math.PI / 180;
const sinDeg = (a: Angle): number => Math.sin(a.approx * RAD);

/** 180° less two angles: exact when both are. */
function third(x: Angle, y: Angle): Angle {
  if (x.exact !== null && y.exact !== null) {
    return angleExact(sub(sub(R(180n), x.exact), y.exact));
  }
  return angleFloat(180 - x.approx - y.approx);
}

/** The angle opposite side `x` from three sides, by the law of cosines. */
function cosineAngle(x: number, y: number, z: number): Angle {
  const c = (y * y + z * z - x * x) / (2 * y * z);
  return angleFloat(Math.acos(Math.min(1, Math.max(-1, c))) / RAD);
}

/** Side j from side i by the law of sines: exact where the ratio of sines is rational. */
function sineSide(known: Side, ki: Angle, kj: Angle): Side {
  const si = rationalSine(ki.exact);
  const sj = rationalSine(kj.exact);
  const sameOrSupplement =
    ki.exact !== null &&
    kj.exact !== null &&
    (ki.exact.num * kj.exact.den === kj.exact.num * ki.exact.den ||
      ki.exact.num * kj.exact.den + kj.exact.num * ki.exact.den ===
        180n * ki.exact.den * kj.exact.den);
  if (known.exact !== null) {
    if (sameOrSupplement) return sideFromRational(known.exact);
    if (si !== null && sj !== null) {
      return sideFromRational(
        R(known.exact.num * sj.num * si.den, known.exact.den * sj.den * si.num),
      );
    }
  }
  return sideFromFloat((known.approx * sinDeg(kj)) / sinDeg(ki));
}

/** The area, exactly where it can be. */
function areaOf(
  sides: readonly [Side, Side, Side],
  angles: readonly [Angle, Angle, Angle],
): Area {
  for (const k of [2, 1, 0] as const) {
    const [i, j] = k === 2 ? [0, 1] : k === 1 ? [0, 2] : [1, 2];
    const si = sides[i]?.exact;
    const sj = sides[j]?.exact;
    const s = rationalSine(angles[k].exact);
    if (si && sj && s) {
      const exact = R(si.num * sj.num * s.num, 2n * si.den * sj.den * s.den);
      return { approx: approxOf(exact), exact };
    }
  }
  const [a, b, c] = sides;
  if (a.exact?.den === 1n && b.exact?.den === 1n && c.exact?.den === 1n) {
    const [x, y, z] = [a.exact.num, b.exact.num, c.exact.num];
    const n = (x + y + z) * (-x + y + z) * (x - y + z) * (x + y - z);
    const r = isqrt(n);
    if (r * r === n) {
      const exact = R(r, 4n);
      return { approx: approxOf(exact), exact };
    }
  }
  return { approx: 0.5 * a.approx * b.approx * sinDeg(angles[2]), exact: null };
}

function solved(sides: [Side, Side, Side], angles: [Angle, Angle, Angle]): Solved {
  return { sides, angles, area: areaOf(sides, angles) };
}

// ─── The solver ──────────────────────────────────────────────────────────────

const others = (i: number): [number, number] =>
  i === 0 ? [1, 2] : i === 1 ? [0, 2] : [0, 1];

/**
 * Every triangle that fits three known parts. Refused in words: the wrong
 * count, no side, an angle out of range, angles of 180° or more together,
 * sides that do not close, and an SSA that no triangle fits.
 */
export function solveTriangle(g: Given): Solution {
  const sideIdx = [0, 1, 2].filter((i) => g.sides[i] !== null);
  const angleIdx = [0, 1, 2].filter((i) => g.angles[i] !== null);
  if (sideIdx.length + angleIdx.length !== 3) {
    throw new RangeError('Enter exactly three of the six, at least one of them a side.');
  }
  if (sideIdx.length === 0) {
    throw new RangeError(
      'Angles alone fix the shape but not the size: enter at least one side.',
    );
  }
  for (const i of sideIdx) {
    const s = g.sides[i] as number;
    if (!Number.isSafeInteger(s) || s <= 0)
      throw new RangeError('A side has to be more than zero.');
    if (s > MAX_SIDE_NM)
      throw new RangeError('A side over 10 m is a slip in the inputs.');
  }
  for (const i of angleIdx) {
    const a = g.angles[i] as Rational;
    if (a.num <= 0n || !lt(a, R(180n))) {
      throw new RangeError('An angle is more than 0° and less than 180°.');
    }
  }

  // ── Two angles and a side ──
  if (angleIdx.length === 2) {
    const [x, y] = angleIdx as [number, number];
    const k = [0, 1, 2].find((i) => !angleIdx.includes(i)) as number;
    const sum = R(
      (g.angles[x] as Rational).num * (g.angles[y] as Rational).den +
        (g.angles[y] as Rational).num * (g.angles[x] as Rational).den,
      (g.angles[x] as Rational).den * (g.angles[y] as Rational).den,
    );
    if (!lt(sum, R(180n))) {
      throw new RangeError('Two angles of a triangle add up to less than 180°.');
    }
    const angles: Angle[] = [];
    angles[x] = angleExact(g.angles[x] as Rational);
    angles[y] = angleExact(g.angles[y] as Rational);
    angles[k] = third(angles[x] as Angle, angles[y] as Angle);
    const i = sideIdx[0] as number;
    const known = given(g.sides[i] as number);
    const sides: Side[] = [];
    for (const j of [0, 1, 2]) {
      sides[j] =
        j === i ? known : sineSide(known, angles[i] as Angle, angles[j] as Angle);
    }
    return {
      // ASA when the known side lies between the two given angles, that is,
      // it is opposite the third one.
      case: i === k ? 'ASA' : 'AAS',
      triangles: [solved(sides as [Side, Side, Side], angles as [Angle, Angle, Angle])],
    };
  }

  // ── Three sides ──
  if (angleIdx.length === 0) {
    const [a, b, c] = g.sides as [number, number, number];
    const [lo1, lo2, hi] = [a, b, c].sort((p, q) => p - q) as [number, number, number];
    if (BigInt(lo1) + BigInt(lo2) <= BigInt(hi)) {
      throw new RangeError(
        'These sides do not close: the longest has to be shorter than the other two together.',
      );
    }
    const alpha = cosineAngle(a, b, c);
    const beta = cosineAngle(b, a, c);
    return {
      case: 'SSS',
      triangles: [
        solved([given(a), given(b), given(c)], [alpha, beta, third(alpha, beta)]),
      ],
    };
  }

  // ── Two sides and an angle ──
  const g0 = angleIdx[0] as number;
  const theta = angleExact(g.angles[g0] as Rational);
  const [p, q] = others(g0);

  if (g.sides[g0] === null) {
    // SAS: the angle lies between the two known sides.
    const x = g.sides[p] as number;
    const y = g.sides[q] as number;
    const [X, Y] = [BigInt(x), BigInt(y)];
    let z: Side;
    if (is(theta.exact, 90n)) z = sideFromRoot(X * X + Y * Y);
    else if (is(theta.exact, 60n)) z = sideFromRoot(X * X + Y * Y - X * Y);
    else if (is(theta.exact, 120n)) z = sideFromRoot(X * X + Y * Y + X * Y);
    else
      z = sideFromFloat(
        Math.sqrt(x * x + y * y - 2 * x * y * Math.cos(theta.approx * RAD)),
      );
    const sides: Side[] = [];
    sides[g0] = z;
    sides[p] = given(x);
    sides[q] = given(y);
    const angles: Angle[] = [];
    angles[g0] = theta;
    // The smaller of the two unknown angles from the law of cosines, which is
    // never obtuse; the other from 180°.
    const [small, large] = x <= y ? [p, q] : [q, p];
    angles[small] = cosineAngle(
      sides[small]?.approx ?? 0,
      sides[large]?.approx ?? 0,
      z.approx,
    );
    angles[large] = third(theta, angles[small] as Angle);
    return {
      case: 'SAS',
      triangles: [solved(sides as [Side, Side, Side], angles as [Angle, Angle, Angle])],
    };
  }

  // SSA: θ is opposite the known side s; t is the other known side; u, the
  // third, is unknown, and T, the angle opposite t, is found first.
  const tIdx = g.sides[p] !== null ? p : q;
  const uIdx = tIdx === p ? q : p;
  const s = g.sides[g0] as number;
  const t = g.sides[tIdx] as number;
  const S = BigInt(s);
  const T = BigInt(t);
  const obtuse = !lt(theta.exact as Rational, R(90n));

  if (obtuse && t >= s) {
    throw new RangeError(
      'No triangle fits: the side opposite a right or obtuse angle has to be the longest.',
    );
  }

  // sin T = t sin θ / s, compared with 1 exactly where sin θ is rational.
  const sr = rationalSine(theta.exact);
  const sine = (t * sinDeg(theta)) / s;
  let tangent: boolean;
  if (sr !== null) {
    const lhs = T * sr.num;
    const rhs = S * sr.den;
    if (lhs > rhs) throw new RangeError(noFit(g0, tIdx));
    tangent = lhs === rhs;
  } else {
    if (sine > 1 + 1e-14) throw new RangeError(noFit(g0, tIdx));
    tangent = sine >= 1 - 1e-14;
  }

  const build = (angleT: Angle, branch: 1 | -1): Solved => {
    const angleU = third(theta, angleT);
    let u: Side;
    if (tangent) u = sideFromRoot(T * T - S * S);
    else if (is(theta.exact, 90n)) u = sideFromRoot(S * S - T * T);
    else if (is(theta.exact, 60n))
      u = sideFromHalfRoot(T, branch, 4n * S * S - 3n * T * T);
    else if (is(theta.exact, 120n)) u = sideFromHalfRoot(-T, 1, 4n * S * S - 3n * T * T);
    else u = sideFromFloat((s * sinDeg(angleU)) / sinDeg(theta));
    const sides: Side[] = [];
    sides[g0] = given(s);
    sides[tIdx] = given(t);
    sides[uIdx] = u;
    const angles: Angle[] = [];
    angles[g0] = theta;
    angles[tIdx] = angleT;
    angles[uIdx] = angleU;
    return solved(sides as [Side, Side, Side], angles as [Angle, Angle, Angle]);
  };

  if (tangent) {
    return { case: 'SSA', triangles: [build(angleExact(R(90n)), 1)], sine: 1 };
  }
  const t1 = angleFloat(Math.asin(Math.min(1, sine)) / RAD);
  const triangles = [build(t1, 1)];
  // A second triangle, with T obtuse, fits only when θ is acute and t is the
  // longer of the two known sides; at t = s it would have no third angle.
  if (!obtuse && t > s) triangles.push(build(angleFloat(180 - t1.approx), -1));
  return { case: 'SSA', triangles, sine };
}

const SIDE = ['a', 'b', 'c'];
const ANGLE = ['α', 'β', 'γ'];

function noFit(angle: number, other: number): string {
  return `No triangle fits: side ${SIDE[angle]} is too short to reach from the end of ${SIDE[other]} at ${ANGLE[angle]}.`;
}
