/**
 * The figures on /machining/chip-thinning, a derivation page.
 *
 * ─── Why a module and not the page's frontmatter ────────────────────────────
 *
 * As for /machining/percentage-of-thread (D110): the page types no figure.
 * Every number it prints is a string returned here, worked by the feeds and
 * speeds engine's own functions (`chipThinning`, `maxChipThickness`,
 * `restoringFeed`, `meanChipThickness`, `cuttingDiameterAtDepth`), and
 * `tests/calc/chip-thinning-figures.test.ts` pins each one against what a
 * maker printed or against the derivation it stands for.
 *
 * ─── The makers ─────────────────────────────────────────────────────────────
 *
 *   - M.A. Ford, TuffCut GP "General Purpose End Mill Recommended Cutting
 *     Data - Profile Milling", catalogue p. 360: "Multiply fz by this Factor
 *     based on ae", 2.3, 1.8, 1.2, 1.1 and 1 at 5, 10, 20, 30 and 50 %. Read
 *     on 2026-10-15, the text layer and the page image, which agree.
 *   - Sandvik Coromant, "Entering angle and chip thickness in milling": the
 *     feed for a 0.1 mm chip at five entering angles and their modification
 *     factors, read on 2026-10-06 (`tests/calc/feeds-speeds.test.ts`).
 *
 * ─── Rounding (CLAUDE.md rule 3) ────────────────────────────────────────────
 *
 * Each figure is rounded once, half-even, from the engine's value. The one
 * place a tie is the subject — M.A. Ford's one-decimal factors, where 20 %
 * engagement gives exactly 1.25 — is rounded from the exact square of the
 * factor in integers (`roundedFactor`), never from a float near it.
 */

import {
  chipThinning,
  chipThinningSquared,
  cuttingDiameterAtDepth,
  maxChipThickness,
  meanChipThickness,
  restoringFeed,
} from './feeds-speeds';
import { mmToNm, roundHalfEven } from './tap-drill';
import { isqrt } from './true-position';

const fixed = (value: number, decimals: number): string =>
  roundHalfEven(value, decimals).toFixed(decimals);

/**
 * The factor fz ÷ hex = 1 ÷ (hex / fz), rounded half-even to `decimals`, from
 * its exact square where one exists. `null` where (hex / fz)² is irrational,
 * where no tie can occur and the caller may round the float.
 *
 * factor² = den / num. With s = 10^decimals, m = ⌊factor × s⌋ = isqrt(⌊den ×
 * s² / num⌋), and the factor lies above m + ½ exactly when 4 × den × s² >
 * (2m + 1)² × num.
 */
export function roundedFactor(
  aeNm: number,
  diameterNm: number,
  kappaDeg: number,
  decimals: number,
): string | null {
  const sq = chipThinningSquared(aeNm, diameterNm, kappaDeg);
  if (sq === null) return null;
  const s2 = 10n ** BigInt(2 * decimals);
  const m = isqrt((sq.den * s2) / sq.num);
  const lhs = 4n * sq.den * s2;
  const rhs = (2n * m + 1n) ** 2n * sq.num;
  const up = lhs > rhs || (lhs === rhs && m % 2n === 1n);
  const scaled = up ? m + 1n : m;
  const text = scaled.toString().padStart(decimals + 1, '0');
  return decimals === 0 ? text : `${text.slice(0, -decimals)}.${text.slice(-decimals)}`;
}

// ─── What the makers printed ───────────────────────────────────────────────

/** M.A. Ford's factors, catalogue p. 360, against ae as a share of D. */
const MA_FORD = [
  { percent: 5, printed: '2.3' },
  { percent: 10, printed: '1.8' },
  { percent: 20, printed: '1.2' },
  { percent: 30, printed: '1.1' },
  { percent: 50, printed: '1' },
] as const;

/**
 * Sandvik's feed for a 0.1 mm chip, and the factor it prints, at each
 * entering angle. Its 0.15 and 0.2 mm columns are tested with the engine.
 */
const SANDVIK_KAPPA = [
  { kappa: 90, feed: '0.10', factor: '1.0' },
  { kappa: 75, feed: '0.10', factor: '1.0' },
  { kappa: 65, feed: '0.11', factor: '1.1' },
  { kappa: 45, feed: '0.14', factor: '1.4' },
  { kappa: 10, feed: '0.58', factor: '5.8' },
] as const;

