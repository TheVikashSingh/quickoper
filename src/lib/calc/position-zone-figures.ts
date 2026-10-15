/**
 * The figures on /machining/position-tolerance-zone, a derivation page.
 *
 * ─── Why a module and not the page's frontmatter ────────────────────────────
 *
 * As for the other derivations (D110, D112): the page types no figure. Every
 * number it prints is a string returned here, and every verdict is the true
 * position engine's own `checkPosition`, decided on exact squares in BigInt.
 * `tests/calc/position-zone-figures.test.ts` pins each figure against what a
 * source printed or against the derivation it stands for.
 *
 * ─── The sources ────────────────────────────────────────────────────────────
 *
 *   - GD&T Basics, "True Position": a square zone "removed over 57%" of the
 *     tolerance zone, a reply on the same page that the circle gives "57%
 *     more", and the worked hole .003 in off in X and .002 in in Y, which it
 *     works to ".007" against a .008 tolerance. Read 2026-10-15.
 *   - Xometry, "True Position Tolerance" (published 2026-08-13): "57% more
 *     usable tolerance area" than an equivalent square. Read 2026-10-15.
 *
 * ─── Rounding (CLAUDE.md rule 3) ────────────────────────────────────────────
 *
 * Positions are the engine's bracket (`checkPosition`), rounded once,
 * half-even, to four places of an inch by `bracketSteps`, which is exact.
 * The ratios — π/2, 2/π, √2 and π/4 — are irrational, so no percentage here
 * can land on a tie, and they are rounded from the float, once.
 */

import { formatSteps } from './hole-pattern-display';
import { roundHalfEven } from './tap-drill';
import { checkPosition } from './true-position';
import { bracketSteps } from './true-position-display';

const fixed = (value: number, decimals: number): string =>
  roundHalfEven(value, decimals).toFixed(decimals);

/** One inch, exactly, in nanometres. */
const NM_PER_IN = 25_400_000;

/** A decimal inch figure as whole nanometres; every one used here is exact. */
function inNm(inch: number): number {
  const v = Math.round(inch * NM_PER_IN);
  if (Math.abs(v - inch * NM_PER_IN) > 1e-6) {
    throw new RangeError(`${inch} in is not a whole number of nanometres`);
  }
  return v;
}

/** The engine's position, 2√(dx² + dy²), as a four-place inch figure. */
function positionIn(dxIn: number, dyIn: number): string {
  const check = checkPosition({
    dxNm: inNm(dxIn),
    dyNm: inNm(dyIn),
    toleranceNm: null,
    modifier: 'rfs',
    feature: 'hole',
    size: null,
  });
  return formatSteps(bracketSteps(check.position, 'in'));
}

/** The engine's verdict: is the axis inside a diameter, edge included? */
function insideCircle(dxIn: number, dyIn: number, diameterIn: number): boolean {
  const check = checkPosition({
    dxNm: inNm(dxIn),
    dyNm: inNm(dyIn),
    toleranceNm: inNm(diameterIn),
    modifier: 'rfs',
    feature: 'hole',
    size: null,
  });
  return check.verdict === 'within';
}

/** ± in X and in Y: a square, edge included, decided in whole nanometres. */
function insideSquare(dxIn: number, dyIn: number, plusMinusIn: number): boolean {
  const t = inNm(plusMinusIn);
  return Math.abs(inNm(dxIn)) <= t && Math.abs(inNm(dyIn)) <= t;
}

// ─── The worked drawing ────────────────────────────────────────────────────

/** The coordinate drawing: ±.005 in, X and Y. */
const PLUS_MINUS = 0.005;

/**
 * The two four-place diameters either side of 2√2 × .005 = .0141421…: the one
 * above contains the square, the one below cuts its corners.
 */
const ABOVE = 0.0142;
const BELOW = 0.0141;

/** The inscribed circle: the same .010 across, as a diameter. */
const INSCRIBED = 0.01;

