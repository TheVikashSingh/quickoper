/**
 * What the true position page SHOWS, as data rather than as DOM.
 *
 * The same split as the bolt circle and tap drill pages, for the same reason
 * (D72): the page maps this object onto the DOM and does no arithmetic, and
 * `tests/calc/true-position-display.test.ts` checks the STRINGS.
 *
 * ─── Rounding, once ─────────────────────────────────────────────────────────
 *
 * Every length shown is a whole number of display steps, 0.0001 mm or
 * 0.0001 in, rounded half-even ONCE: an input, a deviation or a bonus from its
 * whole nanometres, and the position and the margin from the exact bracket
 * `true-position.ts` hands over. Integer arithmetic throughout, so nothing
 * here can tip a tie the wrong way.
 *
 * ─── Printed arithmetic ─────────────────────────────────────────────────────
 *
 * The spec asks that every line of the working add up AS PRINTED, and that
 * the working say so where one does not (calculations.md §6). The Android app
 * needs that check line by line: it shows a length in the other unit from the
 * one typed, and 0.2 mm + 0.05 mm shown in inches reads 0.0079 + 0.0020 =
 * 0.0098. This page has one unit, and then the check comes down to one
 * condition. When every input is a whole number of display steps:
 *
 *   - a difference or a sum of inputs is exact, and prints exactly;
 *   - the deviations print exactly, so the position line is worked from the
 *     very figures it shows;
 *   - a margin, allowed minus position, prints as the difference of the two
 *     printed figures unless the position sits EXACTLY on a half step. It
 *     cannot: with dx = a and dy = b whole steps, the position is
 *     2s√(a² + b²) for a step s, and √(a² + b²) is a whole number or
 *     irrational, never the odd number of quarters a half step needs.
 *
 * So a line can only be off as printed when an input has more decimal places
 * than the page shows, and that is when the working says its figures are
 * rounded. A property test parses the printed lines and holds this.
 */

import { formatSteps, STEP_NM, toNm, type DisplayUnits } from './hole-pattern-display';
import { MAX_REACH_NM } from './hole-pattern';
import {
  checkPosition,
  type Against,
  type Bracket,
  type Feature,
  type Modifier,
  type Verdict,
} from './true-position';

/**
 * A bracketed length as whole display steps, rounded once, half-even.
 *
 * Exact: a step is 100 or 2540 nm, so every rounding boundary — half a step
 * past a whole one — is a whole nanometre. A value strictly between two whole
 * nanometres is never on one, and lies on the same side of it as its floor.
 */
export function bracketSteps(b: Bracket, units: DisplayUnits): number {
  const step = STEP_NM[units];
  const half = step / 2;
  const k = Math.floor(b.floor / step);
  const rem = b.floor - k * step;
  let r: number;
  if (!b.exact) r = rem >= half ? k + 1 : k;
  else if (rem !== half) r = rem > half ? k + 1 : k;
  else r = k % 2 === 0 ? k : k + 1;
  return r === 0 ? 0 : r;
}

/** Whole nanometres as whole display steps, rounded once, half-even. */
export function wholeSteps(nm: number, units: DisplayUnits): number {
  return bracketSteps({ floor: nm, exact: true }, units);
}

/** Steps as a figure at four places: "0.0620". */
const fixed = (s: number): string => formatSteps(s);

/** Steps as a figure with its trailing zeros dropped, the way it was typed: "0.062". */
const trimmed = (s: number): string => formatSteps(s).replace(/\.?0+$/, '');

/** A figure to square in the working: a negative one goes in brackets. */
const squaredTerm = (s: number): string => (s < 0 ? `(${fixed(s)})²` : `${fixed(s)}²`);

export interface Fact {
  readonly label: string;
  readonly value: string;
}

/** The drawing: deviation space, with the true position at the origin. */
export interface PositionFigure {
  /** The axis from the true position, in the display unit, as shown. */
  readonly x: number;
  readonly y: number;
  /** The zone as stated, t / 2; null with no tolerance given. */
  readonly zoneR: number | null;
  /** The zone with the bonus counted, when there is a bonus above zero. */
  readonly allowedR: number | null;
  /** Inside what it is judged against; null when it is not judged. */
  readonly inside: boolean | null;
}

export interface TruePositionDisplay {
  readonly units: DisplayUnits;
  readonly verdict: Verdict;
  /** How the page colours the verdict. */
  readonly tone: 'pass' | 'fail' | 'none';
  readonly headline: string;
  readonly detail: string;
  /** At MMC or LMC with the feature in size: the same check with no bonus. */
  readonly withoutBonus: string | null;
  readonly summary: readonly Fact[];
  /** The "how this was calculated" block, verbatim. */
  readonly working: string;
  readonly figure: PositionFigure;
}

