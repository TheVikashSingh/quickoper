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
 *     H = (√3 / 2) × P; the flank engaged by a nut is 5H/8 per side.
 *   - ISO 261 / ISO 262: metric coarse pitch series.
 *   - ASME B1.1: Unified inch screw threads; same geometry, P = 1/n.
 *   - ISO 235 / DIN 338: twist drill diameter series.
 *
 * The engagement constant is 1.5H per unit pitch — 3√3/4 = 1.2990381… — and
 * 100 / K = 76.9800 %, which is why the shop rule "drill = major − pitch" lands
 * just under 77 %. It is DERIVED from √3 here rather than typed as the trade's
 * 1.299: that four-figure rounding moves the second decimal of the engagement
 * this module publishes on #8-32, #10-24 and 5/16-18, and it destroys the exact
 * ties that let `snapToSeries` reproduce the published chart. See
 * `machinist-calc-research` 03-spec/calculations.md §2.
 */

declare const MICROMETRE_BRAND: unique symbol;

/**
 * A length in whole micrometres.
 *
 * BRANDED ON PURPOSE. A plain `number` cannot be passed where this is expected,
 * so `engagementPercent(4, 0.7, 3.3)` — millimetres, the single most likely
 * mistake anyone will make against this API — is a compile error rather than a
 * result that is wrong by a factor of a thousand.
 *
 * Construct one with `um()`, `mmToUm()` or `inchToUm()`. Arithmetic on two
 * Micrometres yields a plain number, which is correct: a difference of two
 * lengths is a length only by convention, and re-branding it should be a
 * deliberate act.
 */
export type Micrometres = number & { readonly [MICROMETRE_BRAND]: true };

/**
 * Assert that a raw number is a whole, positive count of micrometres.
 *
 * Fractional µm is rejected rather than rounded. A caller holding 3.3 has
 * millimetres and should say so; silently accepting it is how a unit bug
 * survives to production.
 */
export function um(value: number): Micrometres {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`micrometres must be positive and finite, got ${value}`);
  }
  if (!Number.isInteger(value)) {
    throw new RangeError(
      `micrometres must be a whole number, got ${value} — did you pass millimetres?`,
    );
  }
  return value as Micrometres;
}

/** Exactly 25 400 µm, by definition. Not a measured constant. */
export const UM_PER_INCH = 25_400;

/**
 * ISO 68-1 basic profile height per unit pitch: H / P = √3 / 2.
 *
 * A geometric identity — the height of an equilateral triangle of side P — not
 * a measured or published quantity, so there is nothing to cite and nothing to
 * transcribe. BOTH constants below multiply this one value, and that they share
 * a single H is what keeps `SHOP_RULE_PERCENT` and the 83⅓ % basic-minor
 * relationship exact. Deriving them from different roundings of H is precisely
 * what breaks that.
 */
export const H_PER_PITCH = Math.sqrt(3) / 2;

/**
 * Thread-engagement constant for 60° threads (ISO metric and Unified inch):
 * 1.5H per unit pitch = 3√3/4 = 1.2990381…
 *
 * %engagement = 100 × (major − drill) / (K × pitch)
 */
export const ENGAGEMENT_K = 1.5 * H_PER_PITCH;

/**
 * Basic minor diameter coefficient: D₁ = D − 1.25 × H = (5/8)√3 × P.
 *
 * Derivation: 2 × (5/8) × H. This is NOT the tap drill and users conflate the
 * two constantly, which is why the tool reports both.
 */
export const MINOR_DIA_K = 1.25 * H_PER_PITCH;

/**
 * The engagement the shop rule "drill = major − pitch" actually gives:
 * 100 / K = 76.9800 %.
 *
 * Written as the division, never as the literal 76.98. At the full-precision
 * value the target is exactly `major − pitch`, so M8 lands on 6.750 mm and M12
 * on 10.250 mm — each exactly midway between two catalogue drills. Typed as
 * 76.98 they land fractions of a micrometre above midway, the ties vanish, and
 * `snapToSeries` can no longer reproduce M12's published 10.2 mm drill.
 */
export const SHOP_RULE_PERCENT = 100 / ENGAGEMENT_K;

