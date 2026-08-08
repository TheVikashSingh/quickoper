/**
 * Debt payoff calculator — avalanche vs snowball.
 *
 * The island. All arithmetic lives in lib/calc/debt-payoff.ts; this file only
 * collects inputs and renders results.
 *
 * PRIVACY (CLAUDE.md): every figure is computed in this browser. Nothing is
 * transmitted, and nothing is written to storage. Debt NAMES are never encoded
 * into the shareable URL — see lib/params.ts for why.
 *
 * WHY THE PROSE ARRIVES AS SLOTS (Prose props below):
 * Every string literal in this file's JSX is in the client bundle, because the
 * component has to be able to re-render it. Sentences that never change are
 * therefore paid for twice: once as HTML in the document, once as JavaScript
 * that could reproduce that HTML but never will. Passing them from the .astro
 * page keeps them in the document only.
 *
 * They are also inert once there. @astrojs/preact wraps slot content in its
 * StaticHtml component, which sets `shouldComponentUpdate = () => false`, so
 * this prose is not re-rendered on every keystroke the way it used to be.
 *
 * SLOT NAMES MUST BE SINGLE WORDS. The server pass camel-cases them
 * (`slotName()` in @astrojs/preact/dist/server.js turns `how-it-works` into
 * `howItWorks`) but the client hydration pass in client.js assigns
 * `props[key]` from the raw template name. A hyphenated slot therefore renders
 * at build time and hydrates to `undefined`, blanking the prose the moment the
 * island wakes up. Checked against the installed package, not from memory.
 */

import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import type { JSX } from 'preact';

import {
  DebtPayoffError,
  compareStrategies,
  type Debt,
  type PayoffResult,
} from '../../lib/calc/debt-payoff';
import { format, fromMajor, toMajor, type Minor } from '../../lib/calc/money';
import { downloadCsv, toCsv, type CsvColumn } from '../../lib/csv';
import {
  MAX_DEBTS,
  encodeDebts,
  encodeParams,
  parseDebts,
  parseEnum,
  parseNumber,
  type DebtParam,
} from '../../lib/params';
import { useUrlState } from '../../lib/url-state';
import { LineChart } from '../chart/LineChart';
import { ScheduleTable, type Column } from '../ui/ScheduleTable';

type View = 'avalanche' | 'snowball';
const VIEWS: readonly View[] = ['avalanche', 'snowball'];

interface Entry extends DebtParam {
  readonly id: string;
  readonly name: string;
}

interface State {
  readonly entries: readonly Entry[];
  readonly budget: number;
  readonly view: View;
}

const CURRENCY = 'USD';

const STARTER: readonly Entry[] = [
  { id: 'd1', name: 'Store card', balance: 900, rate: 29.99, minimum: 30 },
  { id: 'd2', name: 'Credit card', balance: 6000, rate: 22.99, minimum: 150 },
  { id: 'd3', name: 'Personal loan', balance: 2500, rate: 6.99, minimum: 120 },
];

const INITIAL: State = { entries: STARTER, budget: 600, view: 'avalanche' };

const BUDGET_SPEC = { min: 1, max: 1_000_000, fallback: 600 };

function decode(search: string): State {
  const params = new URLSearchParams(search);
  const debts = parseDebts(params.get('d'));
  const budget = parseNumber(params.get('b'), BUDGET_SPEC);
  const view = parseEnum(params.get('v'), VIEWS, 'avalanche');

  if (debts === null || budget === null) return INITIAL;

  return {
    // Names are not in the URL by design, so a restored scenario is anonymous.
    entries: debts.map((d, i) => ({ ...d, id: `d${i + 1}`, name: `Debt ${i + 1}` })),
    budget,
    view,
  };
}

function encode(state: State): string {
  return `d=${encodeDebts(state.entries)}&${encodeParams({ b: state.budget })}&v=${state.view}`;
}

