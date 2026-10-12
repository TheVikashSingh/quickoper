/**
 * What the countersink and chamfer page SHOWS, as data rather than as DOM.
 *
 * The same split as the bolt circle and true position pages, for the same
 * reason (D72): the page maps this object onto the DOM and does no
 * arithmetic, and `tests/calc/cone-display.test.ts` checks the STRINGS.
 *
 * ─── Rounding, once ─────────────────────────────────────────────────────────
 *
 * Every length shown is a whole number of display steps, 0.0001 mm or
 * 0.0001 in, rounded half-even ONCE: an input from its whole nanometres, an
 * answer from the bracket `cone.ts` hands over. The tangent in the working is
 * printed to seven decimals for the reader; nothing is worked from that
 * printed figure.
 *
 * ─── Printed arithmetic ─────────────────────────────────────────────────────
 *
 * When every input is a whole number of display steps, each line of the
 * working is worked from the very figures it prints, and "drill to", the
 * full-diameter depth plus the point length, adds up as printed: a whole
 * number of steps plus a rounded length rounds the same as their sum. An
 * input with more decimals than the page shows makes the working say its
 * figures are rounded.
 */

import { coneDepth, coneDiameter, shifted, MAX_LENGTH_NM } from './cone';
import { formatSteps, STEP_NM, toNm, type DisplayUnits } from './hole-pattern-display';
import { roundHalfEven } from './tap-drill';
import { bracketSteps, wholeSteps, type Fact } from './true-position-display';
import type { Bracket } from './true-position';

/** What is worked out: a cone's depth, its diameter, or a drill's point. */
export type ConeMode = 'depth' | 'diameter' | 'point';

export interface ConeInput {
  readonly mode: ConeMode;
  readonly units: DisplayUnits;
  /** The tool's included angle in degrees; NaN while blank. */
  readonly angle: number;
  /** Depth: the diameter at the surface. Point: the drill's. Null while blank. */
  readonly diameter: number | null;
  /** Depth and diameter: the flat on the tool's tip; null is a sharp point. */
  readonly tipFlat: number | null;
  /** Depth: a hole drilled first; null when there is none. */
  readonly hole: number | null;
  /** Diameter: from the surface to the tool's tip; null while blank. */
  readonly depth: number | null;
  /** Point: the depth the full diameter has to reach; null when not asked. */
  readonly fullDepth: number | null;
}

/** The drawing: a section through the cone, in the display unit, as shown. */
export interface ConeFigure {
  readonly kind: 'countersink' | 'point';
  /** Which length was worked out, drawn in the accent colour. */
  readonly answer: 'depth' | 'diameter';
  readonly angle: number;
  /** Half the diameter at the surface, or of the drill. */
  readonly surfaceR: number;
  /** Half the tip flat; 0 for a sharp point. */
  readonly tipR: number;
  /** From the surface to the tip: the tool depth, or the point length. */
  readonly depth: number;
  /** Half a hole drilled first, and how far down it the cone reaches. */
  readonly holeR: number | null;
  readonly holeDepth: number | null;
  /** A drill's point: the depth the full diameter has to reach, when asked. */
  readonly fullDepth: number | null;
}

export interface ConeDisplay {
  readonly units: DisplayUnits;
  readonly headline: string;
  readonly detail: string;
  readonly summary: readonly Fact[];
  /** A warning the answer carries with it; null when there is none. */
  readonly caution: string | null;
  /** The "how this was calculated" block, verbatim. */
  readonly working: string;
  readonly figure: ConeFigure;
}

const PLACES = 4;

const ROUNDED_NOTE =
  'An input has more decimal places than are shown here. Every figure is worked\n' +
  'from the inputs as typed and rounded once, half to even, so a line above can\n' +
  'be a step out in its last decimal as printed.';

const SOURCE =
  'The rule: Severance Tool Industries, countersink angle guide,\n' +
  'depth = (D − d) / (2 × tan(angle / 2)) and D = d + 2 × depth × tan(angle / 2).';

const CHISEL =
  'Worked to the sharp point the angle describes, as drill charts and CAM tip ' +
  'compensation are. A real drill has a chisel edge where its lips meet, so its ' +
  'tip stops a little short of that point: drilled to the full-diameter depth ' +
  'plus this, the full diameter goes slightly deeper than asked, never shallower.';

/** Steps as a figure at four places: "6.0000". */
const fixed = (s: number): string => formatSteps(s);

/** Steps as a figure the way it was typed, trailing zeros dropped: "0.5". */
const trimmed = (s: number): string => formatSteps(s).replace(/\.?0+$/, '');

/** Steps as a number, for the drawing. */
const asNumber = (s: number): number => s / 10 ** PLACES;

/** An angle for the working: at most four places, "41°", "41.25°". */
const degrees = (deg: number): string => `${roundHalfEven(deg, PLACES)}°`;

