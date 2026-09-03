/**
 * What the tap drill page SHOWS, as data rather than as DOM.
 *
 * ─── Why this module exists ─────────────────────────────────────────────────
 *
 * D72 shipped a page that displayed `201.2861 in` where the answer was
 * `0.2013 in`. The calculation was right; the page divided nanometres by
 * `25400` — the MICROMETRE-per-inch constant — while formatting. 334 tests and
 * eleven gates passed, because every one of them stops at the module boundary
 * and nothing checked the layer that turns a number into a string.
 *
 * The conversion was written out by hand seven times inside the page's client
 * script, as `units === 'mm' ? x / 1_000_000 : x / 25400`. Duplication is what
 * made it possible to fix six and miss one — which is precisely what happened.
 *
 * So the formatting lives here, once, and `tapDrillDisplay` returns the strings
 * the page will render rather than rendering them. The page becomes a mapping
 * from this object onto DOM, and `tests/calc/tap-drill-display.test.ts` asserts
 * these strings against the golden fixture in BOTH unit systems. A future
 * `25400` in a template would have to survive that.
 */

import { drillsFor, type SeriesName } from './drill-series';
import {
  basicMinorDiameterNm,
  ENGAGEMENT_K,
  drillDiameterFor,
  engagementPercentExact,
  inchToNm,
  mmToNm,
  NM_PER_INCH,
  nmExactToMm,
  roundHalfEven,
  snapToSeries,
  tpiToPitchNm,
  type Nanometres,
} from './tap-drill';

export type DisplayUnits = 'mm' | 'in';

/** Gate 6: dimensional results render at four decimals or more. */
export const DISPLAY_DECIMALS = 4;

/**
 * A length in the user's unit, rounded once, at the boundary.
 *
 * THE ONLY PLACE nanometres become a displayed length. Both conversions are
 * here and neither is a bare literal: millimetres through `nmExactToMm`, inches
 * through `NM_PER_INCH`. If a caller needs a length on screen it comes from
 * here or it is a bug.
 */
export function lengthValue(
  valueNm: number,
  units: DisplayUnits,
  decimals: number = DISPLAY_DECIMALS,
): number {
  const converted = units === 'mm' ? nmExactToMm(valueNm) : valueNm / NM_PER_INCH;
  return roundHalfEven(converted, decimals);
}

/** The same value with its unit appended, which is what the page prints. */
export function formatLength(
  valueNm: number,
  units: DisplayUnits,
  decimals: number = DISPLAY_DECIMALS,
): string {
  return `${lengthValue(valueNm, units, decimals)} ${units}`;
}

/** A signed offset from the target, for the neighbouring-drills table. */
export function formatDelta(deltaNm: number, units: DisplayUnits): string {
  const value = lengthValue(deltaNm, units);
  return `${value > 0 ? '+' : ''}${value}`;
}

export interface NeighbourRow {
  label: string;
  length: string;
  engagementPercent: number;
  delta: string;
  chosen: boolean;
}

export interface TapDrillDisplay {
  drillLabel: string;
  drillLength: string;
  /** The engagement the chosen drill truly gives, at two decimals. */
  engagementPercent: number;
  /** What the user asked for, carried so the page can show both. */
  requestedPercent: number;
  targetLength: string;
  minorLength: string;
  neighbours: NeighbourRow[];
  /** The "how this was calculated" block, verbatim. */
  working: string;
}

export interface TapDrillInput {
  major: number;
  pitch: number;
  engagementPercent: number;
  units: DisplayUnits;
  series: SeriesName;
}

/** How many neighbouring drills the table shows, centred on the target. */
const NEIGHBOURHOOD = 7;

/**
 * K as the working box prints it, taken from the exported constant rather than
 * typed, so the number shown cannot drift from the number used.
 */
const K_SHOWN = roundHalfEven(ENGAGEMENT_K, 6);

/**
 * Everything the result panel needs, computed and formatted.
 *
 * Throws `RangeError` with the message the page shows the user; the caller is
 * responsible for displaying it, not for wording it.
 */
