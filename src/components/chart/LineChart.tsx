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

const DEFAULT_COLOURS = [
  'var(--color-brand)',
  'var(--color-positive)',
  'var(--color-caution)',
  'var(--color-negative)',
];

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

        {/* Series */}
        {withData.map((s, i) => (
          <path
            key={s.id}
            d={path(s.points)}
            fill="none"
            stroke={s.colour ?? DEFAULT_COLOURS[i % DEFAULT_COLOURS.length]}
            stroke-width="2"
            stroke-linejoin="round"
            stroke-linecap="round"
          />
        ))}
      </svg>

      {withData.length > 1 && (
        <figcaption class="text-ink-soft mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {withData.map((s, i) => (
            <span key={s.id} class="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                class="inline-block h-0.5 w-4 rounded"
                style={{
                  background: s.colour ?? DEFAULT_COLOURS[i % DEFAULT_COLOURS.length],
                }}
              />
              {s.label}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}
