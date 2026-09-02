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

import { NM_PER_INCH, type Nanometres } from './tap-drill';

/** Spindle efficiency is never 1. 0.75–0.9 is the usual band for a mill. */
export const DEFAULT_EFFICIENCY = 0.8;

export type UnitSystem = 'metric' | 'inch';

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
 * Material removal rate for turning, in cm³/min.
 *
 * Q = Vc × ap × fn, with Vc in m/min, ap in mm and fn in mm/rev.
 *
 * A DIFFERENT FORMULA, not the milling one relabelled. Turning removes a ring
 * of material per revolution rather than a swept slot, and apps that reuse the
 * milling expression here are one of the recurring complaints in the reviews.
 */
export function turningMrr(
  cuttingSpeed: number,
  apNm: Nanometres,
  fnNmPerRev: number,
): number {
  assertPositive('cuttingSpeed', cuttingSpeed);
  assertPositive('apNm', apNm);
  assertPositive('fnNmPerRev', fnNmPerRev);
  return cuttingSpeed * (apNm / 1_000_000) * (fnNmPerRev / 1_000_000);
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
 * Net cutting power for milling, in kW.
 *
 * Pc = (ae × ap × vf × kc) / (60 × 10⁶ × η)
 *
 * NET at the cut, before spindle losses beyond η. Compare it against the
 * machine's rated power and warn — never block. Machinists exceed a rating
 * deliberately for a short cut and resent being stopped.
 */
export function millingPower(
  aeNm: Nanometres,
  apNm: Nanometres,
  vfNmPerMin: number,
  kc: number,
  efficiency: number = DEFAULT_EFFICIENCY,
): number {
  assertPositive('kc', kc);
  if (!(efficiency > 0 && efficiency <= 1)) {
    throw new RangeError(`efficiency must be in (0, 1], got ${efficiency}`);
  }
  const aeMm = aeNm / 1_000_000;
  const apMm = apNm / 1_000_000;
  const vfMmPerMin = vfNmPerMin / 1_000_000;
  return (aeMm * apMm * vfMmPerMin * kc) / (60e6 * efficiency);
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