export function tapDrillDisplay(input: TapDrillInput): TapDrillDisplay {
  const { major, pitch, engagementPercent, units, series } = input;

  const majorNm: Nanometres = units === 'mm' ? mmToNm(major) : inchToNm(major);
  const pitchNm: Nanometres = units === 'mm' ? mmToNm(pitch) : tpiToPitchNm(pitch);
  if (pitchNm >= majorNm) {
    throw new RangeError('Pitch must be smaller than the diameter.');
  }

  const targetNm = drillDiameterFor(majorNm, pitchNm, engagementPercent);
  if (targetNm <= 0) {
    throw new RangeError('That engagement leaves no drill diameter.');
  }

  const drills = drillsFor(series);
  const choice = snapToSeries(majorNm, pitchNm, targetNm, drills);
  if (!choice) {
    throw new RangeError('No drill index selected.');
  }

  /*
   * Above the top of the index there is no answer, and the largest drill is
   * not an approximation of one.
   *
   * `snapToSeries` takes the NEAREST drill, which above the ceiling means the
   * largest one however far away it is. For the metric index, which stops at
   * 13 mm, that produced actual recommendations of:
   *
   *     M16 -> 13 mm at 115.47 %      M24 -> 13 mm at 282.26 %
   *     M20 -> 13 mm at 215.54 %      M30 -> 13 mm at 373.90 %
   *
   * "Use this drill: 13 mm" for an M30 thread is a broken tap and a scrapped
   * part. The engagement figure beside it is absurd enough to notice, but the
   * headline is a plausible-looking drill size, and Gate 9 is explicit that
   * `unavailable` is an acceptable output while a plausible wrong number is
   * not. The Kotlin core already refuses these; this is the site catching up.
   *
   * Only the upper bound is guarded. Below the smallest drill the nearest one
   * genuinely IS the nearest real drill — a 0.49 mm target against a 0.5 mm
   * index is a fair answer — whereas 17.5 against 13 is not. See D73.
   */
  const largest = drills.reduce((m, d) => (d.nm > m ? d.nm : m), 0);
  if (targetNm > largest) {
    throw new RangeError(
      `No drill in this index reaches ${formatLength(targetNm, units)}. ` +
        `The largest it holds is ${formatLength(largest, units)}.`,
    );
  }

  const neighbours = drills
    .map((d) => ({ d, delta: d.nm - targetNm }))
    .sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta))
    .slice(0, NEIGHBOURHOOD)
    .sort((a, b) => a.d.nm - b.d.nm)
    .map(({ d, delta }) => ({
      label: d.label,
      length: formatLength(d.nm, units),
      engagementPercent: roundHalfEven(engagementPercentExact(majorNm, pitchNm, d.nm), 2),
      delta: formatDelta(delta, units),
      chosen: d.nm === choice.drill.nm,
    }));

  return {
    drillLabel: choice.drill.label,
    drillLength: formatLength(choice.drill.nm, units),
    engagementPercent: roundHalfEven(choice.engagementPercent, 2),
    requestedPercent: engagementPercent,
    targetLength: formatLength(targetNm, units),
    minorLength: formatLength(basicMinorDiameterNm(majorNm, pitchNm), units),
    neighbours,
    working:
      `%engagement = 100 × (D − d) / (K × P)   K = 3√3⁄4 = ${K_SHOWN}

` +
      `D  major diameter  = ${formatLength(majorNm, units)}
` +
      `P  pitch           = ${formatLength(pitchNm, units)}
` +
      `d  target diameter = ${formatLength(targetNm, units)}   (for ${engagementPercent}%)
` +
      `d  chosen drill    = ${formatLength(choice.drill.nm, units)}   ${choice.drill.label}

` +
      `100 × (${lengthValue(majorNm, units)} − ${lengthValue(choice.drill.nm, units)})` +
      ` / (${K_SHOWN} × ${lengthValue(pitchNm, units)}) = ${roundHalfEven(choice.engagementPercent, 2)}%`,
  };
}