/** Default engagement when the user expresses no preference. */
export const DEFAULT_ENGAGEMENT_PERCENT = 75;

// ─── Unit conversion ────────────────────────────────────────────────────────

export function mmToUm(mm: number): Micrometres {
  return um(Math.round(mm * 1000));
}

export function umToMm(value: Micrometres): number {
  return value / 1000;
}

export function inchToUm(inch: number): Micrometres {
  return um(Math.round(inch * UM_PER_INCH));
}

export function umToInch(value: Micrometres): number {
  return value / UM_PER_INCH;
}

/** Pitch from threads-per-inch, for Unified series. P = 1/n. */
export function tpiToPitchUm(tpi: number): Micrometres {
  if (tpi <= 0) throw new RangeError(`tpi must be positive, got ${tpi}`);
  return um(Math.round(UM_PER_INCH / tpi));
}

/*
 * ─── Inch quantities do not fit in whole micrometres ────────────────────────
 *
 * `Micrometres` is deliberately integral — it is the guard that catches a
 * millimetre passed where a micrometre was wanted. Metric threads survive that
 * exactly: 0.1 mm is 100 µm on the nose. Unified inch ones do not. 0.164 in is
 * 4165.6 µm and 1/32 in is 793.75 µm, and rounding each to whole micrometres
 * BEFORE the division moves the answer more than the fourth decimal this
 * project promises:
 *
 *     #8-32 on a #29 drill    exact 68.9741 %   via whole µm 69.03 %
 *     #10-24 on a #25 drill   exact 74.8246 %   via whole µm 74.87 %
 *
 * That is a published second decimal, on the series used across four of the
 * five target markets. The pair below returns raw, unrounded micrometres for
 * the geometry so the formula can be fed exact values; `engagementPercentExact`
 * is the matching escape hatch that accepts them.
 *
 * This does NOT yet fix the page, which still converts user inch input through
 * the rounding pair above. Doing that properly means representing lengths in
 * nanometres — 1/64 in is exactly 396 875 nm — which is what the Kotlin core
 * does and what this module should follow. Recorded as D72.
 */

/** Micrometres from inches, unrounded. See the note above. */
export function inchToUmExact(inch: number): number {
  if (!Number.isFinite(inch) || inch <= 0) {
    throw new RangeError(`inch must be positive and finite, got ${inch}`);
  }
  return inch * UM_PER_INCH;
}

/** Pitch in unrounded micrometres from threads-per-inch. See the note above. */
export function tpiToPitchUmExact(tpi: number): number {
  if (!Number.isFinite(tpi) || tpi <= 0) {
    throw new RangeError(`tpi must be positive and finite, got ${tpi}`);
  }
  return UM_PER_INCH / tpi;
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
  return engagementPercentExact(majorUm, pitchUm, drillUm);
}

/**
 * Engagement for a drill diameter that is not a whole micrometre.
 *
 * The branded `engagementPercent` above is what callers should reach for: it
 * refuses anything but a real, whole-µm drill. This variant exists because
 * `drillDiameterFor` returns a fractional TARGET — a diameter no drill in any
 * rack actually has — and proving the two functions are exact inverses requires
 * feeding that target back in.
 *
 * Units are the caller's responsibility here. That is the price of the escape
 * hatch, and it is why the safe version is the one named without a suffix.
 */
export function engagementPercentExact(
  majorUm: number,
  pitchUm: number,
  drillUm: number,
): number {
  assertPositive('majorUm', majorUm);
  assertPositive('pitchUm', pitchUm);
  assertPositive('drillUm', drillUm);
  return (100 * (majorUm - drillUm)) / (ENGAGEMENT_K * pitchUm);
}

/**
 * Millimetres from a fractional µm value.
 *
 * `umToMm` takes a branded whole-µm length. This takes a computed target,
 * which by construction is not one.
 */