/**
 * Every length the page takes, as whole nanometres: a number, not below
 * zero, and no more than 10 m.
 */
function lengthNm(value: number | null, units: DisplayUnits, blank: string): number {
  if (value === null || Number.isNaN(value)) throw new RangeError(blank);
  const nm = toNm(value, units);
  if (nm < 0) throw new RangeError('A length is zero or more.');
  if (nm > MAX_LENGTH_NM)
    throw new RangeError('A length over 10 m is a slip in the inputs.');
  return nm;
}

/** The included angle, checked, with the words the page refuses it in. */
function includedAngle(angle: number): number {
  if (Number.isNaN(angle))
    throw new RangeError('Enter the included angle of the tool, in degrees.');
  if (!(angle > 0 && angle < 180)) {
    throw new RangeError(
      'The included angle is more than 0° and less than 180°. A 45° chamfer is cut with a 90° tool.',
    );
  }
  return angle;
}

/** "tan(θ/2) = tan 45° = 1", or to seven decimals: "tan 41° = 0.8692867". */
function tangentLine(angle: number): string {
  if (angle === 90) return 'tan(θ/2) = tan 45° = 1';
  const t = Math.tan((angle / 2) * (Math.PI / 180));
  return `tan(θ/2) = tan ${degrees(angle / 2)} = ${roundHalfEven(t, 7).toFixed(7)}`;
}

/** The tangent as it appears inside a line of the working. */
function tangentTerm(angle: number): string {
  if (angle === 90) return '1';
  return roundHalfEven(Math.tan((angle / 2) * (Math.PI / 180)), 7).toFixed(7);
}

/**
 * Everything the countersink and chamfer page shows, computed and formatted.
 *
 * Throws `RangeError` with the sentence the page shows the user.
 */