function toDebt(entry: Entry): Debt {
  return {
    id: entry.id,
    name: entry.name,
    balance: fromMajor(entry.balance),
    annualRate: entry.rate / 100,
    minimumPayment: fromMajor(entry.minimum),
  };
}

/**
 * Static prose, rendered by the page and handed in as named slots.
 *
 * OPTIONAL BECAUSE THE TYPE SYSTEM CANNOT SEE SLOTS, NOT BECAUSE THEY ARE.
 * Every member here is mandatory in practice — a missing one silently blanks a
 * disclosure CLAUDE.md rule 8 requires. But `astro check` types a framework
 * component's children as `children`, not as named props, so declaring these
 * required fails typecheck on a page that passes all six correctly.
 *
 * The hole that leaves is closed where it is actually observable, in the built
 * HTML: scripts/check-slots.mjs asserts every name below reaches the page.
 */
export interface Prose {
  /** "Everything is worked out in your browser…" */
  readonly privacy?: JSX.Element;
  /** What avalanche and snowball target. */
  readonly strategies?: JSX.Element;
  /** The per-month formula and where the surplus goes. */
  readonly method?: JSX.Element;
  /** Monthly rounding, and why a statement will differ. */
  readonly rounding?: JSX.Element;
  /** Where the name on the report does and does not go. */
  readonly retention?: JSX.Element;
  /** Shown when the payment never clears the balance. */
  readonly stalled?: JSX.Element;
}

