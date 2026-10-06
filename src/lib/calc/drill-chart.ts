/**
 * The printable drill size chart: rows, not a calculation.
 *
 * ─── Why this is a module and not markup on the page ────────────────────────
 *
 * The chart and the CSV next to it must be the SAME numbers. Formatting them
 * twice — once in an .astro template, once in an endpoint — is how a chart and
 * its download quietly disagree by a decimal place, and a wall chart that
 * disagrees with the file someone imported into a spreadsheet is worse than
 * neither. So both consume this, and this is what the tests read.
 *
 * Nothing here is a new figure. Every diameter comes from `drill-series.ts`,
 * which GENERATES the metric and fractional catalogues from their series
 * definitions and takes the number and letter drills from the table three
 * makers' charts were checked against (`number-letter-drills.ts`). This file
 * only decides how many decimals a machinist sees, and converts between mm and
 * inch on the exact definition 1 in = 25.4 mm.
 *
 * ─── Rounding, stated rather than assumed (CLAUDE.md rule 3) ────────────────
 *
 *   - Presentation only. No value here re-enters a calculation.
 *   - Millimetres to 3 decimals, inches to 4. Both are one digit finer than any
 *     drill tolerance.
 *   - Half-even, via `roundHalfEven`, matching every other module on the site.
 *   - Fixed width, not trimmed: a column of 0.500 / 0.550 / 0.600 aligns on the
 *     decimal point when printed and a column of 0.5 / 0.55 / 0.6 does not.
 *
 * Within any one series no two drills print the same figure in either column.
 * Across the four, two pairs share a figure because they are the same hole —
 * 12.7 mm and 1/2", 1/4" and letter E — and two more share only the INCH
 * figure, because they differ by about a micrometre: #13 is 0.1850 in
 * (4.699 mm) against 4.7 mm's 0.18504, and #12 is 0.1890 in (4.8006 mm)
 * against 4.8 mm's 0.18898. The millimetre column tells both pairs apart.
 * `tests/calc/drill-chart.test.ts` pins that exact list, so a change of
 * decimals that merged two different drills would fail naming them.
 *
 * Sources are the SERIES DEFINITIONS cited in `drill-series.ts` — ISO 235 /
 * DIN 338 for the metric index, ASME B94.11M for the fractional inch series —
 * and, for number and letter drills, the three makers' charts cited in
 * `number-letter-drills.ts`. The inch itself is exactly 25.4 mm by
 * international agreement (1959), which is why every inch row's millimetre
 * figure is exact rather than measured.
 */

import {
  FRACTIONAL_DRILLS,
  METRIC_DRILLS,
  drillsFor,
  type SeriesName,
} from './drill-series';
import { LETTER_DRILLS, NUMBER_DRILLS } from './number-letter-drills';
import { roundHalfEven, nmToInch, nmToMm, type Drill } from './tap-drill';

/** Decimals shown per unit. See the rounding note above. */
export const MM_DECIMALS = 3;
export const INCH_DECIMALS = 4;

export interface ChartRow {
  /** How the drill is marked: "6.8 mm", "17/64"", "#29" or "J". */
  readonly label: string;
  readonly series: Drill['series'];
  /** Diameter in millimetres, fixed to MM_DECIMALS. */
  readonly mm: string;
  /** The same diameter in inches, fixed to INCH_DECIMALS. */
  readonly inch: string;
  /** Where the makers disagree about this drill; empty for every other row. */
  readonly note: string;
  /** Sort key, and the value the two strings are rendered from. */
  readonly nm: number;
}

function toRow(drill: Drill): ChartRow {
  return {
    label: drill.label,
    series: drill.series,
    mm: roundHalfEven(nmToMm(drill.nm), MM_DECIMALS).toFixed(MM_DECIMALS),
    inch: roundHalfEven(nmToInch(drill.nm), INCH_DECIMALS).toFixed(INCH_DECIMALS),
    note: drill.note ?? '',
    nm: drill.nm,
  };
}

/** One series on its own, or one of the search indexes `drillsFor` builds. */
export type ChartSeries = SeriesName | 'number' | 'letter';

/**
 * The rows for one catalogue, ascending by diameter.
 *
 * `both` interleaves all four series by size, which is what a chart on a wall
 * is FOR: the question it answers is "what do I have near 6.75 mm", and the
 * answer spans every rack. The series column says which drawer to open.
 */
export function chartRows(series: ChartSeries): readonly ChartRow[] {
  const chosen =
    series === 'metric'
      ? METRIC_DRILLS
      : series === 'fractional'
        ? FRACTIONAL_DRILLS
        : series === 'number'
          ? NUMBER_DRILLS
          : series === 'letter'
            ? LETTER_DRILLS
            : drillsFor(series);
  // Array sort is stable, so the order drillsFor gives two names for one hole
  // (12.7 mm before 1/2", 1/4" before E) survives this.
  return chosen.map(toRow).sort((a, b) => a.nm - b.nm);
}

/** CSV header, kept next to the writer so the two cannot drift apart. */
export const CHART_CSV_HEADER = ['drill', 'series', 'diameter_mm', 'diameter_in', 'note'];

/**
 * The whole chart as CSV, all four series, ascending.
 *
 * Generated at build time and served as a static file, so the page needs no
 * JavaScript to offer it. A wall chart that costs a hydration bundle to
 * download a table it already printed would be a poor trade. The note column
 * carries J's and M's maker disagreement into the spreadsheet too, because a
 * caveat that stays behind on the web page is not a caveat.
 */
export function chartCsv(): string {
  const rows = chartRows('both').map((r) => [r.label, r.series, r.mm, r.inch, r.note]);
  return (
    [CHART_CSV_HEADER, ...rows].map((r) => r.map(csvField).join(',')).join('\n') + '\n'
  );
}

/**
 * RFC 4180 quoting.
 *
 * Fractional labels carry an inch mark — 17/64" — and a bare double quote inside
 * an unquoted CSV field is undefined behaviour that Excel resolves by eating it.
 * The drill mark is the one thing on a drill chart that has to survive the round
 * trip into a spreadsheet.
 */
function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
