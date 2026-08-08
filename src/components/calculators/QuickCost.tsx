/**
 * The homepage quick answer: what is one debt costing you?
 *
 * WHY THIS EXISTS. A visitor has a few seconds to decide whether to stay. Prose
 * cannot win that; a box they can type a number into can. This is the smallest
 * thing that turns a reader into a user.
 *
 * WHY IT IS NOT A GENERAL CALCULATOR. calculator.net puts a scientific
 * calculator on its front page, and that is right for calculator.net — it sells
 * breadth. A four-function keypad here would demonstrate nothing this site is
 * good at and would compete in a category where we have no advantage and no
 * intention of building one. This asks the one question the site actually
 * answers better than a chatbot: not "what is the number", but "what does the
 * whole thing cost, and over how long".
 *
 * IT USES THE REAL ENGINE. `compareStrategies` is the same function behind
 * /finance/debt-payoff-calculator, so this can never quote a figure the full
 * tool would contradict. A closed-form approximation would have been perhaps
 * 2KB lighter and would have disagreed by cents — which, on a site whose whole
 * pitch is that its arithmetic is checkable, is not a saving.
 *
 * IT HANDS OFF RATHER THAN COMPETING. The result carries a link that opens the
 * full calculator with these exact figures already loaded, using the same URL
 * params the tool already reads. Nothing is retyped, and the teaser stays a
 * teaser: no schedule, no chart, no CSV, no PDF. Those are the reason to
 * follow the link.
 *
 * PRIVACY (CLAUDE.md): computed in this browser, transmitted nowhere, stored
 * nowhere. The figures reach the URL only when the visitor chooses to follow
 * the link.
 */

import { useMemo, useState } from 'preact/hooks';
import type { JSX } from 'preact';

import { DebtPayoffError, compareStrategies } from '../../lib/calc/debt-payoff';
import { format, fromMajor } from '../../lib/calc/money';

const CURRENCY = 'USD';

/** Deliberately ordinary figures: a plausible card balance, a real-world APR. */
const DEFAULTS = { balance: 6000, rate: 22.99, payment: 250 };

interface Prose {
  /** The privacy line, rendered by the page (D28). */
  readonly privacy?: JSX.Element;
}

export function QuickCost(prose: Prose): JSX.Element {
  const [balance, setBalance] = useState(DEFAULTS.balance);
  const [rate, setRate] = useState(DEFAULTS.rate);
  const [payment, setPayment] = useState(DEFAULTS.payment);

  const outcome = useMemo(() => {
    try {
      const result = compareStrategies(
        [
          {
            id: 'q',
            name: 'Debt',
            balance: fromMajor(balance),
            annualRate: rate / 100,
            minimumPayment: fromMajor(payment),
          },
        ],
        fromMajor(payment),
      ).avalanche;
      return { result, error: null as string | null };
    } catch (error) {
      return {
        result: null,
        error: error instanceof DebtPayoffError ? error.message : 'Check the figures.',
      };
    }
  }, [balance, rate, payment]);

  // The full tool reads exactly this shape, so nothing is retyped on arrival.
  const handoff = `/finance/debt-payoff-calculator?d=${balance}-${rate}-${payment}&b=${payment}&v=avalanche`;

  const years = outcome.result === null ? 0 : Math.floor(outcome.result.months / 12);
  const months = outcome.result === null ? 0 : outcome.result.months % 12;

  return (
    <div>
      <div class="grid gap-3 sm:grid-cols-3">
        <Field
          label="Balance"
          id="q-bal"
          prefix="$"
          value={balance}
          step={100}
          onChange={setBalance}
        />
        <Field
          label="Interest rate"
          id="q-rate"
          suffix="%"
          value={rate}
          step={0.01}
          onChange={setRate}
        />
        <Field
          label="You pay monthly"
          id="q-pay"
          prefix="$"
          value={payment}
          step={10}
          onChange={setPayment}
        />
      </div>

      <div
        class="border-line-strong bg-sunken rounded-panel mt-4 border p-4"
        aria-live="polite"
      >
        {outcome.error !== null ? (
          <p role="alert" class="text-negative text-sm">
            {outcome.error}
          </p>
        ) : outcome.result === null || outcome.result.neverPaysOff ? (
          <p role="alert" class="text-caution text-sm">
            At this payment the balance never clears — the interest each month is more
            than you are paying, so the debt grows.
          </p>
        ) : (
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <div class="engraved text-ink-mute text-xs">Clear in</div>
              <div class="numeric text-ink mt-1 text-2xl font-semibold">
                {years > 0 ? `${years}y ` : ''}
                {months}m
              </div>
              <div class="text-ink-soft mt-0.5 text-xs">
                {outcome.result.months} payments
              </div>
            </div>
            <div>
              <div class="engraved text-ink-mute text-xs">Interest you pay</div>
              <div class="numeric text-ink mt-1 text-2xl font-semibold">
                {format(outcome.result.totalInterest, CURRENCY)}
              </div>
              <div class="text-ink-soft mt-0.5 text-xs">
                on top of the {format(fromMajor(balance), CURRENCY)} borrowed
              </div>
            </div>
          </div>
        )}
      </div>

      <div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <a
          href={handoff}
          class="rounded-control border-brand bg-brand hover:bg-brand-hover text-canvas border px-4 py-2 text-sm font-medium"
        >
          See the month-by-month schedule
        </a>
        <span class="text-ink-mute text-xs">
          Full schedule, chart, CSV and printable report — your figures carried over.
        </span>
      </div>

      <div class="text-ink-mute mt-3 text-xs">{prose.privacy}</div>
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
}

function Field({
  label,
  id,
  value,
  step,
  onChange,
  prefix,
  suffix,
}: FieldProps): JSX.Element {
  return (
    <div>
      <label for={id} class="text-ink block text-sm font-medium">
        {label}
      </label>
      <div class="mt-1 flex items-center gap-1.5">
        {prefix !== undefined && <span class="text-ink-mute text-sm">{prefix}</span>}
        <input
          id={id}
          type="number"
          inputmode="decimal"
          min={0}
          step={step}
          value={value}
          onInput={(e) => onChange(Number((e.target as HTMLInputElement).value) || 0)}
          class="numeric rounded-control border-line-strong bg-surface w-full border px-3 py-2 text-right text-base"
        />
        {suffix !== undefined && <span class="text-ink-mute text-sm">{suffix}</span>}
      </div>
    </div>
  );
}
