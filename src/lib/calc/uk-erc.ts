/**
 * UK early repayment charge — what overpaying a fixed-period deal actually costs.
 *
 * Pure functions. No DOM, no framework, no imports outside calc/ (rule 1).
 *
 * ── WHY THIS IS A SEPARATE MODULE AND NOT A FLAG ON mortgage.ts ─────────────
 *
 * Rule 13 permits a jurisdiction variant only where the RULE differs, never
 * where the word does. It differs here: a UK fixed-period deal contractually
 * allows a percentage of the balance to be repaid each year without charge, and
 * charges a percentage of anything above that. A US fixed-rate note has no such
 * term. This module computes that charge; the amortisation underneath it is
 * mortgage.ts unchanged, because interest on a balance is interest on a balance
 * in either country.
 *
 * ── WHAT IS TAKEN FROM THE USER, AND WHY ALL OF IT ─────────────────────────
 *
 * The allowance percentage and the charge percentage are INPUTS, never data
 * held here. Both are contractual terms that vary by lender, by product and by
 * year of the deal. CLAUDE.md forbids inventing a rate, threshold or cap, and
 * the honest consequence is that this tool asks the reader to read two numbers
 * off their own mortgage offer. That is a worse first impression and the only
 * defensible design: a figure we invented would be wrong for most readers and
 * uncheckable by all of them.
 *
 * ── ROUNDING POLICY (rule 3) ────────────────────────────────────────────────
 *
 * WHERE:      the allowance and the charge each round once, on the minor unit,
 *             at the moment they are computed. Interest rounding belongs to
 *             mortgage.ts and is untouched — this module walks no schedule.
 * DIRECTION:  half away from zero, via money.ts scale().
 * ORDER:      allowance first, then the chargeable excess, then the charge on
 *             that excess. Charging the whole overpayment and deducting an
 *             allowance afterwards gives a different penny and a different
 *             meaning; this order is the one a lender's terms describe.
 *
 * ── THE TWO HORIZONS, AND WHY BOTH ARE REPORTED ────────────────────────────
 *
 * This is the honest heart of the tool. A UK deal is fixed for a few years and
 * then reverts to a rate nobody can know today, so a saving quoted over a
 * 25-year remaining term is a forecast wearing a schedule's clothes.
 *
 *   OVER THE FIXED PERIOD  exact. The rate is contractual for those months, so
 *                          the figure rests on no assumption at all.
 *   OVER THE FULL TERM     conditional. It assumes the current rate runs to the
 *                          end, which it will not. Reported because it bounds
 *                          the answer from above, and labelled as an assumption
 *                          everywhere it is shown.
 *
 * A charge paid today against a saving that only arrives after the fix ends is
 * the exact shape this tool exists to expose, so collapsing the two horizons
 * into one number would defeat it.
 */

import { ZERO, clampAtZero, max, min, scale, subtract, type Minor } from './money';
import { MAX_MONTHS, compareLumpSum, contractualPayment } from './mortgage';
import { UK } from './contracts';

/** This module computes for one jurisdiction and declares it (rule 13). */
export const JURISDICTION = UK;

export class UkErcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UkErcError';
  }
}

export interface UkErcInput {
  /** Outstanding balance today. */
  readonly balance: Minor;
  /** Nominal annual rate of the current deal, as a fraction: 4.5% is 0.045. */
  readonly annualRate: number;
  /** Months left on the mortgage term. */
  readonly remainingMonths: number;
  /** Months left on the fixed deal. Never more than the remaining term. */
  readonly fixedPeriodMonths: number;
  /** Penalty-free overpayment allowed per year, as a percent of the balance. */
  readonly allowancePercent: number;
  /** Charge on the amount above the allowance, as a percent of that amount. */
  readonly ercPercent: number;
  /** The one-off overpayment being considered, paid now. */
  readonly overpayment: Minor;
}

export interface UkErcResult {
  /** Penalty-free amount this year. */
  readonly allowance: Minor;
  /** The part of the overpayment that costs nothing. */
  readonly withinAllowance: Minor;
  /** The part the charge applies to. */
  readonly chargeable: Minor;
  /** The early repayment charge itself. */
  readonly charge: Minor;
  /** Interest removed within the fixed period. Contractual, no assumption. */
  readonly interestSavedOverFixedPeriod: Minor;
  /** Interest removed over the whole remaining term, IF the rate never changed. */
  readonly interestSavedOverRemainingTerm: Minor;
  /** Saving minus charge, per horizon. Negative means the charge wins. */
  readonly netOverFixedPeriod: Minor;
  readonly netOverRemainingTerm: Minor;
  /** Months removed from the schedule, at the current rate. */
  readonly monthsSaved: number;
  /** The contractual payment implied by balance, rate and remaining term. */
  readonly contractualPayment: Minor;
  /**
   * The largest overpayment whose charge is still covered by the interest it
   * removes WITHIN THE FIXED PERIOD. Null when the charge never overtakes,
   * which happens whenever the rate comfortably exceeds the charge percentage —
   * a common case that a bare number would misrepresent.
   */
  readonly breakEvenOverpayment: Minor | null;
}

