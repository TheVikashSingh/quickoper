/**
 * Mortgage overpayment calculator — the island.
 *
 * All arithmetic lives in lib/calc/mortgage.ts. This file collects inputs and
 * renders results; it never computes (CLAUDE.md rule 1).
 *
 * PRIVACY: every figure is worked out in this browser. Nothing is transmitted
 * and nothing is written to storage. The shareable link carries the four
 * figures so a scenario can be reopened — no name, no identifier.
 *
 * Static prose arrives from the .astro page as named slots (D28). Slot names
 * must be single words: the @astrojs/preact server pass camel-cases them and
 * the client pass does not, so a hyphenated slot hydrates to undefined.
 */

import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import type { JSX } from 'preact';

import {
  MortgageError,
  balanceSeries,
  compareOverpayment,
} from '../../lib/calc/mortgage';
import { format, fromMajor, toMajor, type Minor } from '../../lib/calc/money';
import { downloadCsv, toCsv, type CsvColumn } from '../../lib/csv';
import { encodeParams, parseParams, type ParamSpec } from '../../lib/params';
import { useUrlState } from '../../lib/url-state';
import { LineChart } from '../chart/LineChart';
import { ScheduleTable, type Column } from '../ui/ScheduleTable';

const CURRENCY = 'USD';

/**
 * Short keys, range-checked, rendered as text only (rule 11). The defaults are
 * the scenario the fixtures are anchored to: $320,000 at 6.706% over 30 years,
 * which is calculator.net's own published example.
 */
const PARAMS = {
  p: { min: 1000, max: 10_000_000, fallback: 320_000 },
  r: { min: 0, max: 25, fallback: 6.706 },
  y: { min: 1, max: 40, fallback: 30 },
  o: { min: 0, max: 100_000, fallback: 200 },
} as const satisfies ParamSpec;

type State = { [K in keyof typeof PARAMS]: number };

interface Row {
  month: number;
  payment: Minor;
  interest: Minor;
  principal: Minor;
  balance: Minor;
}

export interface Prose {
  /** "Worked out in your browser…" */
  readonly privacy?: JSX.Element;
  /** What the arithmetic does, month by month. */
  readonly method?: JSX.Element;
  /** What the model does not include. */
  readonly assumptions?: JSX.Element;
  /** Where the name on the report does and does not go. */
  readonly retention?: JSX.Element;
}

