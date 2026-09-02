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
 * definitions rather than transcribing them. This file only decides how many
 * decimals a machinist sees, and converts between mm and inch on the exact
 * definition 1 in = 25.4 mm.
 *
 * ─── Rounding, stated rather than assumed (CLAUDE.md rule 3) ────────────────
 *
 *   - Presentation only. No value here re-enters a calculation.
 *   - Millimetres to 3 decimals, inches to 4. Both are one digit finer than any
 *     drill tolerance, so the printed figure never rounds two adjacent sizes
 *     into the same string — which on a chart would be indistinguishable from a
 *     duplicate row.
 *   - Half-even, via `roundHalfEven`, matching every other module on the site.
 *   - Fixed width, not trimmed: a column of 0.500 / 0.550 / 0.600 aligns on the
 *     decimal point when printed and a column of 0.5 / 0.55 / 0.6 does not.
 *
 * Sources are the SERIES DEFINITIONS cited in `drill-series.ts` — ISO 235 /
 * DIN 338 for the metric index, ASME B94.11M for the fractional inch series.
 * The inch itself is exactly 25.4 mm by international agreement (1959), which
 * is why every fractional row's millimetre figure is exact rather than measured.
 */

import { FRACTIONAL_DRILLS, METRIC_DRILLS, type SeriesName } from './drill-series';
import { roundHalfEven, nmToInch, nmToMm, type Drill } from './tap-drill';

/** Decimals shown per unit. See the rounding note above. */
export const MM_DECIMALS = 3;
export const INCH_DECIMALS = 4;

export interface ChartRow {
  /** How the drill is marked: "6.8 mm" or "17/64"". */
  readonly label: string;
  readonly series: Drill['series'];
  /** Diameter in millimetres, fixed to MM_DECIMALS. */
  readonly mm: string;
  /** The same diameter in inches, fixed to INCH_DECIMALS. */
  readonly inch: string;
  /** Sort key, and the value the two strings are rendered from. */
  readonly nm: number;
}

function toRow(drill: Drill): ChartRow {
  return {
    label: drill.label,
    series: drill.series,
    mm: roundHalfEven(nmToMm(drill.nm), MM_DECIMALS).toFixed(MM_DECIMALS),
    inch: roundHalfEven(nmToInch(drill.nm), INCH_DECIMALS).toFixed(INCH_DECIMALS),
    nm: drill.nm,
  };
}

/**
 * The rows for one catalogue, ascending by diameter.
 *
 * `both` interleaves them by size, which is what a chart on a wall is FOR: the
 * question it answers is "what do I have near 6.75 mm", and the answer spans
 * both racks. The series column says which drawer to open.
 */
export function chartRows(series: SeriesName): readonly ChartRow[] {
  const chosen =
    series === 'metric'
      ? METRIC_DRILLS
      : series === 'fractional'
        ? FRACTIONAL_DRILLS
        : [...METRIC_DRILLS, ...FRACTIONAL_DRILLS];
  return chosen.map(toRow).sort((a, b) => a.nm - b.nm);
}

/** CSV header, kept next to the writer so the two cannot drift apart. */
export const CHART_CSV_HEADER = ['drill', 'series', 'diameter_mm', 'diameter_in'];

/**
 * The whole chart as CSV, both catalogues, ascending.
 *
 * Generated at build time and served as a static file, so the page needs no
 * JavaScript to offer it. A wall chart that costs a hydration bundle to
 * download a table it already printed would be a poor trade.
 */
export function chartCsv(): string {
  const rows = chartRows('both').map((r) => [r.label, r.series, r.mm, r.inch]);
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
