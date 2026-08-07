/**
 * Debt payoff: avalanche vs snowball.
 *
 * Pure functions. No DOM, no Preact, no imports from components/.
 *
 * ─── Stated assumptions (these belong on the page, not just in the code) ─────
 *
 * 1. INTEREST CONVENTION. Monthly interest is `balance × (annualRate / 12)`,
 *    accrued on the OPENING balance before any payment is applied.
 *
 *    Card issuers actually use a daily periodic rate against an average daily
 *    balance, which differs by a small amount depending on when in the cycle a
 *    payment lands. A monthly model is the universal convention for payoff
 *    calculators because the user cannot supply payment dates, and modelling
 *    them would imply a precision the inputs do not contain. This is an
 *    ESTIMATE, and the page must say so.
 *
 * 2. ORDER WITHIN A MONTH. Interest accrues first, then payment is applied.
 *    The alternative (pay first, accrue on the reduced balance) understates
 *    interest. The conservative convention is used.
 *
 * 3. TARGET ORDER IS FIXED AT THE START, not recomputed monthly.
 *    Avalanche orders by rate, which never changes. Snowball orders by opening
 *    balance; because the target is the debt being paid down fastest, the
 *    initial order and a monthly re-sort produce the same sequence, and fixing
 *    it avoids thrashing when two balances cross.
 *
 * 4. ROLLOVER. When a debt clears, its minimum payment is freed and joins the
 *    surplus. This is what makes either strategy accelerate, and it applies to
 *    both. Surplus left over after clearing a debt mid-month cascades to the
 *    next target in the SAME month rather than sitting idle.
 *
 * 5. NO OVERPAYMENT. A payment is capped at the amount needed to clear the
 *    debt, so the final month pays the exact payoff figure rather than the full
 *    budget.
 *
 * ─── Rounding policy (CLAUDE.md rule 3) ─────────────────────────────────────
 *
 * Delegated wholesale to calc/money.ts: half-up, per period, at every point a
 * non-integer is produced. Interest is rounded to the minor unit each month
 * before it is added, exactly as a statement does it — never accumulated as a
 * float and rounded at the end.
 */

import {
  ZERO,
  absolute,
  add,
  clampAtZero,
  compare,
  isPositive,
  min as minOf,
  scale,
  subtract,
  sum,
  type Minor,
} from './money';

/** 50 years. Consumer debt modelled beyond this is not a meaningful answer. */
export const MAX_MONTHS = 600;

/** Highest rate above which an input is almost certainly a data-entry error. */
const MAX_ANNUAL_RATE = 2; // 200%

export class DebtPayoffError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DebtPayoffError';
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface Debt {
  readonly id: string;
  readonly name: string;
  readonly balance: Minor;
  /** Annual rate as a decimal: 0.1999 for 19.99%. */
  readonly annualRate: number;
  readonly minimumPayment: Minor;
}

export type Strategy = 'avalanche' | 'snowball' | 'minimums-only';

export interface DebtPayoffInput {
  readonly debts: readonly Debt[];
  readonly monthlyBudget: Minor;
  readonly strategy: Strategy;
}

/** One debt's activity in one month. */
export interface DebtMonthRow {
  readonly debtId: string;
  readonly openingBalance: Minor;
  readonly interest: Minor;
  readonly payment: Minor;
  /** Payment less interest. NEGATIVE when a minimum does not cover interest. */
  readonly principal: Minor;
  readonly closingBalance: Minor;
}

export interface ScheduleMonth {
  /** 1-based. */
  readonly month: number;
  readonly rows: readonly DebtMonthRow[];
  readonly totalPaid: Minor;
  readonly totalInterest: Minor;
  readonly totalRemaining: Minor;
  /** Debts that reached zero this month, in payoff order. */
  readonly clearedDebtIds: readonly string[];
}

export interface PayoffResult {
  readonly strategy: Strategy;
  readonly schedule: readonly ScheduleMonth[];
  /** Months to clear everything. Equals MAX_MONTHS when `neverPaysOff`. */
  readonly months: number;
  readonly totalPaid: Minor;
  readonly totalInterest: Minor;
  /** Debt ids in the order they were cleared. */
  readonly payoffOrder: readonly string[];
  /**
   * True when a balance remains after MAX_MONTHS — the budget does not cover
   * interest, so the debt grows forever. Reported rather than thrown: it is a
   * real answer to a real question, and the page must say so plainly.
   */
  readonly neverPaysOff: boolean;
}

