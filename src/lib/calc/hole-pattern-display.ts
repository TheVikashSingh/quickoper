/**
 * What the bolt circle page SHOWS, as data rather than as DOM.
 *
 * The same split as `tap-drill-display.ts`, for the same reason (D72): a page
 * once printed a figure a thousand times wrong past every test, because the
 * tests stopped at the module boundary and the page did its own conversion.
 * Here the page maps this object onto the DOM and does no arithmetic, and
 * `tests/calc/hole-pattern-display.test.ts` checks the STRINGS.
 *
 * ─── Rounding, once ─────────────────────────────────────────────────────────
 *
 * Every length on the page is a whole number of display steps — 0.0001 mm or
 * 0.0001 in — rounded half-even, once, from the value as computed. The steps
 * are integers, so everything after that is exact:
 *
 *   - A move is the difference of two shown positions, in steps. Keyed into a
 *     machine in incremental mode the moves land on every shown position
 *     exactly, however many holes there are.
 *   - A figure is printed from its steps, so it never reads "-0.0000" and a
 *     column of them aligns on the decimal point.
 */

import { boltCircle, holeGrid, type Direction, type PlacedHole } from './hole-pattern';
import { NM_PER_INCH, roundHalfEven } from './tap-drill';

export type DisplayUnits = 'mm' | 'in';

/** Gate 6: dimensional results render at four decimals. */
export const PLACES = 4;

/** One display step in nanometres: 0.0001 mm, or 0.0001 in. Both exact. */
export const STEP_NM: Readonly<Record<DisplayUnits, number>> = { mm: 100, in: 2_540 };

const STEPS_PER_UNIT = 10 ** PLACES;

/** Nanometres in one millimetre or one inch. */
const NM_PER: Readonly<Record<DisplayUnits, number>> = { mm: 1_000_000, in: NM_PER_INCH };

/**
 * Half-even to a whole number.
 *
 * Exact on a float that IS a tie: x − floor(x) loses nothing at these sizes,
 * so 250000.5 is seen as a tie and goes to the even 250000. (The display
 * helper in `tap-drill.ts` widens "a tie" by 1e-9 to absorb a decimal
 * scaled in floating point; these values are divisions of whole nanometres,
 * which need no widening.) Never returns −0.
 */
export function roundHalfEvenWhole(x: number): number {
  const floor = Math.floor(x);
  const diff = x - floor;
  const r =
    diff > 0.5 ? floor + 1 : diff < 0.5 ? floor : floor % 2 === 0 ? floor : floor + 1;
  return r === 0 ? 0 : r;
}

/** A length as whole display steps, rounded once from the value as computed. */
export function steps(valueNm: number, units: DisplayUnits): number {
  return roundHalfEvenWhole(valueNm / STEP_NM[units]);
}

/** Whole steps as fixed-point text: −1 is "-0.0001", 0 is "0.0000". */
export function formatSteps(count: number): string {
  const sign = count < 0 ? '-' : '';
  const abs = Math.abs(count);
  const whole = Math.floor(abs / STEPS_PER_UNIT);
  const frac = String(abs % STEPS_PER_UNIT).padStart(PLACES, '0');
  return `${sign}${whole}.${frac}`;
}

/** An input length in the user's unit, as whole nanometres. */
export function toNm(value: number, units: DisplayUnits): number {
  if (!Number.isFinite(value)) throw new RangeError('Enter every length as a number.');
  return Math.round(value * NM_PER[units]);
}

/** An input or derived length for the working: trimmed, at most four places. */
function plain(valueNm: number, units: DisplayUnits): string {
  return String(roundHalfEven(valueNm / NM_PER[units], PLACES));
}

/** An angle for the working: trimmed, at most four places. */
function plainAngle(deg: number): string {
  return `${roundHalfEven(deg, PLACES)}°`;
}

/** An angle for the table: fixed at four places. */
function tableAngle(deg: number): string {
  return formatSteps(roundHalfEvenWhole(deg * STEPS_PER_UNIT));
}

export interface HoleRow {
  readonly n: number;
  /** A bolt circle hole's angle, "72.0000". Null on a grid. */
  readonly angle: string | null;
  /** A grid hole's column and row, counted from 1. Null on a bolt circle. */
  readonly column: number | null;
  readonly row: number | null;
  /** The position from the datum, as shown. */
  readonly x: string;
  readonly y: string;
  /** The move from the previous hole; for hole 1, from the datum. */
  readonly dx: string;
  readonly dy: string;
  /** The shown position as whole display steps, which the moves are worked in. */
  readonly xSteps: number;
  readonly ySteps: number;
}

export interface Figure {
  /** Shown positions, in the display unit. */
  readonly holes: readonly {
    readonly n: number;
    readonly x: number;
    readonly y: number;
  }[];
  /** The bolt circle itself, for a circle or arc; null for a grid. */
  readonly circle: {
    readonly cx: number;
    readonly cy: number;
    readonly r: number;
  } | null;
  /** Where the pattern is placed from: the circle's centre or the first hole. */
  readonly origin: { readonly x: number; readonly y: number };
}