/** GD&T Basics' hole, and three that tell the zones apart. */
const PARTS = [
  { name: 'GD&T Basics’ hole', dx: 0.003, dy: 0.002 },
  { name: 'In the corner', dx: 0.005, dy: 0.005 },
  { name: 'Along X, past the side', dx: 0.007, dy: 0 },
  { name: 'Off both ways', dx: 0.0045, dy: 0.0045 },
] as const;

// ─── The figures ───────────────────────────────────────────────────────────

export interface PartRow {
  name: string;
  dx: string;
  dy: string;
  position: string;
  square: boolean;
  above: boolean;
  below: boolean;
  inscribed: boolean;
}

export interface PositionZoneFigures {
  /** How much bigger the circle through the square's corners is: (π/2 − 1). */
  moreArea: string;
  /** How much of that circle the square leaves out: (1 − 2/π). */
  squareLeavesOut: string;
  /** How much further the circle reaches along X or Y: (√2 − 1). */
  axisReach: string;
  /** The circle inside the square, as a share of it: π/4. */
  inscribedShare: string;
  /** The square's diagonal reach against its side: √2. */
  root2: string;
  /** 2√2, the factor from ± t to the circumscribing diameter. */
  twoRoot2: string;
  /** 1 / (2√2), the factor from a diameter to the inscribed ± square. */
  inscribedPlusMinus: string;
  drawing: {
    plusMinus: string;
    exact: string;
    above: string;
    below: string;
    inscribed: string;
    /** The inscribed square of a .010 diameter: ± .010 / (2√2). */
    backToSquare: string;
  };
  parts: PartRow[];
  /** GD&T Basics' worked hole against its .008 tolerance. */
  gdtBasics: {
    position: string;
    threePlaces: string;
    tolerance: string;
    within: boolean;
  };
}

/** An inch figure as a shop writes it, without the leading zero: ".0141". */
function shop(text: string): string {
  return text.startsWith('0.') ? text.slice(1) : text;
}

/**
 * A typed inch input as a shop writes it: four places at most, three at
 * least, no leading zero. .005, .0045, .010.
 */
function short(inch: number): string {
  const text = shop(formatSteps(Math.round(inch * 10_000)));
  return text.endsWith('0') && text.length > 4 ? text.slice(0, -1) : text;
}

export function positionZoneFigures(): PositionZoneFigures {
  const exact = 2 * Math.SQRT2 * PLUS_MINUS;
  const four = (inch: number) => shop(formatSteps(Math.round(inch * 10_000)));
  const gdt = positionIn(0.003, 0.002);
  return {
    moreArea: fixed((Math.PI / 2 - 1) * 100, 2),
    squareLeavesOut: fixed((1 - 2 / Math.PI) * 100, 2),
    axisReach: fixed((Math.SQRT2 - 1) * 100, 2),
    inscribedShare: fixed((Math.PI / 4) * 100, 2),
    root2: fixed(Math.SQRT2, 4),
    twoRoot2: fixed(2 * Math.SQRT2, 4),
    inscribedPlusMinus: fixed(1 / (2 * Math.SQRT2), 4),
    drawing: {
      plusMinus: short(PLUS_MINUS),
      exact: shop(fixed(exact, 6)),
      above: four(ABOVE),
      below: four(BELOW),
      inscribed: short(INSCRIBED),
      backToSquare: shop(fixed(INSCRIBED / (2 * Math.SQRT2), 6)),
    },
    parts: PARTS.map((p) => ({
      name: p.name,
      dx: short(p.dx),
      dy: short(p.dy),
      position: shop(positionIn(p.dx, p.dy)),
      square: insideSquare(p.dx, p.dy, PLUS_MINUS),
      above: insideCircle(p.dx, p.dy, ABOVE),
      below: insideCircle(p.dx, p.dy, BELOW),
      inscribed: insideCircle(p.dx, p.dy, INSCRIBED),
    })),
    gdtBasics: {
      position: shop(gdt),
      threePlaces: shop(fixed(2 * Math.hypot(0.003, 0.002), 3)),
      tolerance: short(0.008),
      within: insideCircle(0.003, 0.002, 0.008),
    },
  };
}
