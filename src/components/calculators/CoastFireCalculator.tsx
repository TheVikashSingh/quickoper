/**
 * Coast FIRE calculator.
 *
 * The island. All arithmetic lives in lib/calc/coast-fire.ts; this file only
 * collects inputs and renders results.
 *
 * PRIVACY (CLAUDE.md): every figure is computed in this browser. Nothing is
 * transmitted and nothing is written to storage. The shareable link carries the
 * numbers so a scenario can be reopened.
 *
 * Static prose arrives from the .astro page as slots rather than living in this
 * file — see the header of DebtPayoffCalculator.tsx for why, and for the trap
 * with hyphenated slot names.
 */

import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import type { JSX } from 'preact';

import {
  CoastFireError,
  calculateCoastFire,
  coastOnly,
  type CoastFireInput,
} from '../../lib/calc/coast-fire';
import { absolute, format, fromMajor, toMajor, type Minor } from '../../lib/calc/money';
import { downloadCsv, toCsv, type CsvColumn } from '../../lib/csv';
import { encodeParams, parseParams, type ParamSpec } from '../../lib/params';
import { useUrlState } from '../../lib/url-state';
import { LineChart } from '../chart/LineChart';
import { ScheduleTable, type Column } from '../ui/ScheduleTable';

const CURRENCY = 'USD';

const PARAMS = {
  a: { min: 16, max: 100, fallback: 30 },
  r: { min: 17, max: 100, fallback: 60 },
  i: { min: 0, max: 100_000_000, fallback: 100_000 },
  s: { min: 1, max: 10_000_000, fallback: 40_000 },
  w: { min: 0.1, max: 20, fallback: 4 },
  g: { min: -20, max: 30, fallback: 5 },
  c: { min: 0, max: 1_000_000, fallback: 500 },
} as const satisfies ParamSpec;

type State = { [K in keyof typeof PARAMS]: number };

const toInput = (s: State): CoastFireInput => ({
  currentAge: Math.round(s.a),
  retirementAge: Math.round(s.r),
  currentInvested: fromMajor(s.i),
  annualSpending: fromMajor(s.s),
  withdrawalRate: s.w / 100,
  realReturn: s.g / 100,
  monthlyContribution: fromMajor(s.c),
});

interface Row {
  age: number;
  balance: Minor;
  coastTarget: Minor;
  coasting: boolean;
}

/**
 * Static prose, rendered by the page. Optional only because `astro check`
 * cannot see named slots as props — see DebtPayoffCalculator's Prose, and
 * scripts/check-slots.mjs, which enforces what the type system cannot.
 */
export interface Prose {
  /** "Everything is in today's money…" */
  readonly privacy?: JSX.Element;
  /** That the inputs are assumptions, not recommendations. */
  readonly assumptions?: JSX.Element;
  /** The two-step derivation and its formula. */
  readonly method?: JSX.Element;
  /** Why the figures are real rather than nominal. */
  readonly realterms?: JSX.Element;
  /** Where the name on the report does and does not go. */
  readonly retention?: JSX.Element;
}

