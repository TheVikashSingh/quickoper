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
 * ─── Units: integer nanometres (CLAUDE.md rule 2, applied to length) ────────
 *
 * Rule 2 requires money to be an integer count of minor units because floats
 * lose currency. Length has the identical problem and the identical fix: every
 * dimension here is an INTEGER count of MICROMETRES (nm). A drill is 3300 nm,
 * never 3.3 mm.
 *
 * This matters most for the drill series. Snapping a target to "the nearest
 * real drill" is an equality-and-ordering problem over a fixed catalogue, and
 * `3.3 === 3.3` is not reliable in IEEE-754 once a value has been converted
 * from inches and back. In integer nm it is exact, always.
 *
 * One inch is EXACTLY 25 400 nm — a definition, not a measurement (international
 * yard and pound agreement, 1959). Inch drills therefore land on exact integers
 * too, and a mm → in → mm round trip is lossless.
 *
 * ─── Rounding policy (CLAUDE.md rule 3) ──────────────────────────────────────
 *
 * WHERE:      Never inside the arithmetic. `drillDiameterFor` returns an
 *             unrounded nm value as a float on purpose, because its only
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

declare const NANOMETRE_BRAND: unique symbol;

/**
 * A length in whole nanometres.
 *
 * Nanometres, not micrometres, and the reason is inch geometry — see the note
 * further down before changing it.
 *
 * BRANDED ON PURPOSE. A plain `number` cannot be passed where this is expected,
 * so `engagementPercent(4, 0.7, 3.3)` — millimetres, the single most likely
 * mistake anyone will make against this API — is a compile error rather than a
 * result that is wrong by a factor of a thousand.
 *
 * Construct one with `nm()`, `mmToNm()` or `inchToNm()`. Arithmetic on two
 * Nanometres yields a plain number, which is correct: a difference of two
 * lengths is a length only by convention, and re-branding it should be a
 * deliberate act.
 */
export type Nanometres = number & { readonly [NANOMETRE_BRAND]: true };

/**
 * Assert that a raw number is a whole, positive count of nanometres.
 *
 * Fractional nm is rejected rather than rounded. A caller holding 3.3 has
 * millimetres and should say so; silently accepting it is how a unit bug
 * survives to production.
 */
export function nm(value: number): Nanometres {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`nanometres must be positive and finite, got ${value}`);
  }
  if (!Number.isInteger(value)) {
    throw new RangeError(
      `nanometres must be a whole number, got ${value} — did you pass millimetres?`,
    );
  }
  return value as Nanometres;
}

/** Exactly 25 400 nm, by definition. Not a measured constant. */
export const NM_PER_INCH = 25_400_000;

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
 * 76.98 they land fractions of a nanometre above midway, the ties vanish, and
 * `snapToSeries` can no longer reproduce M12's published 10.2 mm drill.
 */
export const SHOP_RULE_PERCENT = 100 / ENGAGEMENT_K;

/** Default engagement when the user expresses no preference. */
export const DEFAULT_ENGAGEMENT_PERCENT = 75;

// ─── Unit conversion ────────────────────────────────────────────────────────

export function mmToNm(mm: number): Nanometres {
  return nm(Math.round(mm * 1_000_000));
}

export function nmToMm(value: Nanometres): number {
  return value / 1_000_000;
}

export function inchToNm(inch: number): Nanometres {
  return nm(Math.round(inch * NM_PER_INCH));
}

export function nmToInch(value: Nanometres): number {
  return value / NM_PER_INCH;
}

/** Pitch from threads-per-inch, for Unified series. P = 1/n. */
export function tpiToPitchNm(tpi: number): Nanometres {
  if (tpi <= 0) throw new RangeError(`tpi must be positive, got ${tpi}`);
  return nm(Math.round(NM_PER_INCH / tpi));
}

/*
 * ─── Why nanometres and not micrometres ─────────────────────────────────────
 *
 * This module counted in whole MICROMETRES until D72, and inch threads did not
 * fit. 0.164 in is 4165.6 µm; 1/32 in is 793.75 µm; 1/64 in is 396.875 µm.
 * Rounding each to a whole micrometre before the division moved the published
 * SECOND decimal:
 *
 *     #8-32 on a #29 drill     true 68.97 %    via whole µm 69.03 %
 *     #10-24 on a #25 drill    true 74.82 %    via whole µm 74.87 %
 *
 * Physically nothing — and a digit this project publishes, on the series used
 * across four of the five target markets.
 *
 * At nanometre scale it comes out exact. NM_PER_INCH is 25 400 000 = 2^8 × 5^5
 * × 127, so any inch figure quoted to five decimals or fewer is a whole number
 * of nanometres, and 64 divides it: 1/64 in is exactly 396 875 nm, remainder
 * zero. The fractional drill catalogue is therefore its exact nominal size
 * rather than a near-miss of it. This is the representation the Kotlin core in
 * `machinist-calc-app` already uses, which also makes the two cores comparable
 * for the Gate 7 cross-check.
 *
 * WHAT STILL ROUNDS, stated honestly: `tpiToPitchNm` divides 25 400 000 by the
 * thread count, and only some counts divide it exactly. 32 tpi gives 793 750 on
 * the nose; 24 tpi gives 1 058 333.33 and is rounded. The residue is under half
 * a nanometre on a million — 5 parts in 10 000 000, four orders of magnitude
 * below the micrometre error it replaces, and far below the second decimal the
 * golden fixture asserts. The golden inch rows are checked through THIS path,
 * not through a private exact one, so that claim is tested rather than asserted.
 */

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
  majorNm: Nanometres,
  pitchNm: Nanometres,
  drillNm: Nanometres,
): number {
  return engagementPercentExact(majorNm, pitchNm, drillNm);
}