export function DebtPayoffCalculator(prose: Prose): JSX.Element {
  const [state, setState] = useUrlState<State>({ decode, encode, initial: INITIAL });
  const [nextId, setNextId] = useState(STARTER.length + 1);

  // Never in the URL and never persisted, for the same reason lender names are
  // not: a name in a shared link identifies whoever shared it.
  const [preparedFor, setPreparedFor] = useState('');

  // Captured at print time rather than on every keystroke: the URL is written
  // debounced, so reading it here guarantees the printed link matches the
  // figures on the page.
  const [printedAt, setPrintedAt] = useState<{ url: string; date: string } | null>(null);
  useEffect(() => {
    const capture = () => {
      setPrintedAt({
        url: window.location.href,
        date: new Date().toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
      });
      // The print stylesheet also un-hides disclosure content, but browsers
      // implement that UA override inconsistently — Chrome has moved the
      // mechanism more than once. Setting `open` is unambiguous, and a
      // half-empty PDF missing the workings would be worse than useless.
      for (const details of document.querySelectorAll('details')) details.open = true;
    };
    window.addEventListener('beforeprint', capture);
    return () => window.removeEventListener('beforeprint', capture);
  }, []);

  const patch = useCallback(
    (changes: Partial<State>) => setState({ ...state, ...changes }),
    [state, setState],
  );

  const minimumsTotal = state.entries.reduce((sum, e) => sum + e.minimum, 0);

  const outcome = useMemo(() => {
    try {
      return {
        comparison: compareStrategies(state.entries.map(toDebt), fromMajor(state.budget)),
        error: null as string | null,
      };
    } catch (error) {
      return {
        comparison: null,
        error:
          error instanceof DebtPayoffError ? error.message : 'Check the figures above.',
      };
    }
  }, [state.entries, state.budget]);

  const updateEntry = (id: string, changes: Partial<Entry>) =>
    patch({
      entries: state.entries.map((e) => (e.id === id ? { ...e, ...changes } : e)),
    });

  return (
    <div class="space-y-8">
      {/* Paper-only masthead. Whoever receives this PDF gets the date it was
          produced and a link that reopens the exact scenario. */}
      <div class="print-only avoid-break">
        <div style="border-bottom:2px solid #000;padding-bottom:6pt;margin-bottom:10pt">
          <strong style="font-size:13pt">QuickOper — debt payoff schedule</strong>
          <div style="font-size:8pt;margin-top:3pt">
            {preparedFor.trim() !== '' && <>For {preparedFor.trim()} · </>}
            {printedAt?.date ?? ''} · worked out in the browser
          </div>
          {printedAt !== null && (
            <div style="font-size:7.5pt;word-break:break-all;margin-top:2pt">
              Reopen and change these figures: {printedAt.url}
            </div>
          )}
        </div>

        <h2 style="font-size:11pt;margin:0 0 4pt">The debts in this scenario</h2>
        <table>
          <thead>
            <tr>
              <th style="text-align:left">Debt</th>
              <th style="text-align:right">Balance</th>
              <th style="text-align:right">Rate</th>
              <th style="text-align:right">Minimum</th>
            </tr>
          </thead>
          <tbody>
            {state.entries.map((e) => (
              <tr key={e.id}>
                <td style="text-align:left">{e.name}</td>
                <td style="text-align:right">{format(fromMajor(e.balance), CURRENCY)}</td>
                <td style="text-align:right">{e.rate.toFixed(2)}%</td>
                <td style="text-align:right">{format(fromMajor(e.minimum), CURRENCY)}</td>
              </tr>
            ))}
            <tr>
              <td style="text-align:left">
                <strong>Paying each month</strong>
              </td>
              <td colSpan={3} style="text-align:right">
                <strong>{format(fromMajor(state.budget), CURRENCY)}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <section aria-labelledby="debts-heading" class="no-print">
        <h2 id="debts-heading" class="section-head">
          Your debts
        </h2>
        <p class="text-ink-soft mt-1 text-sm">{prose.privacy}</p>

        <div class="mt-4 space-y-3">
          {state.entries.map((entry, index) => (
            <fieldset
              key={entry.id}
              class="rounded-panel border-line bg-surface grid grid-cols-2 gap-3 border p-3 sm:grid-cols-9"
            >
              <legend class="sr-only">Debt {index + 1}</legend>

              <Field
                label="Name"
                span="sm:col-span-3"
                id={`${entry.id}-name`}
                type="text"
                value={entry.name}
                onChange={(v) => updateEntry(entry.id, { name: v })}
              />
              <Field
                label="Balance"
                span="sm:col-span-2"
                id={`${entry.id}-bal`}
                value={entry.balance}
                min={0}
                onChange={(v) => updateEntry(entry.id, { balance: Number(v) || 0 })}
              />
              <Field
                label="Rate %"
                span="sm:col-span-2"
                id={`${entry.id}-rate`}
                value={entry.rate}
                min={0}
                max={200}
                step={0.01}
                onChange={(v) => updateEntry(entry.id, { rate: Number(v) || 0 })}
              />
              <Field
                label="Minimum"
                span="sm:col-span-1"
                id={`${entry.id}-min`}
                value={entry.minimum}
                min={0}
                onChange={(v) => updateEntry(entry.id, { minimum: Number(v) || 0 })}
              />

              <div class="flex items-end sm:col-span-1">
                <button
                  type="button"
                  disabled={state.entries.length <= 1}
                  onClick={() =>
                    patch({ entries: state.entries.filter((e) => e.id !== entry.id) })
                  }
                  class="rounded-control border-line-strong bg-sunken hover:border-negative hover:text-negative w-full border px-2 py-2 text-sm disabled:opacity-40"
                  aria-label={`Remove ${entry.name}`}
                >
                  Remove
                </button>
              </div>
            </fieldset>
          ))}
        </div>

        <button
          type="button"
          disabled={state.entries.length >= MAX_DEBTS}
          onClick={() => {
            patch({
              entries: [
                ...state.entries,
                {
                  id: `d${nextId}`,
                  name: `Debt ${nextId}`,
                  balance: 1000,
                  rate: 19.99,
                  minimum: 25,
                },
              ],
            });
            setNextId(nextId + 1);
          }}
          class="rounded-control border-line-strong bg-sunken hover:bg-brand-soft hover:border-brand mt-3 border px-3 py-1.5 text-sm font-medium disabled:opacity-40"
        >
          Add a debt
        </button>

        {/* No way back to a blank slate existed: Remove worked per row, and
            the last row could not be removed at all. */}
        <button
          type="button"
          onClick={() => {
            patch({ entries: STARTER, budget: INITIAL.budget, view: INITIAL.view });
            setNextId(STARTER.length + 1);
          }}
          class="rounded-control border-line-strong bg-sunken hover:bg-brand-soft hover:border-brand mt-3 ml-2 border px-3 py-1.5 text-sm font-medium"
        >
          Reset to example
        </button>
      </section>

      <section aria-labelledby="budget-heading" class="no-print">
        <h2 id="budget-heading" class="section-head">
          What you can pay each month
        </h2>
        <label for="budget" class="mt-2 block text-sm font-medium">
          Total monthly payment
        </label>
        <p id="budget-hint" class="text-ink-mute mt-0.5 text-xs">
          Your minimum payments come to {format(fromMajor(minimumsTotal), CURRENCY)} a
          month.
        </p>
        <input
          id="budget"
          type="number"
          inputmode="decimal"
          min={0}
          step={10}
          value={state.budget}
          aria-describedby="budget-hint"
          onInput={(e) =>
            patch({ budget: Number((e.target as HTMLInputElement).value) || 0 })
          }
          class="numeric rounded-control border-line-strong bg-surface mt-2 w-40 border px-3 py-2 text-right"
        />
      </section>

      {outcome.error !== null ? (
        <p
          role="alert"
          class="rounded-panel border-negative/40 bg-negative/5 text-negative border p-4 text-sm"
        >
          {outcome.error}
        </p>
      ) : (
        outcome.comparison !== null && (
          <Results
            comparison={outcome.comparison}
            debtCount={state.entries.length}
            view={state.view}
            onView={(v) => patch({ view: v })}
            name={preparedFor}
            onName={setPreparedFor}
            prose={prose}
          />
        )
      )}
    </div>
  );
}

