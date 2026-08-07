/**
 * Demo harness for the presentation kit.
 *
 * NOT the debt payoff tool. The debts are fixed; only the monthly budget is
 * adjustable. It exists so the four kit pieces are exercised against a real
 * engine on a real page, which is the only way the per-page JavaScript budget
 * measures anything true. The actual calculator, with debt entry and the
 * how-this-was-calculated disclosure, is the next pull request.
 */

import { useMemo } from 'preact/hooks';
import type { JSX } from 'preact';

import { compareStrategies, type Debt } from '../../lib/calc/debt-payoff';
import { format, fromMajor, toMajor, type Minor } from '../../lib/calc/money';
import { downloadCsv, toCsv, type CsvColumn } from '../../lib/csv';
import type { ParamSpec } from '../../lib/params';
import { useUrlState } from '../../lib/url-state';
import { LineChart } from '../chart/LineChart';
import { ScheduleTable, type Column } from '../ui/ScheduleTable';

const SAMPLE_DEBTS: readonly Debt[] = [
  {
    id: 'store',
    name: 'Store card',
    balance: fromMajor(900),
    annualRate: 0.2999,
    minimumPayment: fromMajor(30),
  },
  {
    id: 'card',
    name: 'Credit card',
    balance: fromMajor(6_000),
    annualRate: 0.2299,
    minimumPayment: fromMajor(150),
  },
  {
    id: 'loan',
    name: 'Personal loan',
    balance: fromMajor(2_500),
    annualRate: 0.0699,
    minimumPayment: fromMajor(120),
  },
];

const MINIMUM_TOTAL = 300;

const PARAMS = {
  budget: { min: MINIMUM_TOTAL, max: 100_000, fallback: 600 },
} as const satisfies ParamSpec;

interface ScheduleRow {
  month: number;
  // Minor, not number. Widening these to `number` is exactly the slip the brand
  // exists to catch, and it caught it.
  paid: Minor;
  interest: Minor;
  remaining: Minor;
}

export function KitDemo(): JSX.Element {
  const [state, setState] = useUrlState(PARAMS);

  const comparison = useMemo(
    () => compareStrategies(SAMPLE_DEBTS, fromMajor(state.budget)),
    [state.budget],
  );

  const rows: ScheduleRow[] = useMemo(
    () =>
      comparison.best.schedule.map((month) => ({
        month: month.month,
        paid: month.totalPaid,
        interest: month.totalInterest,
        remaining: month.totalRemaining,
      })),
    [comparison],
  );

  const columns: Column<ScheduleRow>[] = [
    { key: 'month', header: 'Month', value: (r) => String(r.month) },
    { key: 'paid', header: 'Paid', value: (r) => format(r.paid, 'USD') },
    { key: 'interest', header: 'Interest', value: (r) => format(r.interest, 'USD') },
    { key: 'remaining', header: 'Remaining', value: (r) => format(r.remaining, 'USD') },
  ];

  const csvColumns: CsvColumn<ScheduleRow>[] = [
    { header: 'Month', value: (r) => r.month },
    { header: 'Paid', value: (r) => toMajor(r.paid) },
    { header: 'Interest', value: (r) => toMajor(r.interest) },
    { header: 'Remaining', value: (r) => toMajor(r.remaining) },
  ];

  const balanceSeries = (result: typeof comparison.best) => [
    fromMajor(9_400),
    ...result.schedule.map((m) => m.totalRemaining),
  ];

  return (
    <div class="space-y-6">
      <div>
        <label for="budget" class="block text-sm font-medium">
          Monthly budget
        </label>
        <p id="budget-hint" class="text-ink-mute mt-0.5 text-xs">
          Minimum payments total ${MINIMUM_TOTAL}. Fixed sample debts of $9,400.
        </p>
        <input
          id="budget"
          type="number"
          inputmode="decimal"
          min={MINIMUM_TOTAL}
          max={100_000}
          step={10}
          value={state.budget}
          aria-describedby="budget-hint"
          onInput={(event) => {
            const next = Number((event.target as HTMLInputElement).value);
            if (Number.isFinite(next) && next >= MINIMUM_TOTAL)
              setState({ budget: next });
          }}
          class="numeric rounded-control border-line-strong bg-surface mt-2 w-40 border px-3 py-2 text-right"
        />
      </div>

      <div class="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Debt-free in"
          value={`${comparison.best.months} months`}
          note={`${comparison.best.strategy}`}
        />
        <Stat
          label="Interest paid"
          value={format(comparison.best.totalInterest, 'USD')}
          note={`vs ${format(comparison.minimumsOnly.totalInterest, 'USD')} on minimums`}
        />
        <Stat
          label="Saved vs minimums"
          value={format(comparison.interestSavedVsMinimums, 'USD')}
          note={`and ${comparison.monthsSavedVsMinimums} months sooner`}
        />
      </div>

      <LineChart
        ariaLabel="Remaining balance by month, comparing avalanche, snowball and minimum payments"
        height={240}
        formatY={(v) => `$${Math.round(v / 100_000)}k`}
        formatX={(i) => `${i}m`}
        series={[
          {
            id: 'avalanche',
            label: 'Avalanche',
            points: balanceSeries(comparison.avalanche),
          },
          {
            id: 'snowball',
            label: 'Snowball',
            points: balanceSeries(comparison.snowball),
          },
          {
            id: 'minimums',
            label: 'Minimums only',
            points: balanceSeries(comparison.minimumsOnly),
          },
        ]}
      />

      <div>
        <button
          type="button"
          onClick={() => downloadCsv('quickoper-schedule.csv', toCsv(rows, csvColumns))}
          class="rounded-control border-line-strong hover:bg-sunken border px-3 py-1.5 text-sm font-medium"
        >
          Download schedule (CSV)
        </button>
      </div>

      <ScheduleTable
        rows={rows}
        columns={columns}
        caption={`Month-by-month payoff schedule, ${comparison.best.strategy} strategy`}
        rowKey={(r) => String(r.month)}
      />
    </div>
  );
}

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
