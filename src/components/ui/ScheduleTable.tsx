/**
 * The period-by-period schedule (CLAUDE.md rule 10).
 *
 * The schedule IS the product. A headline figure is something a chat window
 * hands over instantly; 360 rows of exact arithmetic is not.
 *
 * ─── On virtualisation ──────────────────────────────────────────────────────
 *
 * CLAUDE.md says "virtualised past a few hundred rows". This deliberately does
 * NOT virtualise, and the rule's wording should be read as its intent — do not
 * jank the page — rather than as a prescribed mechanism.
 *
 * Progressive disclosure serves that intent better here:
 *   - Ctrl+F finds a row. A virtualised table is unsearchable, which is a
 *     terrible property for a document people open specifically to inspect.
 *   - It prints. Virtualised rows are simply absent from the printout.
 *   - It costs no library and no scroll maths.
 *   - Six hundred table rows is a few thousand DOM nodes; browsers handle that
 *     without complaint. There is no performance problem here to solve.
 *
 * Collapsed by default, expandable, and the CSV export always contains
 * everything regardless of what is on screen.
 */

import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';

export interface Column<Row> {
  readonly key: string;
  readonly header: string;
  readonly value: (row: Row, index: number) => JSX.Element | string;
  /** Right-aligned with tabular figures. Default true — most columns are money. */
  readonly numeric?: boolean;
}

export interface ScheduleTableProps<Row> {
  readonly rows: readonly Row[];
  readonly columns: readonly Column<Row>[];
  /** Describes the table for screen readers and print. Required. */
  readonly caption: string;
  /** Rows shown before expanding. */
  readonly initialRows?: number;
  readonly rowKey?: (row: Row, index: number) => string;
}

export function ScheduleTable<Row>({
  rows,
  columns,
  caption,
  initialRows = 12,
  rowKey = (_row, index) => String(index),
}: ScheduleTableProps<Row>): JSX.Element {
  const [expanded, setExpanded] = useState(false);

  // A printed schedule must be complete. Collapsed rows are not in the DOM, so
  // CSS alone cannot recover them — the expansion has to happen before the
  // print snapshot is taken. `beforeprint` fires for Ctrl+P and for the
  // Save-as-PDF button alike.
  useEffect(() => {
    const expand = () => setExpanded(true);
    window.addEventListener('beforeprint', expand);
    return () => window.removeEventListener('beforeprint', expand);
  }, []);

  const truncated = rows.length > initialRows;
  const visible = expanded || !truncated ? rows : rows.slice(0, initialRows);
  const hiddenCount = rows.length - visible.length;

  return (
    <div>
      {/* Wide tables scroll inside their own container; the page never does. */}
      <div class="rounded-panel border-line overflow-x-auto border">
        <table class="w-full border-collapse text-sm">
          <caption class="sr-only">{caption}</caption>
          <thead>
            <tr class="bg-sunken">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  class={`border-line border-b px-3 py-2 font-semibold whitespace-nowrap ${
                    column.numeric === false ? 'text-left' : 'text-right'
                  }`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, index) => (
              <tr key={rowKey(row, index)} class="even:bg-sunken/40">
                {columns.map((column) => (
                  <td
                    key={column.key}
                    class={`border-line border-b px-3 py-1.5 whitespace-nowrap ${
                      column.numeric === false ? 'text-left' : 'numeric text-right'
                    }`}
                  >
                    {column.value(row, index)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {truncated && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          class="rounded-control border-line text-brand hover:bg-sunken mt-2 border px-3 py-1.5 text-sm font-medium"
        >
          {expanded
            ? `Show first ${initialRows} rows`
            : `Show all ${rows.length} rows (${hiddenCount} more)`}
        </button>
      )}
    </div>
  );
}