/**
 * Engagement for a drill diameter that is not a whole nanometre.
 *
 * The branded `engagementPercent` above is what callers should reach for: it
 * refuses anything but a real, whole-nm drill. This variant exists because
 * `drillDiameterFor` returns a fractional TARGET — a diameter no drill in any
 * rack actually has — and proving the two functions are exact inverses requires
 * feeding that target back in.
 *
 * Units are the caller's responsibility here. That is the price of the escape
 * hatch, and it is why the safe version is the one named without a suffix.
 */
export function engagementPercentExact(
  majorNm: number,
  pitchNm: number,
  drillNm: number,
): number {
  assertPositive('majorNm', majorNm);
  assertPositive('pitchNm', pitchNm);
  assertPositive('drillNm', drillNm);
  return (100 * (majorNm - drillNm)) / (ENGAGEMENT_K * pitchNm);
}

/**
 * Millimetres from a fractional nm value.
 *
 * `nmToMm` takes a branded whole-nm length. This takes a computed target,
 * which by construction is not one.
 */
export function nmExactToMm(value: number): number {
  return value / 1_000_000;
}

/**
 * Drill diameter that would produce a target engagement.
 *
 * Deliberately returns a fractional nm value. See the rounding policy above:
 * this is the true target, and `snapToSeries` needs it unrounded to choose the
 * correct neighbour. Do not round it before passing it on.
 */
export function drillDiameterFor(
  majorNm: Nanometres,
  pitchNm: Nanometres,
  engagement: number,
): number {
  assertPositive('majorNm', majorNm);
  assertPositive('pitchNm', pitchNm);
  if (!Number.isFinite(engagement) || engagement <= 0 || engagement > 100) {
    throw new RangeError(`engagement must be in (0, 100], got ${engagement}`);
  }
  return majorNm - (ENGAGEMENT_K * pitchNm * engagement) / 100;
}

/** Basic minor diameter D₁ = D − 1.25 H = (5/8)√3 P. Not the tap drill. */
export function basicMinorDiameterNm(majorNm: Nanometres, pitchNm: Nanometres): number {
  assertPositive('majorNm', majorNm);
  assertPositive('pitchNm', pitchNm);
  return majorNm - MINOR_DIA_K * pitchNm;
}

// ─── The drill series ───────────────────────────────────────────────────────

export interface Drill {
  /** Exact diameter in nm. */
  readonly nm: Nanometres;
  /** How a machinist names it: "3.3 mm", "#7", "27/64". */
  readonly label: string;
  /** Which catalogue it belongs to. */
  readonly series: 'metric' | 'fractional' | 'number' | 'letter';
}

export interface DrillChoice {
  readonly drill: Drill;
  /** Engagement this drill actually produces, unrounded. */
  readonly engagementPercent: number;
  /** Signed nm difference from the requested target. */
  readonly deltaNm: number;
}

/**
 * Every real drill in `series`, ranked by closeness to `targetNm`.
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
  majorNm: Nanometres,
  pitchNm: Nanometres,
  targetNm: number,
  series: readonly Drill[],
): DrillChoice[] {
  return series
    .map((drill) => ({
      drill,
      engagementPercent: engagementPercent(majorNm, pitchNm, drill.nm),
      deltaNm: drill.nm - targetNm,
    }))
    .sort((a, b) => Math.abs(a.deltaNm) - Math.abs(b.deltaNm));
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
 * M12 ties between 10.2 and 10.3 mm: the step is 100 nm, 10200/100 = 102 is
 * even, so 10.2 mm wins — the drill every chart names. M8 ties between 6.7 and
 * 6.8: 6700/100 = 67 is odd, so 6.8 mm wins, which is also what every chart
 * names. One rule, both directions.
 *
 * At micrometre scale this had a hole. 1/64 in was 396.875 µm, stored rounded,
 * so the fractional index had no exact step and "even multiple" was undefined
 * across it. In nanometres 1/64 in is exactly 396 875 and every fractional
 * drill is a whole multiple of it, so half-even now applies to that catalogue
 * as well — see D72.
 *
 * The guard stays regardless: a series with an irregular local step, such as
 * the two catalogues interleaved across their boundary, has no even multiple to
 * speak of. There the fallback is the larger drill, which errs toward the
 * easier tap.
 */
function evenOfPair(a: number, b: number): number {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const step = hi - lo;
  const q = lo / step;
  return Number.isInteger(q) && q % 2 === 0 ? lo : hi;
}

export function snapToSeries(
  majorNm: Nanometres,
  pitchNm: Nanometres,
  targetNm: number,
  series: readonly Drill[],
): DrillChoice | undefined {
  if (series.length === 0) return undefined;
  const chosen = series.reduce((best, d) => {
    const dDist = Math.abs(d.nm - targetNm);
    const bestDist = Math.abs(best.nm - targetNm);
    if (dDist < bestDist) return d;
    if (dDist === bestDist) return d.nm === evenOfPair(best.nm, d.nm) ? d : best;
    return best;
  });
  return {
    drill: chosen,
    engagementPercent: engagementPercent(majorNm, pitchNm, chosen.nm),
    deltaNm: chosen.nm - targetNm,
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
