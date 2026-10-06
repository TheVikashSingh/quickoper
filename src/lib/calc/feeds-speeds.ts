/**
 * Feeds and speeds.
 *
 * ─── The decision that shapes this module ───────────────────────────────────
 *
 * THERE IS NO MATERIAL DATABASE, and there will not be one until somebody has
 * verified it against a manufacturer's published data.
 *
 * Cutting speed and feed per tooth are not properties of a material. They are
 * properties of a material, a tool substrate, a coating, a geometry, a coolant
 * strategy and a machine's rigidity — which is why Sandvik, Kennametal and Seco
 * publish different numbers for what a shop calls "304 stainless", and why all
 * three publish them per insert grade rather than per metal.
 *
 * A calculator that answers "what Vc for steel?" from a table it invented is
 * doing the single most dangerous thing this tool could do: it looks
 * authoritative, it is specific, and it breaks tools. So Vc and fz are INPUTS
 * here, taken from the data sheet that came with the insert.
 *
 * That is also what a machinist should be doing anyway. The arithmetic is the
 * part that is tedious and error-prone; the recommendation is the part their
 * tooling supplier is paid to get right.
 *
 * ─── Units ──────────────────────────────────────────────────────────────────
 *
 * Lengths are `Nanometres`, matching tap-drill.ts, so diameters and feeds per
 * tooth cannot be confused with millimetres at a call site. Rates come out in
 * the units a machinist reads: rpm, mm/min, mm/rev, cm³/min, kW.
 *
 * Cutting speed is m/min (metric) or surface feet per minute (inch), which are
 * the conventions on every data sheet, so they stay plain numbers with the
 * convention named in the function.
 *
 * ─── Rounding policy (CLAUDE.md rule 3) ─────────────────────────────────────
 *
 * WHERE:     Never inside the arithmetic. Every function returns full
 *            precision. The one that matters: an app that rounds rpm to a whole
 *            number and then derives feed from it produces a feed wrong by the
 *            rounding error times the tooth count — which for a 6-flute cutter
 *            at 0.1 mm/tooth is a visible error in mm/min.
 *
 * DIRECTION: Display rounding is half-even, in the page, once.
 *
 * ─── Sources ────────────────────────────────────────────────────────────────
 *
 *   - ISO 3002-1: basic quantities in cutting and grinding — the definitions of
 *     Vc, fz, fn, vf and ae/ap used here.
 *   - Kienzle's specific-cutting-force model for Pc, as reproduced in every
 *     major tooling manufacturer's technical guide.
 */

import { nm, NM_PER_INCH, type Nanometres } from './tap-drill';

/** Spindle efficiency is never 1. 0.75–0.9 is the usual band for a mill. */
export const DEFAULT_EFFICIENCY = 0.8;

export type UnitSystem = 'metric' | 'inch';

/**
 * 1 in = 25.4 mm exactly (international yard and pound agreement, 1959), so
 * 1 in³ = 25.4³ mm³ = 16.387064 cm³. Exact, not measured.
 */
export const CM3_PER_IN3 = 16.387064;

/**
 * Surface feet per minute to metres per minute: 1 ft = 0.3048 m exactly, from
 * the same 1959 agreement.
 */
export const M_PER_MIN_PER_SFM = 0.3048;

/**
 * Cutting speed as the arithmetic below requires it, from whichever convention
 * the user's data sheet is written in.
 *
 * Every removal-rate function here works in m/min because that is what the
 * formulas in `calculations.md` §3 are written in. A caller that hands a
 * surface-feet-per-minute figure straight to one of them gets an answer wrong
 * by 25.4²/12 = 53.7633, which is exactly what the feeds page did in inch mode
 * until this function existed.
 */
export function cuttingSpeedToMetric(cuttingSpeed: number, units: UnitSystem): number {
  assertPositive('cuttingSpeed', cuttingSpeed);
  return units === 'metric' ? cuttingSpeed : cuttingSpeed * M_PER_MIN_PER_SFM;
}

/**
 * A removal rate and the unit it is actually in, together.
 *
 * The value and its label are returned as one object on purpose. Every removal
 * rate computed in this module is cm³/min, and the failure this closes is the
 * page selecting an `in³/min` string beside an unconverted cm³/min number —
 * wrong by 16.387064 with nothing on screen to suggest it. Handing back a
 * number and letting the caller pick a label is what allowed that, so the two
 * now travel together and cannot disagree.
 *
 * The Kotlin implementation made the identical mistake independently, which is
 * some evidence this is the natural one to make rather than a lapse.
 */