export function umExactToMm(value: number): number {
  return value / 1000;
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

/** Basic minor diameter D₁ = D − 1.25 H = (5/8)√3 P. Not the tap drill. */
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
 * The drill a shop would actually reach for: the NEAREST in the series, with a
 * tie going to the larger.
 *
 * ─── This rule was wrong once, and the correction matters ───────────────────
 *
 * The first version chose the largest drill NOT EXCEEDING the target, reasoning
 * that engagement should never come out below what was asked for. That is
 * defensible in isolation and it is wrong in practice, because it makes the
 * tool disagree with every published tap drill chart on common threads.
 *
 * M8 × 1.25 at 75 % wants 6.782 mm. Never-exceed picks 6.7 mm and reports
 * 80.06 %. Every catalogue in the world says 6.8 mm, which gives 73.90 %. A
 * machinist checking a thread they already know would conclude the tool is
 * broken — and they would be right to, because the tool was the outlier.
 *
 * Charts pick the nearest, and break ties upward: a marginally larger hole taps
 * more easily and breaks fewer taps, and the strength given up above ~75 % is
 * small because the failure has already moved into the fastener.
 *
 * WHAT ACTUALLY GUARDS AGAINST THE COMPETITOR DEFECT is not the direction of
 * the rounding. It is (a) snapping to a series of drills that EXIST rather than
 * to an arithmetic 0.5 mm grid, and (b) always reporting the engagement the
 * chosen drill truly produces. Those two together are what stop M4 × 0.7 from
 * silently becoming a 3.5 mm hole at 55 %.
 *
 * ─── The tie is broken half-even, and that reproduces the chart ─────────────
 *
 * An earlier revision broke ties toward the LARGER drill and concluded the
 * published table was underivable: it reproduced M6, M8, M10, M16 and M20 but
 * missed M12, giving 10.3 mm where every chart says 10.2 mm, and "no other rule
 * does better".
 *
 * That was wrong, and the cause was a rounded constant rather than the rule.
 * At full precision the shop-rule target is exactly `major − pitch`, so M8
 * lands on 6.750 mm and M12 on 10.250 mm — both EXACTLY midway between two
 * drills — and the chart resolves those two ties in OPPOSITE directions (M8 up
 * to 6.8, M12 down to 10.2). No monotone rule can satisfy both, which is what
 * the old conclusion correctly observed and then over-generalised.
 *
 * Half-even is not monotone. Breaking an exact tie to the even multiple of the
 * local step reproduces the published chart on every metric row in range, and
 * it is not a rule invented to win M12: half-even is already this module's
 * declared rounding mode for display (`roundHalfEven`), applied here to a grid
 * of real drills instead of to a decimal place.
 *
 * Where the target is not an exact tie — every user-entered percentage that is
 * not the shop rule — this is plain nearest, unchanged.
 *
 * Returns `undefined` only for an empty series, which is a programming error
 * rather than a user one.
 */
/**
 * Of two drills exactly straddling a target, the one on the EVEN multiple of
 * the step between them — half-even, applied to a drill grid.
 *
 * M12 ties between 10.2 and 10.3 mm: the step is 100 µm, 10200/100 = 102 is
 * even, so 10.2 mm wins — the drill every chart names. M8 ties between 6.7 and
 * 6.8: 6700/100 = 67 is odd, so 6.8 mm wins, which is also what every chart
 * names. One rule, both directions.
 *
 * On a series whose local step does not divide the smaller diameter — the
 * fractional-inch index, where 1/64 in is 396.875 µm and cannot be stored
 * exactly in whole micrometres — "even multiple" is undefined. There the
 * fallback is the larger drill, which is the previous behaviour and errs
 * toward the easier tap.
 */
function evenOfPair(a: number, b: number): number {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const step = hi - lo;
  const q = lo / step;
  return Number.isInteger(q) && q % 2 === 0 ? lo : hi;
}

export function snapToSeries(
  majorUm: Micrometres,
  pitchUm: Micrometres,
  targetUm: number,
  series: readonly Drill[],
): DrillChoice | undefined {
  if (series.length === 0) return undefined;
  const chosen = series.reduce((best, d) => {
    const dDist = Math.abs(d.um - targetUm);
    const bestDist = Math.abs(best.um - targetUm);
    if (dDist < bestDist) return d;
    if (dDist === bestDist) return d.um === evenOfPair(best.um, d.um) ? d : best;
    return best;
  });
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
