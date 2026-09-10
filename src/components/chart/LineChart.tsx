/**
 * Hand-rolled reactive SVG line chart (CLAUDE.md rule 5).
 *
 * A Preact component, not `.astro` — it must redraw when calculator inputs
 * change, and an `.astro` component renders once at build time.
 *
 * No charting library. Recharts, Chart.js and D3 all cost more gzipped than the
 * entire per-page budget, to draw two lines.
 *
 * DIVISION OF LABOUR: this chart shows SHAPE. Exact figures live in the
 * schedule table beside it, which is searchable, printable and exportable.
 * That is why there is no hover tooltip — it would add bytes and interaction
 * surface to duplicate information that is already on the page in a better form.
 */

import type { JSX } from 'preact';

export interface Series {
  readonly id: string;
  /** Rendered as text by Preact. Safe for user-supplied names. */
  readonly label: string;
  /** One value per period, index 0 = period 0. */
  readonly points: readonly number[];
  /** Any CSS colour. Defaults cycle through the token palette. */
  readonly colour?: string;
}

export interface LineChartProps {
  readonly series: readonly Series[];
  /** Required. A chart with no accessible name is unusable to a screen reader. */
  readonly ariaLabel: string;
  readonly formatY?: (value: number) => string;
  readonly formatX?: (index: number) => string;
  readonly yTicks?: number;
  readonly xTicks?: number;
  readonly height?: number;
}

/**
 * Series styling — colour AND dash, never colour alone.
 *
 * WHAT WAS WRONG: the palette opened with `--color-brand` and
 * `--color-positive`, which are oklch hue 158 and 155 at 42% and 45% lightness.
 * Those are the same green. On every chart the first two series were
 * indistinguishable — avalanche from snowball, contractual from overpaid — and
 * the operator spotted it before any check did.
 *
 * WHY DASHES AND NOT JUST BETTER HUES. Three reasons, and each one alone is
 * enough:
 *
 *   1. WCAG 1.4.1 — colour must not be the only means of conveying
 *      information. Roughly one man in twelve has a colour vision deficiency,
 *      and deuteranopia is exactly the kind that merges green with amber.
 *   2. This site's headline feature is a printable PDF. Greyscale printing
 *      collapses hue entirely; two lines of similar lightness become one.
 *      A dash pattern survives a monochrome laser printer.
 *   3. Overlapping lines. Where two series cross or run together — which is
 *      most of a payoff chart — a dash lets the eye separate them even when
 *      the colours are perfectly distinct.
 *
 * Hues are now spread across the wheel (158 green → 75 amber → neutral ink →
 * 25 red) rather than clustered, and the legend swatch repeats the dash so it
 * matches the line it labels.
 */
interface SeriesStyle {
  readonly colour: string;
  /** SVG stroke-dasharray. Empty string is a solid line. */
  readonly dash: string;
}

const DEFAULT_STYLES: readonly SeriesStyle[] = [
  { colour: 'var(--color-brand)', dash: '' },
  { colour: 'var(--color-caution)', dash: '7 4' },
  { colour: 'var(--color-ink-soft)', dash: '2 3' },
  { colour: 'var(--color-negative)', dash: '10 3 2 3' },
];

const styleFor = (index: number, override?: string): SeriesStyle => {
  const base = DEFAULT_STYLES[index % DEFAULT_STYLES.length] as SeriesStyle;
  return override === undefined ? base : { colour: override, dash: base.dash };
};

// A fixed viewBox with preserveAspectRatio="none" would distort strokes, so the
// chart draws into a fixed coordinate space and scales as a whole.
const VIEW_W = 720;
const PAD = { top: 12, right: 12, bottom: 28, left: 64 } as const;

/** Round a range up to a readable tick interval (1, 2, 2.5 or 5 × 10ⁿ). */
function niceStep(range: number, ticks: number): number {
  if (range <= 0) return 1;
  const rough = range / Math.max(ticks, 1);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalised = rough / magnitude;
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 2.5 ? 2.5 : 5;
  return step * magnitude;
}