export function removalRateFor(
  cm3PerMin: number,
  units: UnitSystem,
): { readonly value: number; readonly unit: 'cm³/min' | 'in³/min' } {
  return units === 'metric'
    ? { value: cm3PerMin, unit: 'cm³/min' }
    : { value: cm3PerMin / CM3_PER_IN3, unit: 'in³/min' };
}

function assertPositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number, got ${value}`);
  }
}

/**
 * Spindle speed in rev/min.
 *
 * metric: n = (Vc × 1000) / (π × Dc)   — Vc in m/min, Dc in mm
 * inch:   n = (Vc × 12)   / (π × Dc)   — Vc in sfm,   Dc in inch
 *
 * Dc is the CUTTING diameter, which for a milling cutter is the tool diameter
 * and for turning is the workpiece diameter at the cut. Getting that wrong is
 * the most common input error in this calculation and no formula can catch it.
 */
export function spindleSpeed(
  cuttingSpeed: number,
  dcNm: Nanometres,
  units: UnitSystem,
): number {
  assertPositive('cuttingSpeed', cuttingSpeed);
  assertPositive('dcNm', dcNm);
  // Both conventions reduce to the same thing once the diameter is in nm:
  // metric Vc m/min → nm/min is ×1e9; inch Vc ft/min → nm/min is ×12×25 400 000.
  const speedNmPerMin =
    units === 'metric' ? cuttingSpeed * 1e9 : cuttingSpeed * 12 * NM_PER_INCH;
  return speedNmPerMin / (Math.PI * dcNm);
}

/**
 * Feed per revolution, in nm/rev.
 *
 * fn = fz × z
 *
 * Reported alongside table feed always, never instead of it. A reviewer of a
 * competing app called its absence "the fundamental failure of the developer",
 * and he was right: a lathe operator works in mm/rev and a mill operator in
 * mm/min, and an app that offers only one has chosen a side.
 */
export function feedPerRev(fzNm: Nanometres, teeth: number): number {
  assertPositive('fzNm', fzNm);
  if (!Number.isInteger(teeth) || teeth < 1) {
    throw new RangeError(`teeth must be a positive whole number, got ${teeth}`);
  }
  return fzNm * teeth;
}

/** Table feed in nm/min. vf = fn × n */
export function tableFeed(fnNmPerRev: number, rpm: number): number {
  assertPositive('fnNmPerRev', fnNmPerRev);
  assertPositive('rpm', rpm);
  return fnNmPerRev * rpm;
}

/**
 * Material removal rate for milling, in cm³/min.
 *
 * Q = ae × ap × vf / 1000, with ae and ap in mm and vf in mm/min.
 */
export function millingMrr(
  aeNm: Nanometres,
  apNm: Nanometres,
  vfNmPerMin: number,
): number {
  assertPositive('aeNm', aeNm);
  assertPositive('apNm', apNm);
  assertPositive('vfNmPerMin', vfNmPerMin);
  const aeMm = aeNm / 1_000_000;
  const apMm = apNm / 1_000_000;
  const vfMmPerMin = vfNmPerMin / 1_000_000;
  return (aeMm * apMm * vfMmPerMin) / 1000;
}

/**
 * Material removal rate for turning, in cm³/min — ALWAYS cm³/min, whichever
 * unit system is passed.
 *
 * Q = Vc × ap × fn, with Vc in m/min, ap in mm and fn in mm/rev.
 *
 * `units` says which convention the CUTTING SPEED is written in, because the
 * lengths arrive as `Nanometres` and carry none of their own. The return is
 * metric either way; `removalRateFor` renders it in the user's volume unit.
 *
 * A DIFFERENT FORMULA, not the milling one relabelled. Turning removes a ring
 * of material per revolution rather than a swept slot, and apps that reuse the
 * milling expression here are one of the recurring complaints in the reviews.
 */
export function turningMrr(
  cuttingSpeed: number,
  apNm: Nanometres,
  fnNmPerRev: number,
  units: UnitSystem,
): number {
  assertPositive('apNm', apNm);
  assertPositive('fnNmPerRev', fnNmPerRev);
  // `units` is required rather than defaulted. The lengths arrive as
  // Nanometres, which carry no unit system, so nothing else in this signature
  // reveals which convention the cutting speed is written in — and a default
  // would silently pick one.
  const vc = cuttingSpeedToMetric(cuttingSpeed, units);
  return vc * (apNm / 1_000_000) * (fnNmPerRev / 1_000_000);
}

/**
 * Drilling material removal rate, in cm³/min — ALWAYS cm³/min, whichever unit
 * system is passed. See `turningMrr` on `units`, and `removalRateFor` for
 * rendering it.
 *
 * `Q = (Dc × fn × Vc) / 4`, with Dc and fn in mm and Vc in m/min.
 *
 * ─── Derived here, because §3 does not give it ──────────────────────────────
 *
 * `calculations.md` §3 publishes removal rates for milling and turning only,
 * and requires all four operations. A drill removes the whole cylinder it
 * advances into rather than a swept slot, so the cut section is the full hole
 * area `π Dc² / 4` mm² advancing at vf mm/min:
 *
 *     Q = (π Dc² / 4) × vf                        mm³/min
 *
 * Substituting `vf = fn × n` and `n = Vc × 1000 / (π Dc)` cancels π and one
 * power of Dc:
 *
 *     Q = (π Dc²/4) × fn × Vc × 1000 / (π Dc)     mm³/min
 *       = Dc × fn × Vc × 1000 / 4                 mm³/min
 *       = Dc × fn × Vc / 4                        cm³/min
 *
 * The closed form is exact, not an approximation of the cylinder, and
 * `feeds-speeds.test.ts` asserts the two against each other so it cannot drift
 * from the geometry it came from.
 *
 * ─── Why this is not "just turning", which the page used to claim ───────────
 *
 * The shape says drilling is turning at an effective depth of `Dc / 4`, and
 * that is the whole problem with the advice this page gave before D74. Turning
 * mode makes ap an input, and only `Dc / 4` makes it equivalent. Nothing told
 * the user that. A 10 mm drill at fn 0.2, Vc 80 is 40 cm³/min; entering
 * `ap = Dc/2` gives 80, and `ap = Dc` gives 160 — two and four times, and power
 * scales with it.
 */
export function drillingMrr(
  cuttingSpeed: number,
  dcNm: Nanometres,
  fnNmPerRev: number,
  units: UnitSystem,
): number {
  assertPositive('dcNm', dcNm);
  assertPositive('fnNmPerRev', fnNmPerRev);
  const vc = cuttingSpeedToMetric(cuttingSpeed, units);
  return (vc * (dcNm / 1_000_000) * (fnNmPerRev / 1_000_000)) / 4;
}

/**
 * The radial depth of cut a boring pass takes: `ap = (d1 − d0) / 2`.
 *
 * Boring is internal turning, so its removal rate is `turningMrr` — but ap is
 * derived from the two diameters rather than entered, and that is deliberate.
 * The diameter grows by TWICE whatever the tool takes off the radius, so a user
 * asked for "depth of cut" who types the diameter change doubles the removal
 * rate and the power demand. Taking both diameters makes that unrepresentable.
 */
export function boringDepthOfCut(startNm: Nanometres, finalNm: Nanometres): Nanometres {
  assertPositive('startNm', startNm);
  assertPositive('finalNm', finalNm);
  if (finalNm <= startNm) {
    throw new RangeError(
      `A boring pass must enlarge the hole: final ${finalNm / 1_000_000} mm is not ` +
        `greater than start ${startNm / 1_000_000} mm`,
    );
  }
  // Halving an odd nanometre count leaves a half, so this quantises — the
  // same type-boundary rounding `mmToNm` already performs, not a precision
  // decision. Half a nanometre is twelve orders of magnitude below the figure
  // it feeds.
  return nm(Math.round((finalNm - startNm) / 2));
}

/**
 * Specific cutting force via Kienzle, in N/mm².
 *
 * kc = kc1.1 × h^(−mc)
 *
 * kc1.1 and mc come from the tooling manufacturer's data for the material and
 * grade. There is no default: a wrong kc1.1 produces a power figure that is
 * confidently incorrect, and a machinist sizing a cut on it can stall a spindle
 * or snap a cutter.
 */
export function specificCuttingForce(
  kc11: number,
  mc: number,
  chipThicknessNm: number,
): number {
  assertPositive('kc11', kc11);
  assertPositive('chipThicknessNm', chipThicknessNm);
  if (!Number.isFinite(mc) || mc < 0 || mc >= 1) {
    throw new RangeError(`mc must be in [0, 1), got ${mc}`);
  }
  const hMm = chipThicknessNm / 1_000_000;
  return kc11 * hMm ** -mc;
}

/**
 * Net cutting power, in kW — the power consumed AT THE CUTTING EDGE.
 *
 * `Pc = (ae × ap × vf × kc) / (60 × 10⁶)`, and there is no η in it.
 *
 * Not milling-specific despite §3 writing the milling form: it takes a removal
 * rate, so turning, drilling and boring reach it by the same path rather than
 * through a transcribed second formula. That reuse is the D75 fix.
 *
 * To compare against a machine's rating, use [machinePower] — Pc is what the
 * cut costs, not what the machine must deliver. Warn on exceeding a rating,
 * never block: machinists exceed a rating deliberately for a short cut and
 * resent being stopped.
 */
export function netCuttingPower(mrrCm3PerMin: number, kc: number): number {
  assertPositive('mrrCm3PerMin', mrrCm3PerMin);
  assertPositive('kc', kc);
  // §3: Pc = (ae × ap × vf × kc) / (60 × 10⁶). The first three terms are the
  // removal rate in mm³/min, so with Q in cm³/min the same expression is
  // Q × 1000 × kc / (60 × 10⁶) = Q × kc / 60000. Written this way, every
  // operation uses one power path instead of one operation's formula being
  // reused for another's numbers — which is what D75 was.
  //
  // η is deliberately absent. See `machinePower`.
  return (mrrCm3PerMin * kc) / 60_000;
}

/**
 * The power the MACHINE must deliver: `Pm = Pc / η`.
 *
 * Distinct from [netCuttingPower], and the distinction is not pedantry. η
 * describes losses between the motor and the cut, so a term dividing by it
 * cannot belong to a quantity measured at the tool. Sandvik Coromant computes
 * required machine power in exactly two steps for this reason: net power at the
 * cutter, then the efficiency factor.
 *
 * It is `Pm`, never `Pc`, that a spindle rating should be compared against. At
 * η = 0.8 the two differ by 25%, which is most of the margin anyone leaves.
 *
 * This page previously showed `Pm` under the words "Net cutting power" while
 * the Kotlin app showed `Pc` under the same words — two surfaces of one product
 * printing kilowatt figures 25% apart under identical labels.
 */
export function machinePower(
  netKw: number,
  efficiency: number = DEFAULT_EFFICIENCY,
): number {
  assertPositive('netKw', netKw);
  if (!(efficiency > 0 && efficiency <= 1)) {
    throw new RangeError(`efficiency must be in (0, 1], got ${efficiency}`);
  }
  return netKw / efficiency;
}

/**
 * The MACHINE power for milling, in kW — `Pm`, not `Pc`.
 *
 * The name predates the split and is kept because callers depend on it, but it
 * takes an efficiency and therefore returns the machine figure. Expressed
 * through [netCuttingPower] and [machinePower] so it cannot diverge from them.
 */
export function millingPower(
  aeNm: Nanometres,
  apNm: Nanometres,
  vfNmPerMin: number,
  kc: number,
  efficiency: number = DEFAULT_EFFICIENCY,
): number {
  return machinePower(
    netCuttingPower(millingMrr(aeNm, apNm, vfNmPerMin), kc),
    efficiency,
  );
}

// ─── The chip a milling tooth really cuts ──────────────────────────────────
//
// `calculations.md` §3, "Chip thickness" and "Entering angle κr". A tooth does
// not cut a chip as thick as its feed per tooth: the chip is comma-shaped, and
// how thick it gets depends on how much of the cutter is in the cut and on the
// angle the edge meets the work at. Straight cutting edges only — a round
// insert's entering angle changes with depth, and Sandvik gives it separate
// formulas in the insert diameter, not covered here.
//
// Until 2026-10-06 this module had one chip figure, hm ≈ fz × √(ae/Dc). That
// is the narrow-cut limit of the real mean: right at 10% engagement (0.3162
// against 0.3108), 57% thick in a full slot (fz against (2/π) fz), and the
// Kienzle force it fed came out low by the same chip, so slotting power was
// about 11% short at mc 0.25 (D103).

/** A square shoulder: the entering angle at which every formula below is κr-free. */
export const SQUARE_SHOULDER_DEG = 90;

/**
 * Refuse an entering angle the straight-edge formulas cannot take.
 *
 * κr is measured from the surface being cut: 90° for a square shoulder, 45°
 * for most face mills, about 10° for a high-feed cutter. Zero would be an edge
 * lying flat on the work, with no chip and an infinite cutting diameter.
 */
function assertEnteringAngle(kappaDeg: number): void {
  // A 0 is almost certainly an American lead angle, measured from the axis
  // rather than the surface (the app's refusal says the same).
  if (kappaDeg === 0) {
    throw new RangeError(
      'An entering angle of 0° would lay the edge flat on the work. A lead angle of 0° is a square shoulder: enter 90°, or leave it blank.',
    );
  }
  if (!Number.isFinite(kappaDeg) || kappaDeg <= 0 || kappaDeg > 90) {
    throw new RangeError(
      'The entering angle κr must be more than 0° and no more than 90°.',
    );
  }
}

/** sin κr, exactly 1 at a square shoulder rather than whatever a float makes it. */
function sinKappa(kappaDeg: number): number {
  // A last-bit difference in sin κr cannot move a four-decimal figure except
  // at a tie, and ties are rounded from `chipThinningSquared`, exactly.
  return kappaDeg === SQUARE_SHOULDER_DEG ? 1 : Math.sin((kappaDeg * Math.PI) / 180);
}

/**
 * sin² κr as an exact fraction, where it is rational. By Niven's theorem the
 * angles in (0°, 90°] whose cos 2κr — and so sin² κr = (1 − cos 2κr) / 2 — is
 * rational are the multiples of 30° and 45°.
 */
const EXACT_SIN2: Readonly<Record<number, readonly [bigint, bigint]>> = {
  30: [1n, 4n],
  45: [1n, 2n],
  60: [3n, 4n],
  90: [1n, 1n],
};

/**
 * (hex / fz)² as an exact fraction, wherever one exists; null where it does
 * not, which is where a chip cannot land exactly on a rounding tie by any but
 * a contrived coincidence of the inputs.
 *
 * A chip that lands exactly on a tie — 0.00225 mm, say, half-way between
 * 0.0022 and 0.0023 — has to be rounded from its exact value, because a float
 * a hair either side decides it otherwise. One did: a 50 mm 45° cutter 20 mm
 * deep, ae 10, cuts at Dcap 90 and thins the chip to exactly 4/9 of fz, so
 * fz 0.001 mm is restored by exactly 0.00225 mm, and the floats printed 0.0023.
 * Half-even says 0.0022. So the display rounds hex and the restoring feed from
 * their squares — fz² × this fraction, and fz² over it — in exact integers.
 *
 * Exact, at full width (ae ≥ D/2), wherever sin² κr is rational: the ratio is
 * sin κr alone. Below full width also D must be rational: Dc at 90°, and
 * Dc + 2 × ap at 45°, where tan κr is 1. Lengths must be whole nanometres.
 */
export function chipThinningSquared(
  aeNm: number,
  diameterNm: number,
  kappaDeg: number,
): { readonly num: bigint; readonly den: bigint } | null {
  const sin2 = EXACT_SIN2[kappaDeg];
  if (sin2 === undefined || !Number.isInteger(aeNm)) return null;
  const [sNum, sDen] = sin2;
  if (2 * aeNm >= diameterNm) return { num: sNum, den: sDen };
  if ((kappaDeg !== 90 && kappaDeg !== 45) || !Number.isInteger(diameterNm)) return null;
  const ae = BigInt(aeNm);
  const d = BigInt(diameterNm);
  // (sin κr × 2 × √(D × ae − ae²) / D)² = sin² κr × 4 × ae × (D − ae) / D²
  return { num: sNum * 4n * ae * (d - ae), den: sDen * d * d };
}

/** One pass cannot cut wider than the diameter the chip is cut at. */
function assertWidth(aeNm: number, diameterNm: number): void {
  if (aeNm > diameterNm) {
    throw new RangeError(
      'The width of cut aₑ cannot be more than the cutter diameter: that is two passes.',
    );
  }
}

/**
 * The diameter an angled cutter cuts at, at depth of cut ap, in nm:
 *
 *     Dcap = Dc + 2 × ap / tan κr
 *
 * Sandvik Coromant, milling formulas ("Max. cutting diameter at specific
 * depth", straight cutting edge) and catalogue page H 79, which define Dcap as
 * the cutting diameter at depth ap and work the cutting speed, the spindle
 * speed and the maximum chip all at it. `Dc` is the catalogue's diameter, at
 * the tip of an angled cutter: the CoroMill 345 63 mm 45° cutter cuts at
 * 63 + 2 × 6 / tan 45° = 75 mm at its 6 mm maximum depth.
 *
 * At κr = 90° it is Dc exactly, whatever the depth.
 */
export function cuttingDiameterAtDepth(
  dcNm: Nanometres,
  apNm: Nanometres,
  kappaDeg: number,
): number {
  assertPositive('dcNm', dcNm);
  assertPositive('apNm', apNm);
  assertEnteringAngle(kappaDeg);
  if (kappaDeg === SQUARE_SHOULDER_DEG) return dcNm;
  // tan 45° is 1; Math.tan(π/4) is 0.9999999999999999, which would put a
  // whole-nanometre Dcap a hair off and every rounding tie from it with it.
  if (kappaDeg === 45) return dcNm + 2 * apNm;
  return dcNm + (2 * apNm) / Math.tan((kappaDeg * Math.PI) / 180);
}

/**
 * How thick the chip is against the feed per tooth: hex / fz, above 0, at most 1.
 *
 * Sandvik Coromant, milling formulas (images read 2026-09-25 and 2026-10-05):
 *
 *     ae ≥ D/2:   hex = fz × sin κr
 *     ae < D/2:   hex = fz × sin κr × 2 × √(D × ae − ae²) / D
 *
 * D is the diameter the chip is cut at, Dcap on an angled cutter. The two
 * branches meet at ae = D/2.
 */
export function chipThinning(aeNm: number, diameterNm: number, kappaDeg: number): number {
  assertPositive('aeNm', aeNm);
  assertPositive('diameterNm', diameterNm);
  assertEnteringAngle(kappaDeg);
  assertWidth(aeNm, diameterNm);
  const s = sinKappa(kappaDeg);
  if (2 * aeNm >= diameterNm) return s;
  // √(D × ae − ae²) written as √(ae × (D − ae)), which cancels less.
  return (s * 2 * Math.sqrt(aeNm * (diameterNm - aeNm))) / diameterNm;
}

/** Maximum chip thickness hex, in nm: fz × (hex / fz). */
export function maxChipThickness(
  fzNm: Nanometres,
  aeNm: number,
  diameterNm: number,
  kappaDeg: number = SQUARE_SHOULDER_DEG,
): number {
  assertPositive('fzNm', fzNm);
  return fzNm * chipThinning(aeNm, diameterNm, kappaDeg);
}

/**
 * The feed per tooth that cuts a chip as thick as `fz`, in nm.
 *
 * Sandvik prints the formula this way round — fz "is calculated from the
 * recommended maximum chip thickness value" — so with the data sheet's fz read
 * as the chip it means, the feed that cuts it is fz ÷ (hex / fz). At 10%
 * engagement on a square shoulder that is 1/0.6 = 1.667 times the feed.
 *
 * Shown, never applied: data sheets for angled cutters often print fz already
 * raised for κr, and raising it again would be 1.4 times too much on a 45°
 * face mill and 5.8 times on a 10° cutter.
 */
export function restoringFeed(
  fzNm: Nanometres,
  aeNm: number,
  diameterNm: number,
  kappaDeg: number = SQUARE_SHOULDER_DEG,
): number {
  assertPositive('fzNm', fzNm);
  return fzNm / chipThinning(aeNm, diameterNm, kappaDeg);
}

/**
 * Mean chip thickness hm, in nm — exact, not the √(ae/Dc) approximation this
 * module used before.
 *
 *     hm = fz × sin κr × (ae/D) × (360/π) / arccos°(1 − 2 × ae/D)
 *
 * Kennametal Inc, US Patent 12,202,058 B2 ("Peripheral milling tool and method
 * for arranging cutting edges", Frank Endres). The patent prints 114.6, a
 * rounding of 360/π = 114.5916…; the exact constant is used. With the arccos
 * in radians, (360/π) / arccos° is 2 / arccos. It is the mean of
 * fz × sin κr × sin φ over the arc φ the tooth spends in the cut, and gives
 * the textbook (2/π) × fz in a full slot.
 *
 * D is the diameter the chip is cut at, Dcap on an angled cutter. This is the
 * chip thickness the Kienzle force takes.
 */
export function meanChipThickness(
  fzNm: Nanometres,
  aeNm: number,
  diameterNm: number,
  kappaDeg: number = SQUARE_SHOULDER_DEG,
): number {
  assertPositive('fzNm', fzNm);
  assertPositive('aeNm', aeNm);
  assertPositive('diameterNm', diameterNm);
  assertEnteringAngle(kappaDeg);
  assertWidth(aeNm, diameterNm);
  const x = aeNm / diameterNm;
  return (fzNm * sinKappa(kappaDeg) * x * 2) / Math.acos(1 - 2 * x);
}

// ─── Tapping: the feed is the pitch ─────────────────────────────────────────
//
// `calculations.md` §3, "Tapping: the feed is the pitch". Sandvik Coromant's
// tapping formulas (threading formulas page, images read 2026-10-06):
//
//     n  = vc × 1000 / (π × D)     metric     n = vc × 12 / (π × D)     inch
//     vf = P × n
//
// with D the tap's nominal diameter and P its pitch. The page's definitions
// call the pitch p and the power P; a feed of power times speed means
// nothing, so the P in the feed is the pitch.
//
// A control is given S as a whole number of rev/min, and in synchronised
// (rigid) tapping the feed must be the pitch times the speed the spindle
// really turns at. Haas's G84 guide works every example that way — "S500",
// then "F = P*RPM = 1.75*500" — and says F and S "work together to time the
// Z-Axis feed movement with the spindle position". So vf is worked from S, the
// rounded n, and F ÷ S is the pitch exactly. Worked from n instead, an
// M10 × 1.5 at 10 m/min would show S318 beside F477.4648: a 1.5015 mm thread.

/**
 * A tap's thread: a metric pitch in whole nanometres, or an inch tap's
 * threads per inch, kept as the count it is. 1/TPI inch is a whole number of
 * nanometres only when TPI divides 25 400 000 (20 does, 13 does not).
 */
export type TapThread =
  | { readonly kind: 'pitch'; readonly pitchNm: Nanometres }
  | { readonly kind: 'tpi'; readonly tpi: number };

/** An exact length or rate, num / den nanometres (per minute, for a rate). */
export interface Ratio {
  readonly num: number;
  readonly den: number;
}

/**
 * Threads per inch as a whole number over a power of ten: 13 is 13/1, 11.5
 * (the 1 to 2 inch pipe taps) is 115/10. More than three decimals is refused
 * as a slip; a count is never that fine.
 */
function tpiRatio(tpi: number): Ratio {
  if (!Number.isFinite(tpi) || tpi <= 0) {
    throw new RangeError('Enter the threads per inch as a number above zero.');
  }
  for (const scale of [1, 10, 100, 1000]) {
    const whole = Math.round(tpi * scale);
    if (Math.abs(whole - tpi * scale) < 1e-9 * scale) return { num: whole, den: scale };
  }
  throw new RangeError('Threads per inch has more than three decimals: check the count.');
}

/** The pitch as an exact fraction of nanometres: P / 1, or 25 400 000 / TPI. */
export function tapPitch(thread: TapThread): Ratio {
  if (thread.kind === 'pitch') {
    assertPositive('pitchNm', thread.pitchNm);
    return { num: thread.pitchNm, den: 1 };
  }
  const t = tpiRatio(thread.tpi);
  return { num: NM_PER_INCH * t.den, den: t.num };
}

/**
 * The synchronised tapping feed, nm/min, exactly: vf = P × S.
 *
 * `spindleRpm` is S, the whole rev/min the control is given — never the
 * unrounded n.
 */
export function tappingFeed(spindleRpm: number, thread: TapThread): Ratio {
  if (!Number.isInteger(spindleRpm) || spindleRpm < 1) {
    throw new RangeError(
      `S must be a whole number of rev/min, 1 or more, got ${spindleRpm}`,
    );
  }
  const p = tapPitch(thread);
  return { num: spindleRpm * p.num, den: p.den };
}