// ─── The figures ───────────────────────────────────────────────────────────

export interface EngagementRow {
  /** ae as a share of D, in percent. */
  percent: number;
  /** ae on the 10 mm end mill, mm. */
  ae: string;
  /** hex / fz, four decimals. */
  thinning: string;
  /** fz ÷ hex: the factor that restores the chip, four decimals. */
  factor: string;
  /** The same factor at one decimal, as M.A. Ford prints its own. */
  factorOne: string;
  /** M.A. Ford's printed factor. */
  maFord: string;
  /** hm / fz, four decimals. */
  mean: string;
}

export interface ChipThinningFigures {
  /** The worked end mill: its diameter in mm. */
  diameter: string;
  rows: EngagementRow[];
  /** The worked feed: a data sheet's fz, its chip at 10 %, and the feed that restores it. */
  sheet: { fz: string; hex: string; restore: string };
  /** A full slot: hm / fz = 2 / π, and the √(ae/D) approximation's fz. */
  slot: { mean: string; approxOver: string; powerShort: string; mc: string };
  kappa: {
    kappa: number;
    feed: string;
    ours: string;
    factor: string;
    oursFactor: string;
  }[];
  /** Sandvik's CoroMill 345: 63 mm, 45°, 6 mm deep: Dcap. */
  coromill: { dc: string; ap: string; dcap: string };
}

/** The worked end mill. */
const D_MM = 10;
/** The worked data-sheet feed per tooth, mm. */
const SHEET_FZ_MM = 0.05;
/** The worked Kienzle exponent: an example value, not a material's. */
const MC = 0.25;

export function chipThinningFigures(): ChipThinningFigures {
  const D = mmToNm(D_MM);

  const rows = MA_FORD.map((f): EngagementRow => {
    const ae = mmToNm((D_MM * f.percent) / 100);
    const ratio = chipThinning(ae, D, 90);
    const one = roundedFactor(ae, D, 90, 1) ?? fixed(1 / ratio, 1);
    return {
      percent: f.percent,
      ae: fixed((D_MM * f.percent) / 100, 1),
      thinning: fixed(ratio, 4),
      factor: fixed(1 / ratio, 4),
      // Ford prints "1" for a factor of one; so does this, nothing else.
      factorOne: one === '1.0' ? '1' : one,
      maFord: f.printed,
      mean: fixed(meanChipThickness(mmToNm(1), ae, D) / 1e6, 4),
    };
  });

  const ae10 = mmToNm(1);
  const fz = mmToNm(SHEET_FZ_MM);
  const slotMean = meanChipThickness(mmToNm(1), D, D) / 1e6;

  return {
    diameter: fixed(D_MM, 0),
    rows,
    sheet: {
      fz: fixed(SHEET_FZ_MM, 4),
      hex: fixed(maxChipThickness(fz, ae10, D) / 1e6, 4),
      restore: fixed(restoringFeed(fz, ae10, D) / 1e6, 4),
    },
    slot: {
      mean: fixed(slotMean, 4),
      // The approximation hm ≈ fz × √(ae/D) gives fz in a full slot.
      approxOver: fixed((1 / slotMean - 1) * 100, 1),
      // kc = kc1.1 × hm^(−mc): too thick a chip gives too low a kc, by
      // (hm_true / hm_approx)^mc, and the power with it.
      powerShort: fixed((1 - slotMean ** MC) * 100, 1),
      mc: fixed(MC, 2),
    },
    kappa: SANDVIK_KAPPA.map((k) => {
      // A full-width cut, so only the entering angle thins the chip.
      const restore = restoringFeed(mmToNm(0.1), D, D, k.kappa) / 1e6;
      return {
        kappa: k.kappa,
        feed: k.feed,
        ours: fixed(restore, 4),
        factor: k.factor,
        oursFactor: fixed(1 / chipThinning(D, D, k.kappa), 4),
      };
    }),
    coromill: {
      dc: fixed(63, 0),
      ap: fixed(6, 0),
      dcap: fixed(cuttingDiameterAtDepth(mmToNm(63), mmToNm(6), 45) / 1e6, 4),
    },
  };
}