export interface PatternDisplay {
  readonly units: DisplayUnits;
  readonly rows: readonly HoleRow[];
  /** Label and value pairs for the result panel. */
  readonly summary: readonly { readonly label: string; readonly value: string }[];
  /** The "how this was calculated" block, verbatim. */
  readonly working: string;
  readonly figure: Figure;
  /** Header row first. */
  readonly csv: readonly (readonly string[])[];
}

export type PatternInput =
  | {
      readonly kind: 'circle';
      readonly units: DisplayUnits;
      readonly diameter: number;
      readonly holes: number;
      readonly startDeg: number;
      /** Null, or blank on the page, for a whole circle. */
      readonly arcDeg: number | null;
      readonly direction: Direction;
      readonly centreX: number;
      readonly centreY: number;
    }
  | {
      readonly kind: 'grid';
      readonly units: DisplayUnits;
      readonly columns: number;
      readonly rows: number;
      readonly spacingX: number;
      readonly spacingY: number;
      readonly turnDeg: number;
      readonly firstX: number;
      readonly firstY: number;
    };

const MOVES_NOTE =
  'Each move is the difference of two positions as shown, so in incremental\n' +
  'mode the moves land on every position in the table exactly.';

/** The table rows, with moves worked in whole display steps. */
function tableRows(holes: readonly PlacedHole[], units: DisplayUnits): HoleRow[] {
  let lastX = 0;
  let lastY = 0;
  return holes.map((h) => {
    const xSteps = steps(h.xNm, units);
    const ySteps = steps(h.yNm, units);
    const row: HoleRow = {
      n: h.n,
      angle: h.angleDeg === null ? null : tableAngle(h.angleDeg),
      column: h.column === null ? null : h.column + 1,
      row: h.row === null ? null : h.row + 1,
      x: formatSteps(xSteps),
      y: formatSteps(ySteps),
      dx: formatSteps(xSteps - lastX),
      dy: formatSteps(ySteps - lastY),
      xSteps,
      ySteps,
    };
    lastX = xSteps;
    lastY = ySteps;
    return row;
  });
}

function figureHoles(rows: readonly HoleRow[]): Figure['holes'] {
  return rows.map((r) => ({
    n: r.n,
    x: r.xSteps / STEPS_PER_UNIT,
    y: r.ySteps / STEPS_PER_UNIT,
  }));
}

/**
 * Everything the bolt circle page shows, computed and formatted.
 *
 * Throws `RangeError` with the sentence the page shows the user.
 */
export function patternDisplay(input: PatternInput): PatternDisplay {
  return input.kind === 'circle' ? circleDisplay(input) : gridDisplay(input);
}

function circleDisplay(input: Extract<PatternInput, { kind: 'circle' }>): PatternDisplay {
  const { units } = input;
  const diameterNm = toNm(input.diameter, units);
  const centreXNm = toNm(input.centreX, units);
  const centreYNm = toNm(input.centreY, units);
  const result = boltCircle({
    diameterNm,
    holes: input.holes,
    startDeg: input.startDeg,
    arcDeg: input.arcDeg,
    direction: input.direction,
    centreXNm,
    centreYNm,
  });
  const rows = tableRows(result.holes, units);
  const u = units;

  const summary: { label: string; value: string }[] = [
    { label: 'Holes', value: String(input.holes) },
  ];
  if (result.pitchDeg !== null) {
    summary.push({ label: 'Hole to hole', value: plainAngle(result.pitchDeg) });
  }
  if (result.chordNm !== null) {
    summary.push({
      label: 'Chord',
      value: `${formatSteps(steps(result.chordNm, u))} ${u}`,
    });
  }

  const cw = input.direction === 'cw';
  const pitchLine =
    result.pitchDeg === null
      ? 'one hole: no pitch'
      : input.arcDeg === null
        ? `pitch = 360° / ${input.holes} = ${plainAngle(result.pitchDeg)}`
        : `pitch = arc / (N − 1) = ${plainAngle(input.arcDeg)} / ${input.holes - 1} = ${plainAngle(result.pitchDeg)}`;

  // The working substitutes hole 2 — the first hole the pitch moves — or hole 1
  // when there is only one.
  const shown = result.holes[Math.min(1, result.holes.length - 1)];
  const shownRow = rows[Math.min(1, rows.length - 1)];
  let example = '';
  if (shown !== undefined && shownRow !== undefined && shown.angleDeg !== null) {
    const k = shown.n - 1;
    const turn =
      result.pitchDeg === null
        ? ''
        : ` ${cw ? '−' : '+'} ${k} × ${plainAngle(result.pitchDeg)}`;
    example =
      `Hole ${shown.n}:   θ = ${plainAngle(((input.startDeg % 360) + 360) % 360)}${turn} = ${plainAngle(shown.angleDeg)}\n` +
      `X = ${plain(centreXNm, u)} + ${plain(diameterNm / 2, u)} × cos ${plainAngle(shown.angleDeg)} = ${shownRow.x} ${u}\n` +
      `Y = ${plain(centreYNm, u)} + ${plain(diameterNm / 2, u)} × sin ${plainAngle(shown.angleDeg)} = ${shownRow.y} ${u}\n`;
  }
  const chordLine =
    result.chordNm === null || result.pitchDeg === null
      ? ''
      : `\nchord = D × sin(pitch / 2) = ${plain(diameterNm, u)} × sin ${plainAngle(result.pitchDeg / 2)} = ` +
        `${formatSteps(steps(result.chordNm, u))} ${u}\n`;

  const working =
    `X = Xc + R × cos θ      Y = Yc + R × sin θ\n` +
    `θ = θ0 ${cw ? '−' : '+'} (n − 1) × pitch, ${cw ? 'clockwise' : 'counterclockwise'} from 3 o'clock\n` +
    `${pitchLine}\n` +
    `R = D / 2 = ${plain(diameterNm, u)} / 2 = ${plain(diameterNm / 2, u)} ${u}\n` +
    `Xc, Yc = ${plain(centreXNm, u)}, ${plain(centreYNm, u)} ${u}\n\n` +
    example +
    chordLine +
    `\n${MOVES_NOTE}`;

  const csv: string[][] = [
    ['hole', 'angle_deg', `x_${u}`, `y_${u}`, `dx_${u}`, `dy_${u}`],
    ...rows.map((r) => [String(r.n), r.angle ?? '', r.x, r.y, r.dx, r.dy]),
  ];

  const per = NM_PER[u];
  return {
    units: u,
    rows,
    summary,
    working,
    figure: {
      holes: figureHoles(rows),
      circle: { cx: centreXNm / per, cy: centreYNm / per, r: diameterNm / 2 / per },
      origin: { x: centreXNm / per, y: centreYNm / per },
    },
    csv,
  };
}

