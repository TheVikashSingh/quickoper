/**
 * UK early repayment charge calculator — the island.
 *
 * All arithmetic lives in lib/calc/uk-erc.ts. This file collects inputs and
 * renders results; it never computes (CLAUDE.md rule 1).
 *
 * CURRENCY AND LOCALE COME FROM THE JURISDICTION MODULE, not from a literal in
 * this file and not from a country flag threaded through props. That is rule
 * 13's requirement made concrete: the island asks the engine which jurisdiction
 * it computes for and formats accordingly, so there is no `switch (country)`
 * here or anywhere else.
 *
 * PRIVACY: every figure is worked out in this browser. Nothing is transmitted
 * and nothing is written to storage. The shareable link carries the seven
 * figures so a scenario can be reopened — no name, no identifier, and in
 * particular no lender.
 *
 * Static prose arrives from the .astro page as named slots (D28). Slot names
 * must be single words: the @astrojs/preact server pass camel-cases them and
 * the client pass does not, so a hyphenated slot hydrates to undefined.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';

import { JURISDICTION, UkErcError, calculateUkErc } from '../../lib/calc/uk-erc';
import { balanceSeries, compareLumpSum } from '../../lib/calc/mortgage';
import { ZERO, format, fromMajor, negate, type Minor } from '../../lib/calc/money';
import { downloadCsv, toCsv, type CsvColumn } from '../../lib/csv';
import { encodeParams, parseNumber, parseParams, type ParamSpec } from '../../lib/params';
import {
  MAX_YEAR_MONTH,
  MIN_YEAR_MONTH,
  addMonths,
  currentYearMonth,
  formatYearMonth,
  parseYearMonth,
  toInputValue,
} from '../../lib/dates';
import { useUrlState } from '../../lib/url-state';
import { LineChart } from '../chart/LineChart';
import { ScheduleTable, type Column } from '../ui/ScheduleTable';

/** Short keys, range-checked, rendered as text only (rule 11). */
const PARAMS = {
  b: { min: 1000, max: 10_000_000, fallback: 250_000 },
  r: { min: 0, max: 25, fallback: 4.5 },
  y: { min: 1, max: 40, fallback: 25 },
  f: { min: 1, max: 120, fallback: 36 },
  a: { min: 0, max: 100, fallback: 10 },
  e: { min: 0, max: 100, fallback: 3 },
  o: { min: 0, max: 10_000_000, fallback: 40_000 },
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
  readonly privacy?: JSX.Element;
  readonly method?: JSX.Element;
  readonly assumptions?: JSX.Element;
  readonly terms?: JSX.Element;
}

const money = (amount: Minor): string =>
  format(amount, JURISDICTION.currency, JURISDICTION.locale);