interface CommonInput {
  readonly units: DisplayUnits;
  /** The diameter in the feature control frame; null while it is blank. */
  readonly tolerance: number | null;
  readonly modifier: Modifier;
  readonly feature: Feature;
  /** Each null while its field is blank. Not read regardless of feature size. */
  readonly smallest: number | null;
  readonly largest: number | null;
  readonly measured: number | null;
}

export type TruePositionInput = CommonInput &
  (
    | {
        readonly entry: 'coordinates';
        readonly drawnX: number;
        readonly drawnY: number;
        readonly measuredX: number;
        readonly measuredY: number;
      }
    | {
        readonly entry: 'deviations';
        /** Measured minus drawn, as a CMM reports it. */
        readonly dx: number;
        readonly dy: number;
      }
  );

const ROUNDED_NOTE =
  'An input has more decimal places than are shown here. Every figure is worked\n' +
  'from the inputs as typed and rounded once, half to even, so a line above can\n' +
  'be a step out in its last decimal as printed.';

const NOT_COUNTED =
  'Not counted: datum feature shift, zones that are a width rather than a\n' +
  'diameter, and spherical zones.';

const NAMES: Readonly<Record<Modifier, string>> = {
  rfs: 'regardless of feature size',
  mmc: 'MMC',
  lmc: 'LMC',
};

/** Which size counts, for each of the four cases (calculations.md §6). */
const WHICH_SIZE: Readonly<Record<'mmc' | 'lmc', Readonly<Record<Feature, string>>>> = {
  mmc: {
    hole:
      "Measured size: the hole's mating size, the largest perfect pin that fits in it.\n" +
      'A bore gauge in an out-of-round hole can read larger, which would count too\n' +
      'much bonus.',
    pin:
      "Measured size: the pin's mating size, the smallest perfect ring that fits over\n" +
      'it. A two-point reading across an out-of-round pin can read smaller, which\n' +
      'would count too much bonus.',
  },
  lmc: {
    hole:
      "Measured size: the hole's minimum material size, the smallest perfect cylinder\n" +
      'that encloses it. A two-point reading in an out-of-round hole can read\n' +
      'smaller, which would count too much bonus.',
    pin:
      "Measured size: the pin's minimum material size, the largest perfect cylinder\n" +
      'inside it. A two-point reading across an out-of-round pin can read larger,\n' +
      'which would count too much bonus.',
  },
};

/**
 * A coordinate, as whole nanometres, no further than 100 m from the datum —
 * past that the difference of two of them would not be exact.
 */
function coordinateNm(value: number, units: DisplayUnits): number {
  const nm = toNm(value, units);
  if (Math.abs(nm) > MAX_REACH_NM) {
    throw new RangeError(
      'A coordinate more than 100 m from the datum is a slip in the inputs.',
    );
  }
  return nm;
}

/** "by 0.0311 mm", "by less than 0.0001 mm", or "exactly on the limit". */
function byText(margin: Bracket, u: DisplayUnits): string {
  if (margin.exact && margin.floor === 0) return 'exactly on the limit';
  const s = bracketSteps(margin, u);
  return s === 0 ? `by less than 0.0001 ${u}` : `by ${fixed(s)} ${u}`;
}

/**
 * One verdict line: "0.2169 ≤ 0.2480: within, by 0.0311 mm".
 *
 * A "≤" always holds as printed — rounding never reverses an order — but a
 * ">" may not: 1.6 nm over a limit prints the same figure as the limit, so
 * that line reads "against" instead.
 */
function verdictLine(
  judged: Against,
  positionSteps: number,
  allowedSteps: number,
  u: DisplayUnits,
): string {
  const p = fixed(positionSteps);
  const a = fixed(allowedSteps);
  const by = byText(judged.margin, u);
  if (judged.verdict === 'within') return `${p} ≤ ${a}: within, ${by}`;
  return `${p} ${positionSteps > allowedSteps ? '>' : 'against'} ${a}: over, ${by}`;
}

/**
 * Everything the true position page shows, computed and formatted.
 *
 * Throws `RangeError` with the sentence the page shows the user.
 */