function gridDisplay(input: Extract<PatternInput, { kind: 'grid' }>): PatternDisplay {
  const { units } = input;
  const u = units;
  const spacingXNm = toNm(input.spacingX, u);
  const spacingYNm = toNm(input.spacingY, u);
  const firstXNm = toNm(input.firstX, u);
  const firstYNm = toNm(input.firstY, u);
  const holes = holeGrid({
    columns: input.columns,
    rows: input.rows,
    spacingXNm,
    spacingYNm,
    turnDeg: input.turnDeg,
    firstXNm,
    firstYNm,
  });
  const rows = tableRows(holes, u);

  const summary = [
    { label: 'Holes', value: `${input.columns} × ${input.rows} = ${holes.length}` },
    { label: 'Turned', value: plainAngle(((input.turnDeg % 360) + 360) % 360) },
  ];

  const shownRow = rows[Math.min(1, rows.length - 1)];
  let example = '';
  if (shownRow !== undefined && shownRow.column !== null && shownRow.row !== null) {
    const i = shownRow.column - 1;
    const j = shownRow.row - 1;
    const phi = plainAngle(input.turnDeg);
    example =
      `Hole ${shownRow.n} (column ${shownRow.column}, row ${shownRow.row}):   i = ${i}, j = ${j}\n` +
      `X = ${plain(firstXNm, u)} + ${i} × ${plain(spacingXNm, u)} × cos ${phi} − ${j} × ${plain(spacingYNm, u)} × sin ${phi} = ${shownRow.x} ${u}\n` +
      `Y = ${plain(firstYNm, u)} + ${i} × ${plain(spacingXNm, u)} × sin ${phi} + ${j} × ${plain(spacingYNm, u)} × cos ${phi} = ${shownRow.y} ${u}\n`;
  }

  const working =
    `X = X1 + i × sx × cos φ − j × sy × sin φ\n` +
    `Y = Y1 + i × sx × sin φ + j × sy × cos φ\n` +
    `i = column − 1, j = row − 1, numbered row by row\n` +
    `sx = ${plain(spacingXNm, u)} ${u}, sy = ${plain(spacingYNm, u)} ${u}, φ = ${plainAngle(input.turnDeg)}\n` +
    `X1, Y1 = ${plain(firstXNm, u)}, ${plain(firstYNm, u)} ${u}\n\n` +
    example +
    `\n${MOVES_NOTE}`;

  const csv: string[][] = [
    ['hole', 'column', 'row', `x_${u}`, `y_${u}`, `dx_${u}`, `dy_${u}`],
    ...rows.map((r) => [
      String(r.n),
      String(r.column ?? ''),
      String(r.row ?? ''),
      r.x,
      r.y,
      r.dx,
      r.dy,
    ]),
  ];

  const per = NM_PER[u];
  return {
    units: u,
    rows,
    summary,
    working,
    figure: {
      holes: figureHoles(rows),
      circle: null,
      origin: { x: firstXNm / per, y: firstYNm / per },
    },
    csv,
  };
}