const plural = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`;

export function UkErcCalculator(prose: Prose): JSX.Element {
  /** Read through a ref so a shared link carries the anchor too (D67). */
  const startRef = useRef(0);

  const [state, setState] = useUrlState<State>({
    decode: (search) => parseParams(PARAMS, search),
    encode: (value) => encodeParams({ ...value, s: startRef.current }),
    initial: parseParams(PARAMS, ''),
  });

  /**
   * Deliberately outside the PARAMS spec: parseParams resets the WHOLE scenario
   * when a field is missing, so a required anchor would blank every permalink
   * already shared (D67). Read from the clock in the browser, never at build.
   */
  const [startMonth, setStartMonth] = useState<number>(() => currentYearMonth());
  startRef.current = startMonth;
  useEffect(() => {
    const fromUrl = parseNumber(new URLSearchParams(window.location.search).get('s'), {
      min: MIN_YEAR_MONTH,
      max: MAX_YEAR_MONTH,
      fallback: 0,
    });
    if (fromUrl !== null) setStartMonth(fromUrl);
  }, []);

  /**
   * The PDF export is the browser's own print pipeline (D11). No library: jsPDF
   * is ~90KB gzipped against a 19.5KB budget, and the print route is the better
   * document anyway — selectable text, real typography, and the chart printed as
   * vector rather than a raster.
   *
   * Two things need JavaScript rather than CSS. Collapsed schedule rows are not
   * in the DOM, so `beforeprint` expands them; and the masthead needs the live
   * URL so a recipient can reopen the scenario and change the figures.
   */
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
    const remainingMonths = Math.round(state.y) * 12;
    const fixedPeriodMonths = Math.min(Math.round(state.f), remainingMonths);
    try {
      const input = {
        balance: fromMajor(state.b),
        annualRate: state.r / 100,
        remainingMonths,
        fixedPeriodMonths,
        allowancePercent: state.a,
        ercPercent: state.e,
        overpayment: fromMajor(Math.min(state.o, state.b)),
      };
      return {
        result: calculateUkErc(input),
        schedules: compareLumpSum(
          {
            principal: input.balance,
            annualRate: input.annualRate,
            termMonths: input.remainingMonths,
            monthlyOverpayment: ZERO,
          },
          input.overpayment,
          1,
        ),
        fixedPeriodMonths,
        error: null as string | null,
      };
    } catch (error) {
      return {
        result: null,
        schedules: null,
        fixedPeriodMonths,
        error: error instanceof UkErcError ? error.message : 'Check the figures above.',
      };
    }
  }, [state]);

  const { result, schedules, fixedPeriodMonths, error } = outcome;

  const rows: Row[] = useMemo(
    () =>
      schedules === null
        ? []
        : schedules.overpaid.schedule.map((m) => ({
            month: m.month,
            payment: m.payment,
            interest: m.interest,
            principal: m.principalPaid,
            balance: m.closingBalance,
          })),
    [schedules],
  );

  const columns: Column<Row>[] = [
    { key: 'm', header: 'Month', value: (r) => String(r.month) },
    {
      key: 'd',
      header: 'Due',
      value: (r) => formatYearMonth(addMonths(startMonth, r.month), JURISDICTION.locale),
    },
    { key: 'p', header: 'Payment', value: (r) => money(r.payment) },
    { key: 'i', header: 'Interest', value: (r) => money(r.interest) },
    { key: 'c', header: 'Principal', value: (r) => money(r.principal) },
    { key: 'b', header: 'Balance', value: (r) => money(r.balance) },
  ];

  const csvColumns: CsvColumn<Row>[] = [
    { header: 'Month', value: (r) => r.month },
    {
      header: 'Due',
      value: (r) => formatYearMonth(addMonths(startMonth, r.month), JURISDICTION.locale),
    },
    { header: 'Payment', value: (r) => r.payment / 100 },
    { header: 'Interest', value: (r) => r.interest / 100 },
    { header: 'Principal', value: (r) => r.principal / 100 },
    { header: 'Balance', value: (r) => r.balance / 100 },
  ];

  return (
    <div class="space-y-8">
      {printedAt !== null && (
        <div class="print-only avoid-break">
          <p class="engraved text-ink">UK early repayment charge</p>
          <p class="text-ink-soft mt-1 text-sm">
            {printedAt.date} · worked out in the browser · nothing transmitted
          </p>
          <p class="text-ink-mute mt-1 text-xs">
            Reopen and change these figures: {printedAt.url}
          </p>
        </div>
      )}

      <div class="grid gap-4 sm:grid-cols-2">
        <fieldset class="border-line rounded-panel space-y-3 border p-4">
          <legend class="engraved-fine text-ink-mute px-1">Your mortgage</legend>
          <Field
            label="Balance outstanding"
            id="erc-b"
            value={state.b}
            step={1000}
            prefix="£"
            onChange={(v) => set('b', v)}
          />
          <Field
            label="Interest rate"
            id="erc-r"
            value={state.r}
            step={0.01}
            suffix="%"
            onChange={(v) => set('r', v)}
          />
          <Field
            label="Years left on the mortgage"
            id="erc-y"
            value={state.y}
            step={1}
            onChange={(v) => set('y', v)}
          />
        </fieldset>

        <fieldset class="border-line rounded-panel space-y-3 border p-4">
          <legend class="engraved-fine text-ink-mute px-1">
            Your deal, from your offer
          </legend>
          <Field
            label="Months left on the fixed rate"
            id="erc-f"
            value={state.f}
            step={1}
            hint="After this the rate changes, so nothing beyond it is contractual."
            onChange={(v) => set('f', v)}
          />
          <Field
            label="Penalty-free overpayment allowance"
            id="erc-a"
            value={state.a}
            step={1}
            suffix="% a year"
            onChange={(v) => set('a', v)}
          />
          <Field
            label="Early repayment charge"
            id="erc-e"
            value={state.e}
            step={0.1}
            suffix="% of the excess"
            onChange={(v) => set('e', v)}
          />
        </fieldset>
      </div>

      <div class="border-line-strong rounded-panel bg-sunken grid gap-3 border p-4 sm:grid-cols-2">
        <Field
          label="Overpayment you are considering"
          id="erc-o"
          value={state.o}
          step={1000}
          prefix="£"
          onChange={(v) => set('o', v)}
        />
        <div>
          <label for="erc-s" class="text-ink block text-sm font-medium">
            First payment
          </label>
          <p id="erc-s-hint" class="text-ink-mute mt-0.5 text-xs">
            Month and year only — the schedule shows months, not days.
          </p>
          <input
            id="erc-s"
            type="month"
            value={toInputValue(startMonth)}
            min={toInputValue(MIN_YEAR_MONTH)}
            max={toInputValue(MAX_YEAR_MONTH)}
            aria-describedby="erc-s-hint"
            onInput={(e) => {
              const parsed = parseYearMonth((e.target as HTMLInputElement).value);
              if (parsed === null) return;
              setStartMonth(parsed);
              startRef.current = parsed;
              setState({ ...state });
            }}
            class="numeric rounded-control border-line-strong bg-surface mt-1 w-full border px-3 py-2"
          />
        </div>
      </div>

      {prose.privacy !== undefined && <div>{prose.privacy}</div>}

      {error !== null && (
        <p role="alert" class="border-caution text-ink rounded-panel border p-4">
          {error}
        </p>
      )}

      {result !== null && schedules !== null && (
        <>
          <Verdict
            net={result.netOverFixedPeriod}
            charge={result.charge}
            saved={result.interestSavedOverFixedPeriod}
            months={fixedPeriodMonths}
          />

          <section class="space-y-3">
            {/*
              These headings were `engraved-fine text-ink-mute` — 12.75px at
              weight 400, i.e. SMALLER AND LIGHTER than the 15.94px body text
              they head. Measured through a canvas they were 5.12:1 and 4.67:1,
              both comfortably past WCAG AA, so the report that they "looked
              dull" was never a contrast problem. It is D36 exactly: when a
              contrast complaint measures fine, the answer is size, weight,
              spacing or a rule. `.section-head` is the site's own device for
              this — display face, 1.375rem, 600, over a hairline.
            */}
            <h3 class="section-head text-ink">What the charge comes to</h3>
            <div class="overflow-x-auto">
              <table class="numeric w-full text-sm">
                <tbody>
                  <Line
                    label={`Penalty-free this year (${state.a}% of the balance)`}
                    value={money(result.allowance)}
                  />
                  <Line
                    label="Of your overpayment, free of charge"
                    value={money(result.withinAllowance)}
                  />
                  <Line
                    label="Above the allowance, and chargeable"
                    value={money(result.chargeable)}
                  />
                  <Line
                    label={`Early repayment charge (${state.e}% of that)`}
                    value={money(result.charge)}
                    strong
                  />
                </tbody>
              </table>
            </div>
          </section>

          <section class="grid gap-4 sm:grid-cols-2">
            <Horizon
              primary
              eyebrow="Contractual — no assumption"
              title={`Over the ${plural(fixedPeriodMonths, 'month', 'months')} left on your fix`}
              saved={result.interestSavedOverFixedPeriod}
              charge={result.charge}
              net={result.netOverFixedPeriod}
              money={money}
            />
            <Horizon
              eyebrow="Assumes this rate never changes"
              title={`Over the whole ${plural(Math.round(state.y), 'year', 'years')} remaining`}
              saved={result.interestSavedOverRemainingTerm}
              charge={result.charge}
              net={result.netOverRemainingTerm}
              money={money}
            />
          </section>

          <BreakEven
            amount={result.breakEvenOverpayment}
            money={money}
            months={fixedPeriodMonths}
          />

          {prose.method !== undefined && <div>{prose.method}</div>}

          <section class="space-y-3">
            <h3 class="section-head text-ink">
              Balance, with and without the overpayment
            </h3>
            <LineChart
              ariaLabel="Balance remaining by month, with and without the overpayment"
              height={240}
              formatY={(v) => `£${Math.round(v / 100_000)}k`}
              formatX={(i) => `${Math.round(i / 12)}y`}
              series={[
                {
                  id: 'b',
                  label: 'Contractual payments only',
                  points: balanceSeries(schedules.baseline),
                },
                {
                  id: 'o',
                  label: 'With the overpayment',
                  points: balanceSeries(schedules.overpaid),
                },
              ]}
            />
          </section>

          <section class="space-y-3">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <h3 class="section-head text-ink">
                The schedule after overpaying —{' '}
                {plural(schedules.overpaid.months, 'month', 'months')}
              </h3>
              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  class="rounded-control border-brand bg-brand hover:bg-brand-hover text-canvas border px-3 py-1.5 text-sm font-medium"
                  onClick={() =>
                    downloadCsv('uk-overpayment-schedule.csv', toCsv(rows, csvColumns))
                  }
                >
                  Download spreadsheet (CSV)
                </button>
                <button
                  type="button"
                  class="rounded-control border-line-strong bg-sunken hover:bg-brand-soft hover:border-brand border px-3 py-1.5 text-sm font-medium"
                  onClick={() => window.print()}
                >
                  Save as PDF or print
                </button>
              </div>
            </div>
            <ScheduleTable
              rows={rows}
              columns={columns}
              caption="Month-by-month schedule after the overpayment: payment, interest, principal and remaining balance."
            />
          </section>

          {prose.assumptions !== undefined && <div>{prose.assumptions}</div>}
          {prose.terms !== undefined && <div>{prose.terms}</div>}
        </>
      )}
    </div>
  );
}

/**
 * The headline. Every directional word is read off the sign of the net rather
 * than written by hand — D55's rule, and the reason this cannot say "ahead"
 * while the arithmetic says otherwise.
 */
function Verdict({
  net,
  charge,
  saved,
  months,
}: {
  net: Minor;
  charge: Minor;
  saved: Minor;
  months: number;
}): JSX.Element {
  const ahead = net >= 0;
  return (
    <div
      class={`rounded-panel border p-4 ${ahead ? 'border-line-strong bg-surface' : 'border-caution bg-surface'}`}
    >
      <p class="engraved-fine text-ink-mute">
        {ahead ? 'The saving covers the charge' : 'The charge outweighs the saving'}
      </p>
      <p class="text-ink numeric mt-2 text-2xl font-semibold sm:text-3xl">
        {money(net >= 0 ? net : (Math.abs(net) as Minor))} {ahead ? 'ahead' : 'behind'}
      </p>
      <p class="text-ink-soft numeric mt-2 text-sm">
        Within the {plural(months, 'month', 'months')} that are contractually fixed, the
        overpayment removes {money(saved)} of interest and costs {money(charge)} in
        charge.
      </p>
    </div>
  );
}

/**
 * The two horizons are NOT peers and should not look like peers.
 *
 * One rests on a rate that is contractually fixed; the other assumes a rate
 * that expires. Rendering them identically invited the reader to pick whichever
 * number they preferred, which is the opposite of what separating them was for.
 * The contractual panel is now the solid one and carries the stronger boundary;
 * the assumed panel is deliberately quieter. That is hierarchy doing the work
 * the prose was doing alone.
 */
function Horizon({
  eyebrow,
  title,
  saved,
  charge,
  net,
  money: fmt,
  primary,
}: {
  eyebrow: string;
  title: string;
  saved: Minor;
  charge: Minor;
  net: Minor;
  money: (a: Minor) => string;
  primary?: boolean;
}): JSX.Element {
  return (
    <div
      class={`rounded-panel border p-4 ${primary ? 'border-line-strong bg-surface' : 'border-line'}`}
    >
      <p class={`engraved-fine ${primary ? 'text-ink' : 'text-ink-mute'}`}>{eyebrow}</p>
      <p class="text-ink mt-1 text-base font-semibold">{title}</p>
      <dl class="numeric mt-3 space-y-1 text-sm">
        <Pair label="Interest removed" value={fmt(saved)} />
        {/* Negated through Intl rather than prefixed with a literal minus: a
            hand-written U+2212 sat one line above Intl's U+002D on the Net row,
            two different minus glyphs in one money table. Found by reading it. */}
        <Pair label="Charge" value={fmt(negate(charge))} />
        <Pair label="Net" value={fmt(net)} strong />
      </dl>
    </div>
  );
}

function BreakEven({
  amount,
  money: fmt,
  months,
}: {
  amount: Minor | null;
  money: (a: Minor) => string;
  months: number;
}): JSX.Element {
  return (
    <div class="border-line-strong rounded-panel bg-sunken border p-4">
      <p class="engraved-fine text-ink">How far the charge can be outrun</p>
      {amount === null ? (
        <p class="text-ink-soft mt-2 text-sm">
          On these figures the interest removed stays ahead of the charge for{' '}
          <strong class="text-ink">any</strong> overpayment up to the whole balance. The
          charge never overtakes, so there is no crossing point to quote.
        </p>
      ) : (
        <p class="text-ink-soft numeric mt-2 text-sm">
          Up to <strong class="text-ink">{fmt(amount)}</strong>, the interest removed
          inside the fixed {plural(months, 'month', 'months')} still covers the charge.
          Past that the charge is the larger number.
        </p>
      )}
    </div>
  );
}

function Line({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}): JSX.Element {
  return (
    <tr class="border-line border-b">
      <td class="text-ink-soft py-2 pr-4">{label}</td>
      <td
        class={`py-2 text-right ${strong ? 'text-ink font-semibold' : 'text-ink-soft'}`}
      >
        {value}
      </td>
    </tr>
  );
}

function Pair({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}): JSX.Element {
  return (
    <div class="flex items-baseline justify-between gap-3">
      <dt class="text-ink-soft">{label}</dt>
      <dd class={strong ? 'text-ink font-semibold' : 'text-ink-soft'}>{value}</dd>
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