export interface StrategyComparison {
  readonly avalanche: PayoffResult;
  readonly snowball: PayoffResult;
  /**
   * The do-nothing baseline: each debt's minimum and nothing more.
   *
   * Note that a freed-up minimum is NOT redirected here — that is what makes it
   * the honest baseline. Rolling freed minimums forward is already the snowball
   * effect, and crediting the baseline with it would understate the saving.
   */
  readonly minimumsOnly: PayoffResult;
  /** Whichever of the two strategies costs less interest. */
  readonly best: PayoffResult;
  /** Interest saved by `best` against the minimums-only baseline. */
  readonly interestSavedVsMinimums: Minor;
  /** Months saved by `best` against the minimums-only baseline. */
  readonly monthsSavedVsMinimums: number;
  /** Interest difference between the two strategies. Often small; say so. */
  readonly interestDifferenceBetweenStrategies: Minor;
}

// ── Validation ───────────────────────────────────────────────────────────────

function validate(input: DebtPayoffInput): void {
  const { debts, monthlyBudget } = input;

  if (debts.length === 0) {
    throw new DebtPayoffError('At least one debt is required.');
  }

  const ids = new Set<string>();
  for (const debt of debts) {
    if (ids.has(debt.id)) {
      throw new DebtPayoffError(`Duplicate debt id "${debt.id}".`);
    }
    ids.add(debt.id);

    if (!isPositive(debt.balance)) {
      throw new DebtPayoffError(
        `Debt "${debt.name}" must have a positive balance, received ${debt.balance}.`,
      );
    }
    if (!Number.isFinite(debt.annualRate) || debt.annualRate < 0) {
      throw new DebtPayoffError(
        `Debt "${debt.name}" has an invalid annual rate (${debt.annualRate}).`,
      );
    }
    if (debt.annualRate > MAX_ANNUAL_RATE) {
      throw new DebtPayoffError(
        `Debt "${debt.name}" has an annual rate of ${debt.annualRate} (${debt.annualRate * 100}%), ` +
          `above the ${MAX_ANNUAL_RATE * 100}% ceiling. Rates are decimals: use 0.1999 for 19.99%.`,
      );
    }
    if (debt.minimumPayment < 0) {
      throw new DebtPayoffError(`Debt "${debt.name}" has a negative minimum payment.`);
    }
  }

  const totalMinimums = sum(debts.map((d) => d.minimumPayment));
  if (compare(monthlyBudget, totalMinimums) < 0) {
    throw new DebtPayoffError(
      `Monthly budget (${monthlyBudget}) is below the total of the minimum payments ` +
        `(${totalMinimums}). No schedule exists until the budget covers the minimums.`,
    );
  }
}

// ── Ordering ─────────────────────────────────────────────────────────────────

/**
 * Target order for a strategy.
 *
 * Ties are broken deterministically so the same input always produces the same
 * schedule — a calculator that returns two different answers for one input is
 * worse than one that returns a debatable answer consistently.
 */
export function orderDebts(debts: readonly Debt[], strategy: Strategy): Debt[] {
  const ordered = [...debts];

  switch (strategy) {
    case 'avalanche':
      // Highest rate first; then smallest balance; then id.
      ordered.sort(
        (a, b) =>
          b.annualRate - a.annualRate ||
          compare(a.balance, b.balance) ||
          a.id.localeCompare(b.id),
      );
      break;
    case 'snowball':
      // Smallest balance first; then highest rate; then id.
      ordered.sort(
        (a, b) =>
          compare(a.balance, b.balance) ||
          b.annualRate - a.annualRate ||
          a.id.localeCompare(b.id),
      );
      break;
    case 'minimums-only':
      // No surplus is ever allocated, so order is presentational only.
      ordered.sort((a, b) => a.id.localeCompare(b.id));
      break;
  }

  return ordered;
}

// ── Simulation ───────────────────────────────────────────────────────────────

interface DebtState {
  readonly debt: Debt;
  balance: Minor;
  cleared: boolean;
}

/**
 * Run one strategy to completion.
 *
 * Deterministic, allocation-free of any global state, and guaranteed to
 * terminate: the loop is bounded by MAX_MONTHS regardless of whether the debt
 * ever amortises.
 */