export function coneDisplay(input: ConeInput): ConeDisplay {
  const { units: u, mode } = input;
  const angle = includedAngle(input.angle);
  /** Every input shown is exactly what was typed; see "Printed arithmetic". */
  let allShown = true;
  /** An input, as whole steps for printing, noting if any decimal is lost. */
  const shown = (nm: number): number => {
    allShown &&= nm % STEP_NM[u] === 0;
    return wholeSteps(nm, u);
  };
  const result = (b: Bracket): number => bracketSteps(b, u);

  const lines: string[] = [
    `θ = ${degrees(angle)} included, ${degrees(angle / 2)} each side`,
    tangentLine(angle),
    '',
  ];
  const t = tangentTerm(angle);
  const half = degrees(angle / 2);

  if (mode === 'point') {
    const drillNm = lengthNm(input.diameter, u, "Enter the drill's diameter.");
    if (drillNm === 0)
      throw new RangeError("The drill's diameter has to be more than zero.");
    const point = coneDepth(drillNm, 0, angle);
    const dS = shown(drillNm);
    const pS = result(point);
    lines.push(
      'Point length, from the tip back to where the full diameter starts:',
      'L = D ÷ (2 × tan(θ/2))',
      `  = ${trimmed(dS)} ÷ (2 × ${t})`,
      `  = ${fixed(pS)} ${u}`,
    );
    const summary: Fact[] = [{ label: 'Point length', value: `${fixed(pS)} ${u}` }];
    let fullR: number | null = null;
    if (input.fullDepth !== null) {
      const fullNm = lengthNm(input.fullDepth, u, 'Enter the full-diameter depth.');
      const toS = result(shifted(point, fullNm));
      const fS = shown(fullNm);
      lines.push(
        '',
        'Drill to, so the full diameter reaches the depth asked for:',
        `H + L = ${trimmed(fS)} + ${fixed(pS)}`,
        `      = ${fixed(toS)} ${u}`,
      );
      summary.push({ label: 'Drill to', value: `${fixed(toS)} ${u}` });
      fullR = asNumber(fS);
    }
    lines.push(
      '',
      'Worked to the sharp point; a real chisel edge stops a little short of it.',
    );
    if (!allShown) lines.push('', ROUNDED_NOTE);
    lines.push('', SOURCE);
    return {
      units: u,
      headline: `${fixed(pS)} ${u}`,
      detail: `The point length of a Ø${trimmed(dS)} ${u} drill at ${degrees(angle)}: from the tip back to where the full diameter starts.`,
      summary,
      caution: CHISEL,
      working: lines.join('\n'),
      figure: {
        kind: 'point',
        answer: 'depth',
        angle,
        surfaceR: asNumber(dS) / 2,
        tipR: 0,
        depth: asNumber(pS),
        holeR: null,
        holeDepth: null,
        fullDepth: fullR,
      },
    };
  }

  // ─── Countersinks and chamfers ────────────────────────────────────────
  const flatNm =
    input.tipFlat === null
      ? 0
      : lengthNm(input.tipFlat, u, 'Enter the tip flat, or leave it blank.');
  const fS = shown(flatNm);
  const flat = flatNm === 0 ? '0 (a sharp point)' : trimmed(fS);

  if (mode === 'diameter') {
    const depthNm = lengthNm(
      input.depth,
      u,
      "Enter the depth from the surface to the tool's tip.",
    );
    const diameter = coneDiameter(flatNm, depthNm, angle);
    const zS = shown(depthNm);
    const dS = result(diameter);
    lines.push(
      "Diameter at the surface, with the tool's tip at depth Z:",
      'D = f + 2 × Z × tan(θ/2)',
      `  = ${flatNm === 0 ? '0' : trimmed(fS)} + 2 × ${trimmed(zS)} × ${t}`,
      `  = ${fixed(dS)} ${u}`,
      '',
      `f, the flat on the tool's tip: ${flat}`,
    );
    if (!allShown) lines.push('', ROUNDED_NOTE);
    lines.push('', SOURCE);
    return {
      units: u,
      headline: `Ø${fixed(dS)} ${u}`,
      detail: `At the surface, with the tool's tip ${trimmed(zS)} ${u} deep at ${degrees(angle)} included (${half} each side).`,
      summary: [
        { label: 'Diameter at the surface', value: `Ø${fixed(dS)} ${u}` },
        { label: 'Each side', value: half },
      ],
      caution: null,
      working: lines.join('\n'),
      figure: {
        kind: 'countersink',
        answer: 'diameter',
        angle,
        surfaceR: asNumber(dS) / 2,
        tipR: asNumber(fS) / 2,
        depth: asNumber(zS),
        holeR: null,
        holeDepth: null,
        fullDepth: null,
      },
    };
  }

  // Depth from a diameter.
  const outerNm = lengthNm(input.diameter, u, 'Enter the diameter at the surface.');
  if (outerNm === 0)
    throw new RangeError('The diameter at the surface has to be more than zero.');
  if (flatNm >= outerNm) {
    throw new RangeError(
      'The tip flat has to be smaller than the diameter at the surface.',
    );
  }
  const depth = coneDepth(outerNm, flatNm, angle);
  const dS = shown(outerNm);
  const zS = result(depth);
  lines.push(
    "Tool depth, from the surface to the tool's tip:",
    'Z = (D − f) ÷ (2 × tan(θ/2))',
    `  = (${trimmed(dS)} − ${flatNm === 0 ? '0' : trimmed(fS)}) ÷ (2 × ${t})`,
    `  = ${fixed(zS)} ${u}`,
    '',
    `f, the flat on the tool's tip: ${flat}`,
  );
  const summary: Fact[] = [
    { label: 'Tool depth', value: `${fixed(zS)} ${u}` },
    { label: 'Each side', value: half },
  ];
  let holeR: number | null = null;
  let holeDepth: number | null = null;
  if (input.hole !== null) {
    const holeNm = lengthNm(input.hole, u, 'Enter the hole, or leave it blank.');
    if (holeNm === 0)
      throw new RangeError('A hole has to be more than zero across, or leave it blank.');
    if (holeNm >= outerNm) {
      throw new RangeError(
        'The hole has to be smaller than the diameter at the surface, or the cone never meets it.',
      );
    }
    if (holeNm <= flatNm) {
      throw new RangeError(
        "The hole has to be wider than the tool's tip flat, or the flat floors the countersink before the cone reaches the hole.",
      );
    }
    const into = coneDepth(outerNm, holeNm, angle);
    const hS = shown(holeNm);
    const iS = result(into);
    lines.push(
      '',
      "Where the cone meets the hole's wall, below the surface:",
      '(D − d) ÷ (2 × tan(θ/2))',
      `  = (${trimmed(dS)} − ${trimmed(hS)}) ÷ (2 × ${t})`,
      `  = ${fixed(iS)} ${u}`,
    );
    summary.splice(1, 0, { label: 'Into the hole', value: `${fixed(iS)} ${u}` });
    holeR = asNumber(hS) / 2;
    holeDepth = asNumber(iS);
  }
  if (!allShown) lines.push('', ROUNDED_NOTE);
  lines.push('', SOURCE);
  return {
    units: u,
    headline: `${fixed(zS)} ${u} deep`,
    detail: `From the surface to the tool's tip, for Ø${trimmed(dS)} ${u} at ${degrees(angle)} included (${half} each side).`,
    summary,
    caution: null,
    working: lines.join('\n'),
    figure: {
      kind: 'countersink',
      answer: 'depth',
      angle,
      surfaceR: asNumber(dS) / 2,
      tipR: asNumber(fS) / 2,
      depth: asNumber(zS),
      holeR,
      holeDepth,
      fullDepth: null,
    },
  };
}
