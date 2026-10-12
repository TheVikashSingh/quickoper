/**
 * Cones: how deep a countersink, chamfer or spot drill goes for a diameter,
 * the diameter it cuts at a depth, and a drill's point length.
 *
 * ─── What this is ───────────────────────────────────────────────────────────
 *
 * One right triangle. A cone of included angle θ widens by 2 × tan(θ / 2) for
 * every unit of depth, so between a diameter D at the surface and a diameter d
 * where the cone stops:
 *
 *     depth = (D − d) / (2 × tan(θ / 2))
 *     D     = d + 2 × depth × tan(θ / 2)
 *
 * Severance Tool Industries, a countersink maker, prints both in its
 * countersink angle guide, with θ "the included angle of the conical cutting
 * surface — the total angle measured across the full cone, not the half-angle
 * from center". d is where the cone stops: 0 for a sharp point (which makes
 * the first line a drill's point length), the flat on the end of a
 * flat-tipped tool, or a hole drilled first, for how far down that hole the
 * cone reaches. Written from `machinist-calc-research` 03-spec/calculations.md,
 * "Cones", not from the Android app's code, so the two check each other
 * (Gate 7). The published checks, Severance's own example and Omni
 * Calculator's two, are in `tests/calc/cone.test.ts`.
 *
 * ─── The trap ───────────────────────────────────────────────────────────────
 *
 * θ is the INCLUDED angle. A chamfer drawn at 45° is cut with a 90° tool;
 * entered as 45, a 10 mm chamfer comes out 12.0711 mm deep instead of 5.0000,
 * nearly two and a half times too deep. The page's labels and working say
 * "included" and print both angles.
 *
 * ─── Rounding (CLAUDE.md rule 3) ────────────────────────────────────────────
 *
 * WHERE:  nowhere in here. Lengths come in as whole nanometres and go out as a
 *         Bracket, the whole nanometre at or below the value and whether the
 *         value is exactly that. The display rounds each once, half-even, as
 *         the true position page does (`bracketSteps`).
 * EXACT WHERE A TIE CAN HAPPEN: for a whole or decimal number of degrees,
 *         tan(θ / 2) is rational only at θ = 90°, where it is 1 (Niven's
 *         theorem). There the depth is (D − d) / 2 and the diameter d + 2 × depth,
 *         worked in integers: a depth of 6.00005 mm is a true tie, and the
 *         display rounds it to the even 6.0000.
 * EVERY OTHER ANGLE gives an irrational length (unless it is 0), which can
 *         never sit on a rounding boundary. It is worked in floating point,
 *         good to about a millionth of a nanometre at 10 m, and handed over as
 *         the nanometre below it, not exact. A value would have to fall within
 *         that of a half step to be rounded the wrong way;
 *         `tests/calc/cone.test.ts` checks thousands of random cones against a
 *         60-digit reference.
 */

import type { Bracket } from './true-position';

/** The longest length taken: 10 m. Omni's published example is a 5 m countersink. */
export const MAX_LENGTH_NM = 10_000_000_000;

/** tan(θ / 2), or null at exactly 90°, where it is exactly 1. */
function halfTangent(includedDeg: number): number | null {
  if (!Number.isFinite(includedDeg) || includedDeg <= 0 || includedDeg >= 180) {
    throw new RangeError('The included angle is more than 0° and less than 180°.');
  }
  return includedDeg === 90 ? null : Math.tan((includedDeg / 2) * (Math.PI / 180));
}

function length(nm: number, what: string): void {
  if (!Number.isSafeInteger(nm) || nm < 0 || nm > MAX_LENGTH_NM) {
    throw new RangeError(`${what} must be a whole number of nanometres from 0 to 10 m.`);
  }
}

/** The nanometre below an irrational value: never exact. */
function below(value: number): Bracket {
  return { floor: Math.floor(value), exact: false };
}

/**
 * How deep a cone of included angle θ runs from a diameter `outerNm` down to
 * a diameter `innerNm`: (D − d) / (2 × tan(θ / 2)).
 */
export function coneDepth(
  outerNm: number,
  innerNm: number,
  includedDeg: number,
): Bracket {
  length(outerNm, 'The outer diameter');
  length(innerNm, 'The inner diameter');
  if (innerNm >= outerNm) {
    throw new RangeError('The cone has to be wider at the top than where it stops.');
  }
  const t = halfTangent(includedDeg);
  const across = outerNm - innerNm;
  if (t === null) {
    // tan 45° = 1: half of a whole number of nanometres.
    return across % 2 === 0
      ? { floor: across / 2, exact: true }
      : { floor: (across - 1) / 2, exact: false };
  }
  return below(across / (2 * t));
}

/**
 * The diameter a cone of included angle θ reaches `depthNm` above where it
 * stops at `innerNm`: d + 2 × depth × tan(θ / 2).
 */
export function coneDiameter(
  innerNm: number,
  depthNm: number,
  includedDeg: number,
): Bracket {
  length(innerNm, 'The inner diameter');
  length(depthNm, 'The depth');
  const t = halfTangent(includedDeg);
  if (t === null || depthNm === 0) return { floor: innerNm + 2 * depthNm, exact: true };
  return below(innerNm + 2 * depthNm * t);
}

/** A bracket moved by a whole number of nanometres: still exact if it was. */
export function shifted(b: Bracket, byNm: number): Bracket {
  return { floor: b.floor + byNm, exact: b.exact };
}