export function truePositionDisplay(input: TruePositionInput): TruePositionDisplay {
  const { units: u, modifier, feature } = input;
  const lines: string[] = [];
  /** Every input shown is exactly what was typed; see "Printed arithmetic". */
  let allShown = true;
  const shown = (nm: number): void => {
    allShown &&= nm % STEP_NM[u] === 0;
  };

  // ─── The deviation ────────────────────────────────────────────────────
  let dxNm: number;
  let dyNm: number;
  if (input.entry === 'coordinates') {
    const drawnX = coordinateNm(input.drawnX, u);
    const drawnY = coordinateNm(input.drawnY, u);
    const measuredX = coordinateNm(input.measuredX, u);
    const measuredY = coordinateNm(input.measuredY, u);
    [drawnX, drawnY, measuredX, measuredY].forEach(shown);
    dxNm = measuredX - drawnX;
    dyNm = measuredY - drawnY;
    const at = (nm: number): string => trimmed(wholeSteps(nm, u));
    // A negative figure after a minus sign goes in brackets: 1 − (-2).
    const less = (nm: number): string => (nm < 0 ? `(${at(nm)})` : at(nm));
    lines.push(
      `dx = measured X − drawn X = ${at(measuredX)} − ${less(drawnX)} = ${fixed(wholeSteps(dxNm, u))} ${u}`,
      `dy = measured Y − drawn Y = ${at(measuredY)} − ${less(drawnY)} = ${fixed(wholeSteps(dyNm, u))} ${u}`,
    );
  } else {
    dxNm = toNm(input.dx, u);
    dyNm = toNm(input.dy, u);
    [dxNm, dyNm].forEach(shown);
    lines.push(
      `dx = ${trimmed(wholeSteps(dxNm, u))} ${u}, dy = ${trimmed(wholeSteps(dyNm, u))} ${u} (measured − drawn)`,
    );
  }

  const toleranceNm = input.tolerance === null ? null : toNm(input.tolerance, u);
  if (toleranceNm !== null) shown(toleranceNm);
  const size =
    modifier === 'rfs' ||
    input.smallest === null ||
    input.largest === null ||
    input.measured === null
      ? null
      : {
          smallestNm: toNm(input.smallest, u),
          largestNm: toNm(input.largest, u),
          measuredNm: toNm(input.measured, u),
        };
  if (size !== null) [size.smallestNm, size.largestNm, size.measuredNm].forEach(shown);
  const check = checkPosition({ dxNm, dyNm, toleranceNm, modifier, feature, size });

  // ─── The position ─────────────────────────────────────────────────────
  const dxSteps = wholeSteps(dxNm, u);
  const dySteps = wholeSteps(dyNm, u);
  const positionSteps = bracketSteps(check.position, u);
  lines.push(
    `position = 2 × √(${squaredTerm(dxSteps)} + ${squaredTerm(dySteps)}) = ${fixed(positionSteps)} ${u}`,
  );

  // ─── The verdict ──────────────────────────────────────────────────────
  const featureName = feature === 'hole' ? 'Hole' : 'Pin';
  const summary: Fact[] = [{ label: 'Position', value: `Ø${fixed(positionSteps)} ${u}` }];
  let tone: TruePositionDisplay['tone'];
  let headline: string;
  let detail: string;
  let withoutBonus: string | null = null;

  if (toleranceNm === null) {
    tone = 'none';
    headline = 'Position only';
    detail = 'Give the tolerance from the feature control frame for a pass or fail.';
    lines.push('', 'No tolerance given: the position alone, with no pass or fail.');
  } else if (modifier !== 'rfs' && (check.verdict === 'needs-size' || size === null)) {
    tone = 'none';
    headline = 'No pass or fail yet';
    detail =
      `At ${NAMES[modifier]} the tolerance grows with a bonus that depends on the size. ` +
      'Give the smallest and largest sizes and the measured size for a pass or fail.';
    lines.push(
      '',
      `At ${NAMES[modifier]} the bonus depends on the size: no pass or fail until the`,
      'smallest and largest sizes and the measured size are given.',
      WHICH_SIZE[modifier][feature],
    );
  } else if (modifier !== 'rfs' && check.verdict === 'out-of-size' && size !== null) {
    tone = 'fail';
    headline = 'Fails on size';
    const below = check.outOfSize === 'below';
    const where = below ? 'below the smallest' : 'above the largest';
    const measured = trimmed(wholeSteps(size.measuredNm, u));
    detail =
      `Measured Ø${fixed(wholeSteps(size.measuredNm, u))} ${u} is ${where} size, ` +
      `Ø${fixed(wholeSteps(below ? size.smallestNm : size.largestNm, u))} ${u}: ` +
      `the ${feature} fails on size whatever its position, and earns no bonus.`;
    lines.push(
      '',
      `${featureName} at ${NAMES[modifier]}, sizes ${trimmed(wholeSteps(size.smallestNm, u))} to ` +
        `${trimmed(wholeSteps(size.largestNm, u))} ${u}: measured ${measured} is ${where}.`,
      `The ${feature} fails on size whatever its position, and earns no bonus.`,
      WHICH_SIZE[modifier][feature],
    );
  } else {
    // Judged. checkPosition gives an allowed diameter and a margin whenever
    // the verdict is within or over, which is every case left.
    const verdict = check.verdict === 'within' ? 'within' : 'over';
    const toleranceSteps = wholeSteps(toleranceNm, u);
    const t = trimmed(toleranceSteps);
    const allowedNm = check.allowedNm ?? toleranceNm;
    const margin = check.margin ?? { floor: 0, exact: true };
    const allowedSteps = wholeSteps(allowedNm, u);
    tone = verdict === 'within' ? 'pass' : 'fail';
    headline = verdict === 'within' ? 'Within' : 'Over';
    detail =
      `Position Ø${fixed(positionSteps)} ${u} against Ø${fixed(allowedSteps)} ${u} allowed: ` +
      `${verdict}, ${byText(margin, u)}.`;
    summary.push({ label: 'Allowed', value: `Ø${fixed(allowedSteps)} ${u}` });

    if (modifier === 'rfs') {
      detail +=
        ' Regardless of feature size: no bonus is counted, and the size is not checked.';
      lines.push(
        '',
        `Regardless of feature size: allowed = tolerance = ${t} ${u}.`,
        'No bonus is counted, and the size is not checked.',
      );
    } else if (check.bonusNm !== null && size !== null) {
      const bonusSteps = wholeSteps(check.bonusNm, u);
      // A hole at MMC and a pin at LMC count up from the smallest size; the
      // other two count down from the largest.
      const upFromSmallest = (modifier === 'mmc') === (feature === 'hole');
      const left = upFromSmallest ? size.measuredNm : size.largestNm;
      const right = upFromSmallest ? size.smallestNm : size.measuredNm;
      const words = upFromSmallest ? 'measured − smallest' : 'largest − measured';
      summary.push({ label: 'Bonus', value: `${fixed(bonusSteps)} ${u}` });
      lines.push(
        '',
        `${featureName} at ${NAMES[modifier]}: bonus = ${words} = ` +
          `${trimmed(wholeSteps(left, u))} − ${trimmed(wholeSteps(right, u))} = ${fixed(bonusSteps)} ${u}`,
        WHICH_SIZE[modifier][feature],
        `allowed = tolerance + bonus = ${t} + ${fixed(bonusSteps)} = ${fixed(allowedSteps)} ${u}`,
      );
    }

    lines.push(
      '',
      verdictLine({ verdict, margin }, positionSteps, allowedSteps, u),
      'Decided in whole nanometres before any rounding: 4 × (dx² + dy²) ≤ allowed².',
    );

    if (check.withoutBonus !== null) {
      withoutBonus =
        `With no bonus, against Ø${t} ${u} alone: ` +
        `${check.withoutBonus.verdict}, ${byText(check.withoutBonus.margin, u)}.`;
      lines.push(
        '',
        'With no bonus, against the tolerance alone:',
        verdictLine(check.withoutBonus, positionSteps, toleranceSteps, u),
      );
    }
  }

  summary.push(
    { label: 'Off in X', value: `${fixed(dxSteps)} ${u}` },
    { label: 'Off in Y', value: `${fixed(dySteps)} ${u}` },
  );

  const working =
    'position = 2 × √(dx² + dy²)\n' +
    'A tolerance Ø t is a cylinder of diameter t round the true position\n' +
    '(ASME Y14.5): an axis r from it is inside when 2r ≤ t.\n\n' +
    `${lines.join('\n')}\n\n` +
    (allShown ? '' : `${ROUNDED_NOTE}\n\n`) +
    NOT_COUNTED;

  // The drawing is presentation: plain floats in the display unit.
  const unitNm = STEP_NM[u] * 10_000;
  return {
    units: u,
    verdict: check.verdict,
    tone,
    headline,
    detail,
    withoutBonus,
    summary,
    working,
    figure: {
      x: dxSteps / 10_000,
      y: dySteps / 10_000,
      zoneR: toleranceNm === null ? null : toleranceNm / 2 / unitNm,
      allowedR:
        check.bonusNm !== null && check.bonusNm > 0 && check.allowedNm !== null
          ? check.allowedNm / 2 / unitNm
          : null,
      inside: check.verdict === 'within' ? true : check.verdict === 'over' ? false : null,
    },
  };
}