export function CoastFireCalculator(prose: Prose): JSX.Element {
  const [state, setState] = useUrlState<State>({
    decode: (search) => parseParams(PARAMS, search),
    encode: (value) => encodeParams(value),
    initial: parseParams(PARAMS, ''),
  });

  // Never in the URL and never persisted, for the same reason lender names are
  // not (see lib/params.ts): a name in a shared link identifies whoever shared
  // it. It exists only to title the printed document.
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
      return { result: calculateCoastFire(toInput(state)), error: null as string | null };
    } catch (error) {
      return {
        result: null,
        error:
          error instanceof CoastFireError ? error.message : 'Check the figures above.',
      };
    }
  }, [state]);

  const rows: Row[] = useMemo(
    () =>
      outcome.result === null
        ? []
        : outcome.result.projection.map((p) => ({
            age: p.age,
            balance: p.balance,
            coastTarget: p.coastTarget,
            coasting: p.coasting,
          })),
    [outcome.result],
  );

  return (
    <div class="space-y-8">
      {printedAt !== null && (
        <div class="print-only avoid-break">
          <div style="border-bottom:2px solid #000;padding-bottom:6pt;margin-bottom:10pt">
            <strong style="font-size:13pt">QuickOper — Coast FIRE projection</strong>
            <div style="font-size:8pt;margin-top:3pt">
              {preparedFor.trim() !== '' && <>For {preparedFor.trim()} · </>}
              {printedAt.date} · in today's money · worked out in the browser
            </div>
            <div style="font-size:7.5pt;word-break:break-all;margin-top:2pt">
              Reopen and change these figures: {printedAt.url}
            </div>
          </div>
        </div>
      )}

      <section aria-labelledby="you-heading" class="no-print">
        <h2 id="you-heading" class="text-lg font-semibold">
          Where you are now
        </h2>
        <p class="text-ink-soft mt-1 text-sm">{prose.privacy}</p>

        <div class="mt-4 grid gap-3 sm:grid-cols-3">
          <Field
            label="Your age"
            id="a"
            value={state.a}
            step={1}
            onChange={(v) => set('a', v)}
          />
          <Field
            label="Retire at"
            id="r"
            value={state.r}
            step={1}
            onChange={(v) => set('r', v)}
          />
          <Field
            label="Invested today"
            id="i"
            value={state.i}
            step={1000}
            prefix="$"
            onChange={(v) => set('i', v)}
          />
        </div>
      </section>

      <section aria-labelledby="assume-heading" class="no-print">
        <h2 id="assume-heading" class="text-lg font-semibold">
          What you are assuming
        </h2>
        <p class="text-ink-soft mt-1 text-sm">{prose.assumptions}</p>

        <div class="mt-4 grid gap-3 sm:grid-cols-4">
          <Field
            label="Yearly spending"
            id="s"
            value={state.s}
            step={1000}
            prefix="$"
            hint="in retirement"
            onChange={(v) => set('s', v)}
          />
          <Field
            label="Withdrawal rate"
            id="w"
            value={state.w}
            step={0.1}
            suffix="%"
            hint={`= ${(100 / state.w).toFixed(1)}× spending`}
            onChange={(v) => set('w', v)}
          />
          <Field
            label="Real return"
            id="g"
            value={state.g}
            step={0.1}
            suffix="%"
            hint="after inflation"
            onChange={(v) => set('g', v)}
          />
          <Field
            label="Monthly saving"
            id="c"
            value={state.c}
            step={50}
            prefix="$"
            hint="0 = coasting now"
            onChange={(v) => set('c', v)}
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
            result={outcome.result}
            rows={rows}
            state={state}
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

function Results({
  result,
  rows,
  state,
  name,
  onName,
  prose,
}: {
  result: NonNullable<ReturnType<typeof calculateCoastFire>>;
  rows: Row[];
  state: State;
  name: string;
  onName: (value: string) => void;
  prose: Prose;
}): JSX.Element {
  const years = Math.round(state.r) - Math.round(state.a);

  const columns: Column<Row>[] = [
    { key: 'age', header: 'Age', value: (r) => String(r.age) },
    { key: 'bal', header: 'Projected', value: (r) => format(r.balance, CURRENCY) },
    { key: 'tgt', header: 'Coast target', value: (r) => format(r.coastTarget, CURRENCY) },
    {
      key: 'ok',
      header: 'Coasting',
      numeric: false,
      value: (r) => (r.coasting ? 'yes' : '—'),
    },
  ];

  const csvColumns: CsvColumn<Row>[] = [
    { header: 'Age', value: (r) => r.age },
    { header: 'Projected balance', value: (r) => toMajor(r.balance) },
    { header: 'Coast target', value: (r) => toMajor(r.coastTarget) },
    { header: 'Coasting', value: (r) => (r.coasting ? 'yes' : 'no') },
  ];

  return (
    <section aria-labelledby="results-heading" class="space-y-6">
      <h2 id="results-heading" class="text-lg font-semibold">
        What the arithmetic says
      </h2>

      <div class="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Coast number today"
          value={format(result.coastNumber, CURRENCY)}
          note={`grows to ${format(result.fireNumber, CURRENCY)} by ${Math.round(state.r)}`}
        />
        <Stat
          label={result.alreadyCoasting ? 'Already past it by' : 'Short by'}
          value={format(absolute(result.surplus), CURRENCY)}
          note={result.alreadyCoasting ? 'contributions optional' : 'at today’s balance'}
        />
        <Stat
          label="Coasting from age"
          value={
            result.coastAge === null ? 'not on these figures' : String(result.coastAge)
          }
          note={
            result.coastAge === null
              ? 'saving more, or retiring later, changes this'
              : `keeping up $${state.c.toLocaleString()}/month`
          }
        />
      </div>

      <LineChart
        ariaLabel="Projected balance against the coast target, by age"
        height={240}
        // Millions read as "$1.5M", not "$1500k". A 40-year projection at a
        // decent return crosses seven figures routinely.
        formatY={(v) =>
          v >= 100_000_000
            ? `$${(v / 100_000_000).toFixed(1)}M`
            : `$${Math.round(v / 100_000)}k`
        }
        formatX={(i) => String(Math.round(state.a) + i)}
        series={[
          { id: 'b', label: 'Projected balance', points: rows.map((r) => r.balance) },
          { id: 't', label: 'Coast target', points: rows.map((r) => r.coastTarget) },
          {
            id: 'c',
            label: 'If you stopped saving today',
            points: coastOnly(fromMajor(state.i), state.g / 100, years),
          },
        ]}
      />

      <details class="rounded-panel border-line bg-sunken border p-4">
        <summary class="cursor-pointer text-sm font-semibold">
          How this was calculated
        </summary>
        <div class="text-ink-soft mt-3 space-y-3 text-sm">
          {/* Wrapped for the same reason as the debt payoff island: astro-slot
              is `display: contents` and cannot take the space-y-3 margin. */}
          <div>{prose.method}</div>
          <p>
            On your figures: {format(fromMajor(state.s), CURRENCY)} ÷ {state.w}% ={' '}
            <strong class="text-ink">{format(result.fireNumber, CURRENCY)}</strong>, the
            amount you would need invested at {Math.round(state.r)}. Discounted back over{' '}
            {years} years at {state.g}% a year, that is{' '}
            <strong class="text-ink">{format(result.coastNumber, CURRENCY)}</strong>{' '}
            today.
          </p>
          <p>
            The projection steps month by month at the effective monthly rate,{' '}
            <span class="numeric">(1 + {state.g}%)^(1/12) − 1</span>, rather than dividing
            the annual figure by twelve. A stated annual return compounds to that figure
            over the year, so dividing would overstate a long projection.
          </p>
          <p>{prose.realterms}</p>
        </div>
      </details>

      <div class="no-print">
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              downloadCsv('quickoper-coast-fire.csv', toCsv(rows, csvColumns))
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
        caption="Projected balance against the coast target, year by year"
        initialRows={10}
        rowKey={(r) => String(r.age)}
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

function Field({
  label,
  id,
  value,
  onChange,
  step,
  prefix,
  suffix,
  hint,
}: {
  label: string;
  id: string;
  value: number;
  onChange: (value: number) => void;
  step: number;
  prefix?: string;
  suffix?: string;
  hint?: string;
}): JSX.Element {
  return (
    <div>
      <label for={id} class="text-ink-mute block text-xs font-medium">
        {label}
      </label>
      <div class="mt-1 flex items-center gap-1">
        {prefix !== undefined && <span class="text-ink-mute text-sm">{prefix}</span>}
        <input
          id={id}
          type="number"
          inputmode="decimal"
          step={step}
          value={value}
          onInput={(e) => {
            const next = Number((e.target as HTMLInputElement).value);
            if (Number.isFinite(next)) onChange(next);
          }}
          class="numeric border-line-strong bg-surface rounded-control w-full border px-2 py-1.5 text-right text-sm"
        />
        {suffix !== undefined && <span class="text-ink-mute text-sm">{suffix}</span>}
      </div>
      {hint !== undefined && <p class="text-ink-mute mt-1 text-xs">{hint}</p>}
    </div>
  );
}