export function MortgageCalculator(prose: Prose): JSX.Element {
  const [state, setState] = useUrlState<State>({
    decode: (search) => parseParams(PARAMS, search),
    encode: (value) => encodeParams(value),
    initial: parseParams(PARAMS, ''),
  });

  // Never in the URL and never persisted — a name in a shared link identifies
  // whoever shared it. It exists only to title the printed document (D22).
  const [preparedFor, setPreparedFor] = useState('');

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
      for (const d of document.querySelectorAll('details')) d.open = true;
    };
    window.addEventListener('beforeprint', capture);
    return () => window.removeEventListener('beforeprint', capture);
  }, []);

  const set = useCallback(
    (key: keyof State, value: number) => setState({ ...state, [key]: value }),
    [state, setState],
  );

  const outcome = useMemo(() => {
    try {
      return {
        result: compareOverpayment({
          principal: fromMajor(state.p),
          annualRate: state.r / 100,
          termMonths: Math.round(state.y) * 12,
          monthlyOverpayment: fromMajor(state.o),
        }),
        error: null as string | null,
      };
    } catch (error) {
      return {
        result: null,
        error:
          error instanceof MortgageError ? error.message : 'Check the figures above.',
      };
    }
  }, [state]);

  return (
    <div class="space-y-8">
      {printedAt !== null && (
        <div class="print-only avoid-break">
          <div style="border-bottom:2px solid #000;padding-bottom:6pt;margin-bottom:10pt">
            <strong style="font-size:13pt">QuickOper — mortgage overpayment</strong>
            <div style="font-size:8pt;margin-top:3pt">
              {preparedFor.trim() !== '' && <>For {preparedFor.trim()} · </>}
              {printedAt.date} · worked out in the browser
            </div>
            <div style="font-size:7.5pt;word-break:break-all;margin-top:2pt">
              Reopen and change these figures: {printedAt.url}
            </div>
          </div>
        </div>
      )}

      <section aria-labelledby="loan-heading" class="no-print">
        <h2 id="loan-heading" class="section-head">
          Your mortgage
        </h2>
        <p class="text-ink-soft mt-2 text-sm">{prose.privacy}</p>

        <div class="mt-4 grid gap-3 sm:grid-cols-3">
          <Field
            label="Amount borrowed"
            id="p"
            prefix="$"
            value={state.p}
            step={1000}
            onChange={(v) => set('p', v)}
          />
          <Field
            label="Interest rate"
            id="r"
            suffix="%"
            value={state.r}
            step={0.001}
            onChange={(v) => set('r', v)}
          />
          <Field
            label="Term"
            id="y"
            suffix="years"
            value={state.y}
            step={1}
            onChange={(v) => set('y', v)}
          />
        </div>
      </section>

      <section aria-labelledby="over-heading" class="no-print">
        <h2 id="over-heading" class="section-head">
          What you would pay extra
        </h2>
        <div class="mt-4 max-w-xs">
          <Field
            label="Extra each month"
            id="o"
            prefix="$"
            value={state.o}
            step={25}
            hint="on top of the required payment"
            onChange={(v) => set('o', v)}
          />
        </div>
      </section>

      {outcome.error !== null ? (
        <p
          role="alert"
          class="rounded-panel border-negative/40 bg-negative/5 text-negative border p-4 text-sm"
        >
          {outcome.error}
        </p>
      ) : (
        outcome.result !== null && (
          <Results
            comparison={outcome.result}
            overpayment={state.o}
            rate={state.r}
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
  comparison: ReturnType<typeof compareOverpayment>;
  overpayment: number;
  /** Shown in the worked example, so the reader can follow the arithmetic. */
  rate: number;
  name: string;
  onName: (value: string) => void;
  prose: Prose;
}

function Results({
  comparison,
  overpayment,
  rate,
  name,
  onName,
  prose,
}: ResultsProps): JSX.Element {
  const { baseline, overpaid, monthsSaved, interestSaved } = comparison;
  const shown = overpayment > 0 ? overpaid : baseline;
  const first = shown.schedule[0];

  const rows: Row[] = shown.schedule.map((m) => ({
    month: m.month,
    payment: m.payment,
    interest: m.interest,
    principal: m.principalPaid,
    balance: m.closingBalance,
  }));

  const columns: Column<Row>[] = [
    { key: 'm', header: 'Month', value: (r) => String(r.month) },
    { key: 'p', header: 'Payment', value: (r) => format(r.payment, CURRENCY) },
    { key: 'i', header: 'Interest', value: (r) => format(r.interest, CURRENCY) },
    { key: 'c', header: 'Principal', value: (r) => format(r.principal, CURRENCY) },
    { key: 'b', header: 'Balance', value: (r) => format(r.balance, CURRENCY) },
  ];

  const csvColumns: CsvColumn<Row>[] = [
    { header: 'Month', value: (r) => r.month },
    { header: 'Payment', value: (r) => toMajor(r.payment) },
    { header: 'Interest', value: (r) => toMajor(r.interest) },
    { header: 'Principal', value: (r) => toMajor(r.principal) },
    { header: 'Balance', value: (r) => toMajor(r.balance) },
  ];

  const years = Math.floor(shown.months / 12);
  const months = shown.months % 12;

  return (
    <section aria-labelledby="results-heading" class="space-y-6">
      <h2 id="results-heading" class="section-head">
        What happens
      </h2>

      <div class="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Required payment"
          value={format(baseline.contractualPayment, CURRENCY)}
          note="every month, by contract"
        />
        <Stat
          label={overpayment > 0 ? 'Paid off in' : 'Term'}
          value={`${years}y ${months}m`}
          note={`${shown.months} payments`}
        />
        <Stat
          label="Interest over the term"
          value={format(shown.totalInterest, CURRENCY)}
          note={`total repaid ${format(shown.totalPaid, CURRENCY)}`}
        />
      </div>

      {overpayment > 0 && (
        <div class="rounded-panel border-brand/40 bg-brand-soft border p-4">
          <p class="text-ink text-sm">
            Paying <strong>{format(fromMajor(overpayment), CURRENCY)}</strong> extra a
            month removes{' '}
            <strong class="numeric">
              {Math.floor(monthsSaved / 12)} years {monthsSaved % 12} months
            </strong>{' '}
            and <strong class="numeric">{format(interestSaved, CURRENCY)}</strong> of
            interest from this schedule.
          </p>
        </div>
      )}

      <LineChart
        ariaLabel="Balance remaining by month, with and without the overpayment"
        height={240}
        formatY={(v) => `$${Math.round(v / 100_000)}k`}
        formatX={(i) => `${Math.round(i / 12)}y`}
        series={[
          { id: 'b', label: 'Contractual', points: balanceSeries(baseline) },
          ...(overpayment > 0
            ? [{ id: 'o', label: 'With overpayment', points: balanceSeries(overpaid) }]
            : []),
        ]}
      />

      <details class="rounded-panel border-line bg-sunken border p-4">
        <summary class="cursor-pointer text-sm font-semibold">
          How this was calculated
        </summary>
        <div class="text-ink-soft mt-3 space-y-3 text-sm">
          <div>{prose.method}</div>

          <p class="text-ink font-medium">Month 1, in full:</p>
          {first !== undefined && (
            <p class="numeric bg-surface rounded-control p-3">
              interest = {format(first.openingBalance, CURRENCY)} × ({rate}% ÷ 12) ={' '}
              {format(first.interest, CURRENCY)}
              <br />
              principal = {format(first.payment, CURRENCY)} −{' '}
              {format(first.interest, CURRENCY)} = {format(first.principalPaid, CURRENCY)}
              <br />
              balance = {format(first.openingBalance, CURRENCY)} −{' '}
              {format(first.principalPaid, CURRENCY)} ={' '}
              {format(first.closingBalance, CURRENCY)}
            </p>
          )}

          <div>{prose.assumptions}</div>
        </div>
      </details>

      <div class="no-print">
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              downloadCsv('quickoper-mortgage-schedule.csv', toCsv(rows, csvColumns))
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
        caption={
          overpayment > 0
            ? 'Month-by-month schedule with the overpayment applied'
            : 'Month-by-month schedule on the contractual payment'
        }
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
      <div class="engraved text-ink-mute text-xs">{label}</div>
      <div class="numeric mt-1 text-xl font-semibold">{value}</div>
      <div class="text-ink-soft mt-0.5 text-xs">{note}</div>
    </div>
  );
}

interface FieldProps {
  label: string;
  id: string;
  value: number;
  step: number;
  onChange: (value: number) => void;
  prefix?: string;
  suffix?: string;
  hint?: string;
}

function Field({
  label,
  id,
  value,
  step,
  onChange,
  prefix,
  suffix,
  hint,
}: FieldProps): JSX.Element {
  const hintId = hint === undefined ? undefined : `${id}-hint`;
  return (
    <div>
      <label for={id} class="text-ink block text-sm font-medium">
        {label}
      </label>
      {hint !== undefined && (
        <p id={hintId} class="text-ink-mute mt-0.5 text-xs">
          {hint}
        </p>
      )}
      <div class="mt-1 flex items-center gap-1.5">
        {prefix !== undefined && <span class="text-ink-mute text-sm">{prefix}</span>}
        <input
          id={id}
          type="number"
          inputmode="decimal"
          min={0}
          step={step}
          value={value}
          aria-describedby={hintId}
          onInput={(e) => onChange(Number((e.target as HTMLInputElement).value) || 0)}
          class="numeric rounded-control border-line-strong bg-surface w-full border px-3 py-2 text-right"
        />
        {suffix !== undefined && <span class="text-ink-mute text-sm">{suffix}</span>}
      </div>
    </div>
  );
}
