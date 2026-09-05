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
 * Net cutting power for milling, in kW.
 *
 * Kept as the milling-shaped entry point, expressed through [cuttingPower] so
 * the two cannot diverge.
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

/**
 * Average chip thickness for a side-milling cut, in nm.
 *
 * hm ≈ fz × sin(κ) × √(ae/Dc) for ae < Dc/2, which is the common radial-chip-
 * thinning approximation with the lead angle κ taken as 90° (a square-shoulder
 * cutter). Slotting (ae = Dc) reduces to fz.
 *
 * APPROXIMATE, and labelled so wherever it is shown. Exact chip thickness
 * depends on cutter geometry the tool vendor knows and this calculator does
 * not; the approximation is what the vendor guides themselves publish for
 * sizing a cut.
 */
export function meanChipThickness(
  fzNm: Nanometres,
  aeNm: Nanometres,
  dcNm: Nanometres,
): number {
  assertPositive('fzNm', fzNm);
  assertPositive('aeNm', aeNm);
  assertPositive('dcNm', dcNm);
  const ratio = Math.min(aeNm / dcNm, 1);
  return fzNm * Math.sqrt(ratio);
}
