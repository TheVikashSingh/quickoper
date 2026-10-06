/**
 * True position: how far a feature's axis is from where the drawing puts it,
 * and whether that is inside the position tolerance.
 *
 * ─── What this is ───────────────────────────────────────────────────────────
 *
 * Geometry on a definition. A position tolerance Ø t is a cylinder of diameter
 * t round the true position (ASME Y14.5). An axis dx and dy from the true
 * position is r = √(dx² + dy²) from it, and is inside the cylinder when
 * r ≤ t / 2. So the deviation is stated as the diameter it needs:
 *
 *     position = 2 × √(dx² + dy²)
 *     within   when position ≤ allowed
 *     allowed  = t                regardless of feature size
 *              = t + bonus        at MMC or LMC
 *
 *     hole at MMC: bonus = measured − smallest   pin at MMC: largest − measured
 *     hole at LMC: bonus = largest − measured    pin at LMC: measured − smallest
 *
 * The bonus is how far the feature's size has moved from the size the
 * tolerance is stated at: the smallest hole or largest pin at MMC, the largest
 * hole or smallest pin at LMC. Written from `machinist-calc-research`
 * 03-spec/calculations.md §6, "True position", not from the Android app's
 * code, so the two cores check each other (Gate 7). The published checks —
 * GD&T Basics' .003 and .002 in example, Cogorno's .535 and .518 in holes —
 * are in `tests/calc/true-position.test.ts`.
 *
 * ─── The trap this refuses to fall into ─────────────────────────────────────
 *
 * A pass or fail without the feature's measured size is a regardless-of-size
 * answer, whatever the frame says. At MMC or LMC there is no verdict until the
 * size limits and the measured size are given; a feature outside its limits
 * fails on size and earns no bonus; and a zero tolerance is refused regardless
 * of size (Cogorno: "Zero tolerance is never used without an MMC or LMC
 * modifier").
 *
 * ─── Rounding (CLAUDE.md rule 3) ────────────────────────────────────────────
 *
 * WHERE:  nowhere in here, and nothing here is a float. Lengths come in as
 *         whole nanometres. The verdict is integer arithmetic on them —
 *         4(dx² + dy²) ≤ allowed², in BigInt because 4 × (100 mm)² × 2 passes
 *         2^53 — so a position exactly on the limit is within, and one 1.6 nm
 *         over is not.
 * THE FIGURES: the position and the margin either side of the limit are
 *         irrational in general, so they go out as a BRACKET: the whole
 *         nanometre below, and whether the value is exactly that. The display
 *         rounds each once, half-even, from the bracket
 *         (`true-position-display.ts`). That is exact, because every rounding
 *         boundary at four decimals is itself a whole nanometre (50 nm past
 *         each 100 nm in millimetres, 1270 nm past each 2540 nm in inches): a
 *         value strictly between two whole nanometres can never sit on one.
 *         Rounding to a whole nanometre first would not be: dx 108 474 nm and
 *         dy 460 nm is a position of 216 949.95 nm, 0.2169 mm, which rounded
 *         to 216 950 nm first becomes a tie and prints 0.2170.
 */

import { MAX_REACH_NM } from './hole-pattern';

export type Modifier = 'rfs' | 'mmc' | 'lmc';
export type Feature = 'hole' | 'pin';

/** More than this off in X or Y is a slip in the inputs, not a position error: 100 mm. */
export const MAX_OFFSET_NM = 100_000_000;

/** The largest position tolerance, and the widest size range, taken: 100 mm. */
export const MAX_TOLERANCE_NM = 100_000_000;
export const MAX_SIZE_RANGE_NM = 100_000_000;

/**
 * A length known exactly, though it may be irrational: exactly `floor`
 * nanometres when `exact`, and otherwise strictly between `floor` and
 * `floor + 1`.
 */
export interface Bracket {
  readonly floor: number;
  readonly exact: boolean;
}

export interface Size {
  /** The size limits from the drawing and the size measured, whole nanometres. */
  readonly smallestNm: number;
  readonly largestNm: number;
  readonly measuredNm: number;
}

export interface PositionInput {
  /** Measured minus drawn, whole nanometres, either sign. */
  readonly dxNm: number;
  readonly dyNm: number;
  /**
   * The diameter in the feature control frame, whole nanometres. Null while
   * it is not given: the position alone, with no verdict, as the app does.
   */
  readonly toleranceNm: number | null;
  readonly modifier: Modifier;
  readonly feature: Feature;
  /** Null until all three are given. Not read regardless of feature size. */
  readonly size: Size | null;
}

export type Verdict = 'within' | 'over' | 'out-of-size' | 'needs-size' | 'no-tolerance';

/** One verdict on position against one allowed diameter. */
export interface Against {
  readonly verdict: 'within' | 'over';
  /** Within: allowed − position, zero or more. Over: position − allowed, above zero. */
  readonly margin: Bracket;
}

export interface PositionCheck {
  /** 2√(dx² + dy²): the diameter of the smallest zone the axis is inside. */
  readonly position: Bracket;
  readonly verdict: Verdict;
  /** At MMC or LMC with the feature in size; null otherwise. */
  readonly bonusNm: number | null;
  /** What the position is judged against; null when it is not judged. */
  readonly allowedNm: number | null;
  /** How far inside or past the limit; null when it is not judged. */
  readonly margin: Bracket | null;
  /** Which limit an out-of-size feature passed. */
  readonly outOfSize: 'below' | 'above' | null;
  /**
   * At MMC or LMC with the feature in size: the same position against the
   * tolerance alone, which is the answer a check without the size would give.
   */
  readonly withoutBonus: Against | null;
}

