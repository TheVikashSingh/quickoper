/**
 * Drill catalogues.
 *
 * ─── The decision that shapes this file ─────────────────────────────────────
 *
 * There are four drill series in common shop use: metric, fractional inch,
 * number (#80–#1) and letter (A–Z). Two of them are ARITHMETIC and two are
 * TRANSCRIBED, and that distinction decides what ships here.
 *
 *   metric      0.50, 0.55 … 3.00, 3.10 …      a known step. Computable.
 *   fractional  1/64", 2/64", 3/64" …          n × 25400/64 µm. Computable.
 *   number      #1 = 0.2280", #2 = 0.2210" …   a lookup table. Transcribed.
 *   letter      A = 0.2340", B = 0.2380" …     a lookup table. Transcribed.
 *
 * The first two are generated from their own definition, so there is no
 * opportunity for a transcription error: a wrong value would require the
 * arithmetic to be wrong, and the arithmetic is tested. The second two are
 * sixty-odd decimal numbers that someone has to copy correctly, and a single
 * mistyped digit is a scrapped part.
 *
 * SO NUMBER AND LETTER DRILLS ARE NOT IN THIS FILE. They arrive as a data file
 * carrying the same `verified_against` provenance the golden fixtures use, once
 * a human has checked them against a manufacturer catalogue. Shipping them from
 * recollection would put exactly the class of unverified figure into the
 * product that the provenance gate exists to keep out.
 *
 * The cost is real and is worth paying: an inch-first user gets fractional
 * sizes only until that lands. The metric user — who is the entire reason this
 * tool exists — is fully served today.
 *
 * ─── Sources ────────────────────────────────────────────────────────────────
 *
 *   - ISO 235 / DIN 338: parallel-shank twist drills, metric diameter series.
 *   - ASME B94.11M: twist drills, fractional inch series.
 *
 * Both are cited for the SERIES DEFINITION — the step and the range — not for
 * individual values, because individual values are computed here.
 */

import { type Drill, um, UM_PER_INCH } from './tap-drill';

/**
 * The metric index, in µm.
 *
 * NOT a uniform step, and the first draft of this file was wrong to assume one.
 * A 0.1 mm step from 0.5 mm skips 1.25 mm — which is the standard tap drill for
 * M1.6 — and 2.05 mm, which is M2.5's. Real indexes are finer at the small end,
 * and the test that checks the fixtures' drills are present is what caught it.
 *
 * BE PRECISE ABOUT WHAT THIS IS. It is a shop index at 0.05 mm steps to 3 mm
 * and 0.1 mm above, which is what a good metric set actually contains and is a
 * SUPERSET of the sizes the tap drill tables call for. It is not a
 * reproduction of the DIN 338 R40 preferred-number series, which is a
 * transcription job and therefore subject to the same verification gate as the
 * number and letter drills.
 */
const METRIC_MIN_UM = 500; // 0.5 mm
const METRIC_FINE_MAX_UM = 3_000; // 0.05 mm steps up to here
const METRIC_MAX_UM = 13_000; // 13.0 mm — the usual jobber-set ceiling
const METRIC_FINE_STEP_UM = 50; // 0.05 mm
const METRIC_COARSE_STEP_UM = 100; // 0.1 mm

/** Fractional inch drills run 1/64" to 1/2" in a general set. */
const FRACTIONAL_MIN_64THS = 1;
const FRACTIONAL_MAX_64THS = 32; // 32/64 = 1/2"

/**
 * Format a µm value as a millimetre label without trailing-zero noise.
 *
 * 3300 → "3.3 mm", 3000 → "3 mm". Machinists write 3.3, not 3.30.
 */
function mmLabel(valueUm: number): string {
  return `${String(Number((valueUm / 1000).toFixed(2)))} mm`;
}

/** Reduce n/64 to its lowest terms, the way a drill is actually marked. */
function reduceSixtyFourth(n: number): string {
  let num = n;
  let den = 64;
  while (num % 2 === 0 && den % 2 === 0) {
    num /= 2;
    den /= 2;
  }
  return den === 1 ? `${num}"` : `${num}/${den}"`;
}

/**
 * The metric index: 0.5–3.0 mm in 0.05 mm steps, 3.1–13.0 mm in 0.1 mm steps.
 *
 * Generated, not transcribed. Every diameter is an exact multiple of 50 µm.
 */
export const METRIC_DRILLS: readonly Drill[] = (() => {
  const out: Drill[] = [];
  for (let v = METRIC_MIN_UM; v <= METRIC_FINE_MAX_UM; v += METRIC_FINE_STEP_UM) {
    out.push({ um: um(v), label: mmLabel(v), series: 'metric' });
  }
  for (
    let v = METRIC_FINE_MAX_UM + METRIC_COARSE_STEP_UM;
    v <= METRIC_MAX_UM;
    v += METRIC_COARSE_STEP_UM
  ) {
    out.push({ um: um(v), label: mmLabel(v), series: 'metric' });
  }
  return out;
})();

/**
 * The fractional inch series: 1/64" to 1/2" in 1/64" steps.
 *
 * 25400 / 64 = 396.875 µm, which is not a whole micrometre — so each diameter
 * is rounded to the nearest µm on construction. That rounding is a PRESENTATION
 * choice about the catalogue, not arithmetic inside a calculation: the true
 * fraction is what it is, and 0.125 µm is four orders of magnitude below any
 * tolerance the tool reports.
 */
export const FRACTIONAL_DRILLS: readonly Drill[] = Array.from(
  { length: FRACTIONAL_MAX_64THS - FRACTIONAL_MIN_64THS + 1 },
  (_, i): Drill => {
    const sixtyFourths = FRACTIONAL_MIN_64THS + i;
    const valueUm = Math.round((sixtyFourths * UM_PER_INCH) / 64);
    return {
      um: um(valueUm),
      label: reduceSixtyFourth(sixtyFourths),
      series: 'fractional',
    };
  },
);

/** Which catalogues a user can search. */
export type SeriesName = 'metric' | 'fractional' | 'both';

/**
 * The drills to search, ascending by diameter.
 *
 * `both` is the honest default for a mixed shop: a machinist with an imperial
 * index and a metric index reaches for whichever is closer, and hiding half the
 * rack behind a toggle is how a calculator recommends a drill its user does not
 * own.
 */
export function drillsFor(series: SeriesName): readonly Drill[] {
  const chosen =
    series === 'metric'
      ? METRIC_DRILLS
      : series === 'fractional'
        ? FRACTIONAL_DRILLS
        : [...METRIC_DRILLS, ...FRACTIONAL_DRILLS];
  return [...chosen].sort((a, b) => a.um - b.um);
}

/**
 * Series NOT yet available, and why — surfaced in the UI rather than hidden.
 *
 * A calculator that silently omits the number drills will recommend a 13/64"
 * where a #7 was the right answer, and the user has no way to know. Saying so
 * is the honest failure mode.
 */
export const PENDING_SERIES = [
  {
    name: 'DIN 338 R40 preferred series',
    reason:
      'The exact standard series, as distinct from the shop index generated here. Awaiting verification against the standard.',
  },
  {
    name: 'Number drills (#80–#1)',
    reason:
      'Sixty transcribed decimal values. Awaiting verification against a manufacturer catalogue before they ship.',
  },
  {
    name: 'Letter drills (A–Z)',
    reason:
      'Twenty-six transcribed decimal values. Awaiting the same verification against a manufacturer catalogue.',
  },
] as const;
