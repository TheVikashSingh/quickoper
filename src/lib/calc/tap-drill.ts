/**
 * Tap drill sizing and thread engagement.
 *
 * ─── Why this module exists ──────────────────────────────────────────────────
 *
 * A tap drill that is 0.2 mm too large produces a thread that strips under load.
 * The failure is not cosmetic and it is not recoverable: the part is scrapped,
 * or worse, the thread holds during assembly and lets go in service.
 *
 * Every shipping competitor examined during research got this wrong in the same
 * way — they compute a diameter and then round it to a convenient 0.5 mm step.
 * For M4 × 0.7 that turns the correct 3.30 mm into 3.50 mm, which drops thread
 * engagement from 76.98 % to 55.0 %. Two reviewers of two different apps caught
 * it independently. This module exists to not do that.
 *
 * ─── Units: integer micrometres (CLAUDE.md rule 2, applied to length) ────────
 *
 * Rule 2 requires money to be an integer count of minor units because floats
 * lose currency. Length has the identical problem and the identical fix: every
 * dimension here is an INTEGER count of MICROMETRES (µm). A drill is 3300 µm,
 * never 3.3 mm.
 *
 * This matters most for the drill series. Snapping a target to "the nearest
 * real drill" is an equality-and-ordering problem over a fixed catalogue, and
 * `3.3 === 3.3` is not reliable in IEEE-754 once a value has been converted
 * from inches and back. In integer µm it is exact, always.
 *
 * One inch is EXACTLY 25 400 µm — a definition, not a measurement (international
 * yard and pound agreement, 1959). Inch drills therefore land on exact integers
 * too, and a mm → in → mm round trip is lossless.
 *
 * ─── Rounding policy (CLAUDE.md rule 3) ──────────────────────────────────────
 *
 * WHERE:      Never inside the arithmetic. `drillDiameterFor` returns an
 *             unrounded µm value as a float on purpose, because its only
 *             consumers are (a) the display layer and (b) `snapToSeries`, which
 *             needs the true target to pick a neighbour correctly. Rounding it
 *             first would occasionally snap to the wrong drill.
 *
 * DIRECTION:  Display rounding is half-even, matching `money.ts`'s reasoning
 *             about bias across a table of figures. A machinist reads a column
 *             of engagement percentages; a half-up bias would tilt every one of
 *             them the same way.
 *
 * FINAL STEP: There is no accumulating schedule here, so nothing needs to
 *             absorb drift. The analogous obligation is `snapToSeries`, which
 *             must return a drill that EXISTS, and must report the engagement
 *             that drill actually produces rather than the engagement that was
 *             asked for. Those two numbers differ and the difference is the
 *             whole point of the tool.
 *
 * ─── Sources ────────────────────────────────────────────────────────────────
 *
 *   - ISO 68-1: metric screw thread basic profile. Fundamental triangle height
 *     H = 0.866025 × P; the flank engaged by a nut is 5H/8 per side.
 *   - ISO 261 / ISO 262: metric coarse pitch series.
 *   - ASME B1.1: Unified inch screw threads; same geometry, P = 1/n.
 *   - ISO 235 / DIN 338: twist drill diameter series.
 *
 * The engagement constant 1.299 is 2 × (5/8) × 2 × 0.866025 / 1.0825 as it
 * appears throughout machining practice; equivalently 100 / 1.299 = 76.98 %,
 * which is why the shop rule "drill = major − pitch" lands just under 77 %.
 */

/** A length in whole micrometres. Never a fractional millimetre. */
export type Micrometres = number;

/** Exactly 25 400 µm, by definition. Not a measured constant. */
export const UM_PER_INCH = 25_400;

/**
 * Thread-engagement constant for 60° threads (ISO metric and Unified inch).
 *
 * %engagement = 100 × (major − drill) / (K × pitch)
 */
export const ENGAGEMENT_K = 1.299;

/**
 * Basic minor diameter coefficient: D₁ = D − 1.0825 × P.
 *
 * Derivation: 2 × (5/8) × H where H = 0.866025 × P. This is NOT the tap drill
 * and users conflate the two constantly, which is why the tool reports both.
 */
export const MINOR_DIA_K = 1.0825;

/** Default engagement when the user expresses no preference. */
export const DEFAULT_ENGAGEMENT_PERCENT = 75;

// ─── Unit conversion ────────────────────────────────────────────────────────

export function mmToUm(mm: number): Micrometres {
  return Math.round(mm * 1000);
}

export function umToMm(um: Micrometres): number {
  return um / 1000;
}

export function inchToUm(inch: number): Micrometres {
  return Math.round(inch * UM_PER_INCH);
}

export function umToInch(um: Micrometres): number {
  return um / UM_PER_INCH;
}

/** Pitch from threads-per-inch, for Unified series. P = 1/n. */
export function tpiToPitchUm(tpi: number): Micrometres {
  if (tpi <= 0) throw new RangeError(`tpi must be positive, got ${tpi}`);
  return Math.round(UM_PER_INCH / tpi);
}

// ─── Core arithmetic ────────────────────────────────────────────────────────

function assertPositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number, got ${value}`);
  }
}

/**
 * Thread engagement produced by a given drill, as a percentage.
 *
 * Returned unrounded. A drill LARGER than the major diameter yields a negative
 * result rather than a clamped zero — that is a real input error and the caller
 * must be able to see it, not have it quietly hidden.
 */
export function engagementPercent(
  majorUm: Micrometres,
  pitchUm: Micrometres,
  drillUm: Micrometres,
): number {
  assertPositive('majorUm', majorUm);
  assertPositive('pitchUm', pitchUm);
  assertPositive('drillUm', drillUm);
  return (100 * (majorUm - drillUm)) / (ENGAGEMENT_K * pitchUm);
}

/**
 * Drill diameter that would produce a target engagement.
 *
 * Deliberately returns a fractional µm value. See the rounding policy above:
 * this is the true target, and `snapToSeries` needs it unrounded to choose the
 * correct neighbour. Do not round it before passing it on.
 */
export function drillDiameterFor(
  majorUm: Micrometres,
  pitchUm: Micrometres,
  engagement: number,
): number {
  assertPositive('majorUm', majorUm);
  assertPositive('pitchUm', pitchUm);
  if (!Number.isFinite(engagement) || engagement <= 0 || engagement > 100) {
    throw new RangeError(`engagement must be in (0, 100], got ${engagement}`);
  }
  return majorUm - (ENGAGEMENT_K * pitchUm * engagement) / 100;
}

/** Basic minor diameter D₁ = D − 1.0825 P. Not the tap drill. */
export function basicMinorDiameterUm(majorUm: Micrometres, pitchUm: Micrometres): number {
  assertPositive('majorUm', majorUm);
  assertPositive('pitchUm', pitchUm);
  return majorUm - MINOR_DIA_K * pitchUm;
}

// ─── The drill series ───────────────────────────────────────────────────────

export interface Drill {
  /** Exact diameter in µm. */
  readonly um: Micrometres;
  /** How a machinist names it: "3.3 mm", "#7", "27/64". */
  readonly label: string;
  /** Which catalogue it belongs to. */
  readonly series: 'metric' | 'fractional' | 'number' | 'letter';
}

export interface DrillChoice {
  readonly drill: Drill;
  /** Engagement this drill actually produces, unrounded. */
  readonly engagementPercent: number;
  /** Signed µm difference from the requested target. */
  readonly deltaUm: number;
}

/**
 * Every real drill in `series`, ranked by closeness to `targetUm`.
 *
 * This is the "schedule" that CLAUDE.md rule 10 requires: not one number, but
 * the neighbourhood, so a machinist can see what the drill in the next slot of
 * the rack would give them. It is also the honest answer — the computed target
 * usually is not a drill that exists.
 *
 * Callers get the full ranked list and decide how many rows to show. The tool
 * shows the nearest few either side.
 */
export function rankBySuitability(
  majorUm: Micrometres,
  pitchUm: Micrometres,
  targetUm: number,
  series: readonly Drill[],
): DrillChoice[] {
  return series
    .map((drill) => ({
      drill,
      engagementPercent: engagementPercent(majorUm, pitchUm, drill.um),
      deltaUm: drill.um - targetUm,
    }))
    .sort((a, b) => Math.abs(a.deltaUm) - Math.abs(b.deltaUm));
}

/**
 * The drill a shop would actually reach for.
 *
 * Chooses the closest drill that does NOT exceed the target, so engagement is
 * never accidentally reduced below what was asked for. Where no such drill
 * exists (target below the smallest in the series) it returns the smallest and
 * the caller can see from `deltaUm` that the request was out of range.
 *
 * Returns `undefined` only for an empty series, which is a programming error
 * rather than a user one.
 */
export function snapToSeries(
  majorUm: Micrometres,
  pitchUm: Micrometres,
  targetUm: number,
  series: readonly Drill[],
): DrillChoice | undefined {
  if (series.length === 0) return undefined;
  const atOrBelow = series.filter((d) => d.um <= targetUm);
  const chosen =
    atOrBelow.length > 0
      ? atOrBelow.reduce((best, d) => (d.um > best.um ? d : best))
      : series.reduce((best, d) => (d.um < best.um ? d : best));
  return {
    drill: chosen,
    engagementPercent: engagementPercent(majorUm, pitchUm, chosen.um),
    deltaUm: chosen.um - targetUm,
  };
}

// ─── Display ────────────────────────────────────────────────────────────────

/**
 * Half-even rounding to a fixed number of decimals, for display only.
 *
 * Four decimals is the floor for any dimensional figure. A reviewer of a $17.99
 * competitor put it exactly: "This calculator is worthless without at least 4
 * places behind the zero."
 */
export function roundHalfEven(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const scaled = value * factor;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  const EPS = 1e-9;
  let rounded: number;
  if (Math.abs(diff - 0.5) < EPS) {
    rounded = floor % 2 === 0 ? floor : floor + 1;
  } else {
    rounded = Math.round(scaled);
  }
  return rounded / factor;
}