export function LineChart({
  series,
  ariaLabel,
  formatY = (v) => String(Math.round(v)),
  formatX = (i) => String(i),
  yTicks = 4,
  xTicks = 6,
  height = 260,
}: LineChartProps): JSX.Element | null {
  const withData = series.filter((s) => s.points.length > 0);
  if (withData.length === 0) return null;

  const lastIndex = Math.max(...withData.map((s) => s.points.length - 1), 1);
  const rawMax = Math.max(...withData.flatMap((s) => s.points), 0);
  const step = niceStep(rawMax, yTicks);
  const yMax = Math.max(Math.ceil(rawMax / step) * step, step);

  const plotW = VIEW_W - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;

  const x = (index: number): number => PAD.left + (index / lastIndex) * plotW;
  const y = (value: number): number => PAD.top + plotH - (value / yMax) * plotH;

  const path = (points: readonly number[]): string =>
    points
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
      .join(' ');

  const yTickValues = Array.from(
    { length: Math.round(yMax / step) + 1 },
    (_, i) => i * step,
  );
  const xTickStride = Math.max(1, Math.ceil(lastIndex / Math.max(xTicks - 1, 1)));
  const xTickValues = Array.from(
    { length: Math.floor(lastIndex / xTickStride) + 1 },
    (_, i) => i * xTickStride,
  );

  /*
    The shape of the answer, not the identity of every point.

    PER-SERIES LENGTH AND A MIDPOINT, AND THE FIRST VERSION OF THIS WAS WRONG.
    It keyed on lastIndex, yMax and each series' FINAL value, all three of which
    are constant on the tool this was written for: a payoff curve always ends at
    zero, yMax follows the opening balance, and lastIndex follows the LONGEST
    series — so overpaying more shortened the overpaid curve and moved none of
    them. The chart drew once on load and never again, while the figures beside
    it changed. Every gate passed; it was caught by driving the input.

    Length catches a schedule that finishes sooner. The midpoint catches a curve
    that changes shape without changing length — a different rate, or a coast
    projection whose horizon is fixed by age. Together they move whenever the
    answer does, and stay still when a keystroke rounds to the same schedule.
  */
  const drawKey = `${yMax}:${withData
    .map((s) => `${s.points.length}/${s.points[s.points.length >> 1] ?? 0}`)
    .join()}`;

  return (
    <figure class="m-0">
      <svg
        viewBox={`0 0 ${VIEW_W} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label={ariaLabel}
        class="overflow-visible"
      >
        <title>{ariaLabel}</title>

        {/* Horizontal gridlines and y-axis labels */}
        {yTickValues.map((value) => (
          <g key={`y${value}`}>
            <line
              x1={PAD.left}
              x2={VIEW_W - PAD.right}
              y1={y(value)}
              y2={y(value)}
              stroke="var(--color-line)"
              stroke-width="1"
            />
            <text
              x={PAD.left - 8}
              y={y(value)}
              text-anchor="end"
              dominant-baseline="middle"
              fill="var(--color-ink-mute)"
              font-size="11"
              font-variant-numeric="tabular-nums"
            >
              {formatY(value)}
            </text>
          </g>
        ))}

        {/* X-axis labels */}
        {xTickValues.map((index) => (
          <text
            key={`x${index}`}
            x={x(index)}
            y={height - 8}
            text-anchor="middle"
            fill="var(--color-ink-mute)"
            font-size="11"
            font-variant-numeric="tabular-nums"
          >
            {formatX(index)}
          </text>
        ))}

        {/*
          THE LINE DRAWS ITSELF, AND IT IS A CLIP WIPE RATHER THAN A DASH OFFSET.

          The obvious technique is stroke-dasharray/stroke-dashoffset keyframes,
          and it is the one visual-system.md proposes. It cannot be used here:
          D42 made the dash pattern a SECOND CHANNEL alongside colour, because
          WCAG 1.4.1 forbids colour as the sole carrier of information and
          deuteranopia is exactly the case two greens defeat. Animating
          stroke-dasharray would overwrite that pattern for the duration of the
          draw — the dashed series would render solid while it animated, which
          is the one moment a reader is watching it.

          A clip wipe reveals the stroke without touching how the stroke is
          drawn, so the dash channel survives. It also works identically for
          solid and dashed series, where a dash-offset animation would have
          needed two code paths.

          THE KEY IS WHAT RETRIGGERS IT. React reuses a DOM node across renders,
          so a CSS animation attached to it runs once and never again. Keying the
          group on the shape of the data means a new calculation produces a new
          node and the animation restarts. It is deliberately NOT keyed on every
          render — typing in an input that does not change the result should not
          replay the draw.

          It is a CSS clip-path on the group rather than an SVG <clipPath>
          element, which means no id has to be minted and kept unique across two
          charts on one page — that machinery cost 0.13 KB of the 19.5 and bought
          nothing the stylesheet could not do for free.

          Everything below is inert under prefers-reduced-motion: the keyframes
          live inside a no-preference query, so the group is never clipped and
          the chart simply appears.
        */}
        {/* Series */}
        <g key={drawKey} class="chart-draw">
          {withData.map((s, i) => {
            const style = styleFor(i, s.colour);
            return (
              <path
                key={s.id}
                d={path(s.points)}
                fill="none"
                stroke={style.colour}
                stroke-width="2"
                stroke-dasharray={style.dash === '' ? undefined : style.dash}
                stroke-linejoin="round"
                stroke-linecap="round"
              />
            );
          })}
        </g>
      </svg>

      {withData.length > 1 && (
        <figcaption class="text-ink-soft mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {withData.map((s, i) => {
            const style = styleFor(i, s.colour);
            return (
              <span key={s.id} class="inline-flex items-center gap-1.5">
                {/* The swatch repeats the DASH as well as the colour, drawn as a
                    tiny SVG rather than a coloured div. A solid block beside a
                    dashed line is a legend that disagrees with its own chart —
                    which is worse than no legend, because it is believed.
                    data-tight: the parent is a flex row with `gap-1.5`, so the
                    space between swatch and label is layout, not whitespace. */}
                <svg
                  aria-hidden="true"
                  data-tight
                  width="18"
                  height="8"
                  viewBox="0 0 18 8"
                  class="inline-block shrink-0"
                >
                  <line
                    x1="0"
                    y1="4"
                    x2="18"
                    y2="4"
                    stroke={style.colour}
                    stroke-width="2"
                    stroke-dasharray={style.dash === '' ? undefined : style.dash}
                    stroke-linecap="round"
                  />
                </svg>
                {s.label}
              </span>
            );
          })}
        </figcaption>
      )}
    </figure>
  );
}