export function simulate(input: DebtPayoffInput): PayoffResult {
  validate(input);

  const { monthlyBudget, strategy } = input;
  const targetOrder = orderDebts(input.debts, strategy);
  const state: DebtState[] = targetOrder.map((debt) => ({
    debt,
    balance: debt.balance,
    cleared: false,
  }));

  const schedule: ScheduleMonth[] = [];
  const payoffOrder: string[] = [];

  let month = 0;

  while (month < MAX_MONTHS && state.some((s) => isPositive(s.balance))) {
    month += 1;

    // 1. Accrue interest on opening balances.
    const opening = state.map((s) => s.balance);
    const interest = state.map((s, i) =>
      s.cleared ? ZERO : scale(opening[i] as Minor, s.debt.annualRate / 12),
    );
    // Amount that would clear the debt outright this month.
    const payoffAmount = state.map((_, i) =>
      add(opening[i] as Minor, interest[i] as Minor),
    );

    // 2. Minimums due, never more than the payoff amount.
    const payments = state.map((s, i) =>
      s.cleared ? ZERO : minOf(s.debt.minimumPayment, payoffAmount[i] as Minor),
    );

    let surplus = subtract(monthlyBudget, sum(payments));

    // Minimums only decrease as balances fall, so validate() covers month one;
    // this guards the invariant for every later month.
    if (surplus < 0) {
      throw new DebtPayoffError(
        `Month ${month}: minimum payments exceed the monthly budget. This should be ` +
          'unreachable — minimums are non-increasing. Please report it.',
      );
    }

    // 3. Allocate surplus down the target order, cascading past cleared debts.
    if (strategy !== 'minimums-only') {
      for (let i = 0; i < state.length && isPositive(surplus); i += 1) {
        const s = state[i] as DebtState;
        if (s.cleared) continue;
        const outstanding = subtract(payoffAmount[i] as Minor, payments[i] as Minor);
        if (!isPositive(outstanding)) continue;
        const extra = minOf(surplus, outstanding);
        payments[i] = add(payments[i] as Minor, extra);
        surplus = subtract(surplus, extra);
      }
    }

    // 4. Settle the month.
    const rows: DebtMonthRow[] = [];
    const clearedThisMonth: string[] = [];

    for (let i = 0; i < state.length; i += 1) {
      const s = state[i] as DebtState;
      const openingBalance = opening[i] as Minor;
      const monthInterest = interest[i] as Minor;
      const payment = payments[i] as Minor;
      const closing = clampAtZero(subtract(payoffAmount[i] as Minor, payment));

      s.balance = closing;
      if (!s.cleared && !isPositive(closing) && isPositive(openingBalance)) {
        s.cleared = true;
        clearedThisMonth.push(s.debt.id);
        payoffOrder.push(s.debt.id);
      }

      rows.push({
        debtId: s.debt.id,
        openingBalance,
        interest: monthInterest,
        payment,
        principal: subtract(payment, monthInterest),
        closingBalance: closing,
      });
    }

    schedule.push({
      month,
      rows,
      totalPaid: sum(rows.map((r) => r.payment)),
      totalInterest: sum(rows.map((r) => r.interest)),
      totalRemaining: sum(rows.map((r) => r.closingBalance)),
      clearedDebtIds: clearedThisMonth,
    });
  }

  const neverPaysOff = state.some((s) => isPositive(s.balance));

  return {
    strategy,
    schedule,
    months: schedule.length,
    totalPaid: sum(schedule.map((m) => m.totalPaid)),
    totalInterest: sum(schedule.map((m) => m.totalInterest)),
    payoffOrder,
    neverPaysOff,
  };
}

// ── Comparison ───────────────────────────────────────────────────────────────

/**
 * Run both strategies plus the do-nothing baseline.
 *
 * The comparison IS the product (CLAUDE.md rule 10): a single payoff date is
 * something a chatbot produces instantly. Two schedules set against a baseline,
 * with the difference quantified, is not.
 */
export function compareStrategies(
  debts: readonly Debt[],
  monthlyBudget: Minor,
): StrategyComparison {
  const avalanche = simulate({ debts, monthlyBudget, strategy: 'avalanche' });
  const snowball = simulate({ debts, monthlyBudget, strategy: 'snowball' });

  // The baseline pays minimums only, so the budget above them is irrelevant.
  const minimumsOnly = simulate({
    debts,
    monthlyBudget: sum(debts.map((d) => d.minimumPayment)),
    strategy: 'minimums-only',
  });

  const best =
    compare(avalanche.totalInterest, snowball.totalInterest) <= 0 ? avalanche : snowball;

  // A baseline that never clears has no meaningful saving to quote against.
  const interestSavedVsMinimums = minimumsOnly.neverPaysOff
    ? ZERO
    : clampAtZero(subtract(minimumsOnly.totalInterest, best.totalInterest));

  const monthsSavedVsMinimums = minimumsOnly.neverPaysOff
    ? 0
    : Math.max(0, minimumsOnly.months - best.months);

  const interestDifferenceBetweenStrategies = absolute(
    subtract(avalanche.totalInterest, snowball.totalInterest),
  );

  return {
    avalanche,
    snowball,
    minimumsOnly,
    best,
    interestSavedVsMinimums,
    monthsSavedVsMinimums,
    interestDifferenceBetweenStrategies,
  };
}