/** ⌊√n⌋, exact for any non-negative BigInt. */
export function isqrt(n: bigint): bigint {
  if (n < 0n) throw new RangeError('No square root of a negative number.');
  // A float root is within a unit or two at these sizes; the loops make it exact.
  let r = BigInt(Math.floor(Math.sqrt(Number(n))));
  while (r * r > n) r -= 1n;
  while ((r + 1n) * (r + 1n) <= n) r += 1n;
  return r;
}

/** √n nanometres, as a bracket. */
export function rootBracket(n: bigint): Bracket {
  const r = isqrt(n);
  return { floor: Number(r), exact: r * r === n };
}

/**
 * The position whose square is `squared` against an allowed diameter.
 *
 * Decided on the squares, exactly; the margin is bracketed from the root.
 */
function against(squared: bigint, root: Bracket, allowedNm: number): Against {
  const a = BigInt(allowedNm);
  if (squared <= a * a) {
    // √S ≤ a. Exact: a − q. Otherwise √S is in (q, q + 1), so a ≥ q + 1 and
    // a − √S is in (a − q − 1, a − q).
    return {
      verdict: 'within',
      margin: root.exact
        ? { floor: allowedNm - root.floor, exact: true }
        : { floor: allowedNm - root.floor - 1, exact: false },
    };
  }
  // √S > a, so q ≥ a, and √S − a is q − a exactly or in (q − a, q − a + 1).
  return {
    verdict: 'over',
    margin: { floor: root.floor - allowedNm, exact: root.exact },
  };
}

/** Every limit here is far below 2^53, so a length inside one is a safe integer. */
function requireLength(value: number, limit: number, refusal: string): void {
  if (!Number.isFinite(value)) throw new RangeError('Enter every length as a number.');
  if (Math.abs(value) > limit) throw new RangeError(refusal);
  if (!Number.isInteger(value)) {
    throw new RangeError('A length must be a whole number of nanometres.');
  }
}

/** A size limit or a measured size: above zero, and nothing past 100 m (the bolt circle's reach). */
function requireSize(value: number): void {
  requireLength(value, MAX_REACH_NM, 'A size over 100 m is a slip in the inputs.');
  if (value <= 0) throw new RangeError('A size must be more than zero.');
}

/**
 * The bonus a feature in size earns: how far it has moved from the size the
 * tolerance is stated at.
 */
function bonusFor(modifier: 'mmc' | 'lmc', feature: Feature, size: Size): number {
  const { smallestNm, largestNm, measuredNm } = size;
  if (modifier === 'mmc') {
    return feature === 'hole' ? measuredNm - smallestNm : largestNm - measuredNm;
  }
  return feature === 'hole' ? largestNm - measuredNm : measuredNm - smallestNm;
}

/**
 * The position, and the verdict wherever one can honestly be given.
 *
 * Throws `RangeError` with the sentence the page shows; the caller displays
 * it rather than wording it.
 */
export function checkPosition(input: PositionInput): PositionCheck {
  const { dxNm, dyNm, toleranceNm, modifier, feature } = input;
  const offRefusal =
    'More than 100 mm off in X or Y is a slip in the inputs, not a position error.';
  requireLength(dxNm, MAX_OFFSET_NM, offRefusal);
  requireLength(dyNm, MAX_OFFSET_NM, offRefusal);

  const dx = BigInt(dxNm);
  const dy = BigInt(dyNm);
  const squared = 4n * (dx * dx + dy * dy);
  const position = rootBracket(squared);
  const unjudged = {
    bonusNm: null,
    allowedNm: null,
    margin: null,
    outOfSize: null,
    withoutBonus: null,
  };
  if (toleranceNm === null) return { position, verdict: 'no-tolerance', ...unjudged };

  requireLength(
    toleranceNm,
    MAX_TOLERANCE_NM,
    'A position tolerance over 100 mm is a slip in the inputs.',
  );
  if (toleranceNm < 0) throw new RangeError('The tolerance cannot be negative.');
  if (toleranceNm === 0 && modifier === 'rfs') {
    throw new RangeError(
      'A zero tolerance needs MMC or LMC. Regardless of size it would allow no position error at all.',
    );
  }

  if (modifier === 'rfs') {
    const judged = against(squared, position, toleranceNm);
    return {
      position,
      verdict: judged.verdict,
      bonusNm: null,
      allowedNm: toleranceNm,
      margin: judged.margin,
      outOfSize: null,
      withoutBonus: null,
    };
  }

  const { size } = input;
  if (size === null) return { position, verdict: 'needs-size', ...unjudged };
  requireSize(size.smallestNm);
  requireSize(size.largestNm);
  requireSize(size.measuredNm);
  if (size.smallestNm > size.largestNm) {
    throw new RangeError(
      'The smallest size is larger than the largest: the limits are the wrong way round.',
    );
  }
  if (size.largestNm - size.smallestNm > MAX_SIZE_RANGE_NM) {
    throw new RangeError('A size range over 100 mm is a slip in the inputs.');
  }
  if (size.measuredNm < size.smallestNm || size.measuredNm > size.largestNm) {
    return {
      position,
      verdict: 'out-of-size',
      ...unjudged,
      outOfSize: size.measuredNm < size.smallestNm ? 'below' : 'above',
    };
  }

  const bonusNm = bonusFor(modifier, feature, size);
  const allowedNm = toleranceNm + bonusNm;
  const judged = against(squared, position, allowedNm);
  return {
    position,
    verdict: judged.verdict,
    bonusNm,
    allowedNm,
    margin: judged.margin,
    outOfSize: null,
    withoutBonus: against(squared, position, toleranceNm),
  };
}