function assertInput(input: UkErcInput): void {
  if (input.balance <= 0) {
    throw new UkErcError('Outstanding balance must be more than zero.');
  }
  if (input.annualRate < 0) {
    throw new UkErcError('Interest rate cannot be negative.');
  }
  if (!Number.isInteger(input.remainingMonths) || input.remainingMonths < 1) {
    throw new UkErcError('Remaining term must be a whole number of months.');
  }
  if (input.remainingMonths > MAX_MONTHS) {
    throw new UkErcError(`Remaining term cannot exceed ${MAX_MONTHS} months.`);
  }
  if (!Number.isInteger(input.fixedPeriodMonths) || input.fixedPeriodMonths < 1) {
    throw new UkErcError('Fixed period must be a whole number of months.');
  }
  if (input.fixedPeriodMonths > input.remainingMonths) {
    throw new UkErcError('The fixed period cannot outlast the mortgage term.');
  }
  if (input.allowancePercent < 0 || input.allowancePercent > 100) {
    throw new UkErcError('The overpayment allowance must be between 0% and 100%.');
  }
  if (input.ercPercent < 0 || input.ercPercent > 100) {
    throw new UkErcError('The early repayment charge must be between 0% and 100%.');
  }
  if (input.overpayment < 0) {
    throw new UkErcError('An overpayment cannot be negative.');
  }
  if (input.overpayment > input.balance) {
    throw new UkErcError('An overpayment cannot exceed the balance outstanding.');
  }
}

/** Penalty-free amount for the year: a percentage of the balance, rounded once. */
export function allowanceFor(balance: Minor, allowancePercent: number): Minor {
  return scale(balance, allowancePercent / 100, 'half-up');
}

/** The charge on one overpayment, given the allowance it is measured against. */
export function chargeFor(
  overpayment: Minor,
  allowance: Minor,
  ercPercent: number,
): { withinAllowance: Minor; chargeable: Minor; charge: Minor } {
  const withinAllowance = min(overpayment, allowance);
  const chargeable = clampAtZero(subtract(overpayment, allowance));
  const charge = scale(chargeable, ercPercent / 100, 'half-up');
  return { withinAllowance, chargeable, charge };
}

/**
 * Cumulative interest at the end of a window.
 *
 * Reads interestToDate off the schedule rather than re-summing rows, so it
 * cannot disagree with the totals the mortgage engine already publishes. When a
 * schedule ends before the window does, its final cumulative figure is the
 * right one — there is no further interest to charge.
 */
function interestWithin(
  schedule: readonly { readonly interestToDate: Minor }[],
  months: number,
): Minor {
  if (schedule.length === 0) return ZERO;
  const index = Math.min(months, schedule.length) - 1;
  return schedule[index]!.interestToDate;
}

/** Interest removed inside the fixed period by one overpayment. */
function savedWithinFixedPeriod(input: UkErcInput, overpayment: Minor): Minor {
  const comparison = compareLumpSum(
    {
      principal: input.balance,
      annualRate: input.annualRate,
      termMonths: input.remainingMonths,
      monthlyOverpayment: ZERO,
    },
    overpayment,
    1,
  );
  return clampAtZero(
    subtract(
      interestWithin(comparison.baseline.schedule, input.fixedPeriodMonths),
      interestWithin(comparison.overpaid.schedule, input.fixedPeriodMonths),
    ),
  );
}

/**
 * The largest overpayment still covered by the interest it removes inside the
 * fixed period.
 *
 * Found by bisection on whole minor units rather than solved algebraically, for
 * the same reason D61 rejected a closed form: the saving comes from a schedule
 * that rounds every period, so an algebraic answer is out by pennies and this
 * site asserts exact figures. Bisection on an integer domain terminates exactly.
 *
 * Returns null when the whole balance can be repaid with the saving still
 * ahead. That is not an edge case to be tidied away — whenever the rate exceeds
 * the charge percentage it is the correct answer, and printing some finite
 * number there would be false.
 */
function breakEven(input: UkErcInput, allowance: Minor): Minor | null {
  const netAt = (overpayment: Minor): number =>
    savedWithinFixedPeriod(input, overpayment) -
    chargeFor(overpayment, allowance, input.ercPercent).charge;

  if (netAt(input.balance) >= 0) return null;

  // Below the allowance the charge is zero, so the net cannot be negative
  // there. Any crossing therefore lies in (allowance, balance].
  let low = max(allowance, ZERO);
  let high = input.balance;

  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2) as Minor;
    if (netAt(mid) >= 0) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return low;
}

export function calculateUkErc(input: UkErcInput): UkErcResult {
  assertInput(input);

  const allowance = allowanceFor(input.balance, input.allowancePercent);
  const { withinAllowance, chargeable, charge } = chargeFor(
    input.overpayment,
    allowance,
    input.ercPercent,
  );

  const comparison = compareLumpSum(
    {
      principal: input.balance,
      annualRate: input.annualRate,
      termMonths: input.remainingMonths,
      monthlyOverpayment: ZERO,
    },
    input.overpayment,
    1,
  );

  const interestSavedOverFixedPeriod = savedWithinFixedPeriod(input, input.overpayment);
  const interestSavedOverRemainingTerm = comparison.interestSaved;

  return {
    allowance,
    withinAllowance,
    chargeable,
    charge,
    interestSavedOverFixedPeriod,
    interestSavedOverRemainingTerm,
    netOverFixedPeriod: subtract(interestSavedOverFixedPeriod, charge),
    netOverRemainingTerm: subtract(interestSavedOverRemainingTerm, charge),
    monthsSaved: comparison.monthsSaved,
    contractualPayment: contractualPayment(
      input.balance,
      input.annualRate,
      input.remainingMonths,
    ),
    breakEvenOverpayment: breakEven(input, allowance),
  };
}