// ── Results ──────────────────────────────────────────────────────────────────

interface ResultsProps {
  comparison: ReturnType<typeof compareStrategies>;
  /** One debt has only one possible order, so the strategy toggle is inert. */
  debtCount: number;
  view: View;
  onView: (view: View) => void;
  name: string;
  onName: (value: string) => void;
  prose: Prose;
}

interface Row {
  month: number;
  paid: Minor;
  interest: Minor;
  remaining: Minor;
}

function Results({
  comparison,
  debtCount,
  view,
  onView,
  name,
  onName,
  prose,
}: ResultsProps): JSX.Element {
  const shown: PayoffResult = comparison[view];

  const rows: Row[] = shown.schedule.map((m) => ({
    month: m.month,
    paid: m.totalPaid,
    interest: m.totalInterest,
    remaining: m.totalRemaining,
  }));

  const columns: Column<Row>[] = [
    { key: 'm', header: 'Month', value: (r) => String(r.month) },
    { key: 'p', header: 'Paid', value: (r) => format(r.paid, CURRENCY) },
    { key: 'i', header: 'Interest', value: (r) => format(r.interest, CURRENCY) },
    { key: 'r', header: 'Remaining', value: (r) => format(r.remaining, CURRENCY) },
  ];

  const csvColumns: CsvColumn<Row>[] = [
    { header: 'Month', value: (r) => r.month },
    { header: 'Paid', value: (r) => toMajor(r.paid) },
    { header: 'Interest', value: (r) => toMajor(r.interest) },
    { header: 'Remaining', value: (r) => toMajor(r.remaining) },
  ];

  const opening = comparison.avalanche.schedule[0]?.rows.reduce(
    (sum, r) => sum + r.openingBalance,
    0,
  );
  const series = (result: PayoffResult) => [
    opening ?? 0,
    ...result.schedule.map((m) => m.totalRemaining),
  ];

  const firstMonth = shown.schedule[0];

  return (
    <section aria-labelledby="results-heading" class="space-y-6">
      <h2 id="results-heading" class="section-head">
        What happens
      </h2>

      {shown.neverPaysOff ? (
        <p
          role="alert"
          class="rounded-panel border-caution/40 bg-caution/5 border p-4 text-sm"
        >
          {prose.stalled}
        </p>
      ) : (
        <div class="grid gap-3 sm:grid-cols-3">
          <Stat
            label="Debt-free in"
            value={`${shown.months} months`}
            note={`${Math.floor(shown.months / 12)}y ${shown.months % 12}m`}
          />
          <Stat
            label="Interest paid"
            value={format(shown.totalInterest, CURRENCY)}
            note={`total repaid ${format(shown.totalPaid, CURRENCY)}`}
          />
          <Stat
            label="Saved vs minimums"
            value={format(comparison.interestSavedVsMinimums, CURRENCY)}
            note={`and ${comparison.monthsSavedVsMinimums} months sooner`}
          />
        </div>
      )}

      <div>
        <div
          role="group"
          aria-label="Payoff strategy"
          class="rounded-control border-line-strong bg-sunken inline-flex border"
        >
          {VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              disabled={debtCount < 2}
              title={
                debtCount < 2
                  ? 'With a single debt both methods clear it in the same order'
                  : undefined
              }
              onClick={() => onView(v)}
              class={`first:rounded-l-control last:rounded-r-control px-3 py-1.5 text-sm font-medium capitalize disabled:cursor-not-allowed disabled:opacity-45 ${
                view === v ? 'bg-brand text-canvas' : 'hover:bg-sunken'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        {debtCount < 2 && (
          <p class="text-ink-mute mt-2 text-sm">
            Add a second debt to compare the two methods — with one, there is only one
            order to pay it in.
          </p>
        )}

        <p class="text-ink-soft mt-2 text-sm">
          {prose.strategies}{' '}
          {comparison.interestDifferenceBetweenStrategies === 0 ? (
            <>
              On these figures they cost exactly the same — your smallest balance is also
              your highest rate, so both methods clear your debts in the same order.
            </>
          ) : (
            <>
              On these figures avalanche costs{' '}
              <strong class="text-ink">
                {format(comparison.interestDifferenceBetweenStrategies, CURRENCY)}
              </strong>{' '}
              less interest than snowball.
            </>
          )}{' '}
          Either way you save{' '}
          <strong class="text-ink">
            {format(comparison.interestSavedVsMinimums, CURRENCY)}
          </strong>{' '}
          against paying only the minimums.
        </p>
      </div>

      <LineChart
        ariaLabel="Total remaining balance by month, comparing avalanche, snowball and minimum payments"
        height={240}
        formatY={(v) => `$${Math.round(v / 100).toLocaleString()}`}
        formatX={(i) => `${i}m`}
        series={[
          { id: 'a', label: 'Avalanche', points: series(comparison.avalanche) },
          { id: 's', label: 'Snowball', points: series(comparison.snowball) },
          { id: 'm', label: 'Minimums only', points: series(comparison.minimumsOnly) },
        ]}
      />

      {firstMonth !== undefined && (
        <details class="rounded-panel border-line bg-sunken border p-4">
          <summary class="cursor-pointer text-sm font-semibold">
            How this was calculated
          </summary>

          <div class="text-ink-soft mt-3 space-y-3 text-sm">
            {/* A real element on this side of the boundary. <astro-slot> is
                `display: contents`, so a margin applied to it by space-y-3 is
                applied to a box that generates no layout — this div is what
                actually takes the gap. The slot content brings its own internal
                spacing; see the page. */}
            <div>{prose.method}</div>

            <p class="text-ink font-medium">Month 1, in full:</p>
            <div class="overflow-x-auto">
              <table class="w-full border-collapse text-xs">
                <thead>
                  <tr class="text-left">
                    <th class="border-line border-b py-1 pr-3">Debt</th>
                    <th class="border-line border-b py-1 pr-3 text-right">Opening</th>
                    <th class="border-line border-b py-1 pr-3 text-right">Interest</th>
                    <th class="border-line border-b py-1 pr-3 text-right">Payment</th>
                    <th class="border-line border-b py-1 text-right">Closing</th>
                  </tr>
                </thead>
                <tbody>
                  {firstMonth.rows.map((r) => (
                    <tr key={r.debtId}>
                      <td class="border-line border-b py-1 pr-3">{r.debtId}</td>
                      <td class="numeric border-line border-b py-1 pr-3 text-right">
                        {format(r.openingBalance, CURRENCY)}
                      </td>
                      <td class="numeric border-line border-b py-1 pr-3 text-right">
                        {format(r.interest, CURRENCY)}
                      </td>
                      <td class="numeric border-line border-b py-1 pr-3 text-right">
                        {format(r.payment, CURRENCY)}
                      </td>
                      <td class="numeric border-line border-b py-1 text-right">
                        {format(r.closingBalance, CURRENCY)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p>{prose.rounding}</p>
          </div>
        </details>
      )}

      <div class="no-print">
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              downloadCsv(`quickoper-${view}-schedule.csv`, toCsv(rows, csvColumns))
            }
            class="rounded-control border-brand bg-brand hover:bg-brand-hover text-canvas border px-3 py-1.5 text-sm font-medium"
          >
            Download spreadsheet (CSV)
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            class="rounded-control border-line-strong bg-sunken hover:bg-brand-soft hover:border-brand border px-3 py-1.5 text-sm font-medium"
          >
            Save as PDF or print
          </button>
        </div>
        <label for="prepared-for" class="text-ink-mute mt-3 block text-xs font-medium">
          Name on the report (optional)
        </label>
        <input
          id="prepared-for"
          type="text"
          value={name}
          maxLength={60}
          onInput={(e) => onName((e.target as HTMLInputElement).value)}
          class="border-line-strong bg-surface rounded-control mt-1 w-56 border px-2 py-1.5 text-sm"
        />
        <p class="text-ink-mute mt-1 text-xs">{prose.retention}</p>
      </div>

      <ScheduleTable
        rows={rows}
        columns={columns}
        caption={`Month-by-month payoff schedule using the ${view} strategy`}
        rowKey={(r) => String(r.month)}
      />
    </section>
  );
}

// ── Small pieces ─────────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}): JSX.Element {
  return (
    <div class="rounded-panel border-line bg-surface border p-3">
      <div class="text-ink-mute text-xs font-medium tracking-wide uppercase">{label}</div>
      <div class="numeric mt-1 text-xl font-semibold">{value}</div>
      <div class="text-ink-soft mt-0.5 text-xs">{note}</div>
    </div>
  );
}

interface FieldProps {
  label: string;
  id: string;
  value: string | number;
  onChange: (value: string) => void;
  span?: string;
  type?: 'text' | 'number';
  min?: number;
  max?: number;
  step?: number;
}

function Field({
  label,
  id,
  value,
  onChange,
  span = '',
  type = 'number',
  min,
  max,
  step,
}: FieldProps): JSX.Element {
  return (
    <div class={span}>
      <label for={id} class="text-ink-mute block text-xs font-medium">
        {label}
      </label>
      <input
        id={id}
        type={type}
        inputmode={type === 'number' ? 'decimal' : undefined}
        min={min}
        max={max}
        step={step}
        value={value}
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
        class={`rounded-control border-line-strong bg-surface mt-1 w-full border px-2 py-1.5 text-sm ${
          type === 'number' ? 'numeric text-right' : ''
        }`}
      />
    </div>
  );
}
