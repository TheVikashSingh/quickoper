/**
 * Mortgage overpayment — what paying extra actually removes from a schedule.
 *
 * Pure functions. No DOM, no framework, no imports outside calc/ (CLAUDE.md
 * rule 1). The island renders these; it never computes.
 *
 * ── ROUNDING POLICY (rule 3), stated here and enforced by fixtures ──────────
 *
 * WHERE:      every month, never only at the end. A lender charges a whole
 *             number of cents each month and carries it forward; a schedule
 *             that keeps full precision and rounds once at the end will not
 *             match any statement ever issued.
 * DIRECTION:  half away from zero, on the minor unit, via money.ts. The same
 *             convention as debt-payoff.ts.
 * FINAL:      the last payment is ADJUSTED to clear exactly what remains —
 *             down when the balance is smaller than a payment, and up when a
 *             rounded payment left a residue. Both directions are real.
 *
 *             The upward case is why the contractual term is a hard stop. The
 *             payment is rounded to the cent, so it is a hair below the exact
 *             amortising figure ($2,066.16 against $2,066.1633), and left to
 *             run it would need a 361st payment of a few dollars. No lender
 *             writes a 30-year loan that takes 361 months; they collect the
 *             residue in month 360. A schedule that reported 361 would be
 *             arithmetically defensible and wrong about the product.
 *
 * ── COMPOUNDING ────────────────────────────────────────────────────────────
 *
 * `annualRate / 12`, matching debt-payoff.ts and NOT coast-fire.ts. A mortgage
 * rate is a lender's nominal annual rate, defined as twelve times the monthly
 * rate it charges — dividing recovers exactly what the contract says. Taking
 * the twelfth root here would be wrong for the same reason it is right for an
 * investment return (D6, and /monthly-return-rate explains it publicly).
 *
 * US fixed-rate convention. Interest-only periods, offset accounts and UK-style
 * early repayment charges are different products with different rules and are
 * deliberately not modelled — see the assumptions on the page.
 */

import {
  ZERO,
  add,
  fromMajor,
  minor,
  roundToInteger,
  subtract,
  type Minor,
} from './money';

/** A schedule longer than this is not a mortgage; it is a bug. */
export const MAX_MONTHS = 600;

export class MortgageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MortgageError';
  }
}

export interface MortgageInput {
  /** Amount borrowed, after any deposit. */
  readonly principal: Minor;
  /** Nominal annual rate as a fraction: 6.706% is 0.06706. */
  readonly annualRate: number;
  /** Contractual term in months. 30 years is 360. */
  readonly termMonths: number;
  /** Extra paid every month on top of the contractual payment. */
  readonly monthlyOverpayment: Minor;
}

export interface MortgageMonth {
  readonly month: number;
  readonly openingBalance: Minor;
  readonly interest: Minor;
  readonly principalPaid: Minor;
  readonly payment: Minor;
  readonly closingBalance: Minor;
  /** Interest charged from month 1 to this month inclusive. */
  readonly interestToDate: Minor;
}

export interface MortgageResult {
  /** The contractual monthly payment, before any overpayment. */
  readonly contractualPayment: Minor;
  readonly schedule: readonly MortgageMonth[];
  readonly months: number;
  readonly totalInterest: Minor;
  readonly totalPaid: Minor;
}

export interface OverpaymentComparison {
  readonly baseline: MortgageResult;
  readonly overpaid: MortgageResult;
  /** Months removed from the schedule. Zero when not overpaying. */
  readonly monthsSaved: number;
  /** Interest removed from the schedule. Zero when not overpaying. */
  readonly interestSaved: Minor;
}

/**
 * The standard amortising payment, rounded to the cent.
 *
 *   M = P · i · (1 + i)^n / ((1 + i)^n − 1)
 *
 * Half away from zero, on the cent — the same convention as every other figure
 * here, and the one that reproduces the published payment. Rounding UP was
 * written first and is wrong by a cent: $320,000 at 6.706% over 360 months is
 * $2,066.1633, which rounds up to $2,066.17 and half-up to $2,066.16. Every
 * published source gives $2,066.16.
 *
 * A payment rounded to the cent cannot retire the principal to exactly zero, so
 * a small residue lands in the final month. That is what the FINAL rule above
 * exists for, and it is what a real schedule does.
 *
 * A zero rate is not a division-by-zero special case to be apologised for — an
 * interest-free loan amortises linearly, and that is what the branch computes.
 */
export function contractualPayment(
  principal: Minor,
  annualRate: number,
  termMonths: number,
): Minor {
  if (termMonths <= 0) {
    throw new MortgageError('Term must be at least one month.');
  }
  if (principal <= 0) {
    throw new MortgageError('Loan amount must be more than zero.');
  }

  const i = annualRate / 12;

  if (i === 0) {
    return minor(roundToInteger(principal / termMonths, 'half-up'));
  }

  const growth = Math.pow(1 + i, termMonths);
  const exact = (principal * i * growth) / (growth - 1);

  return minor(roundToInteger(exact, 'half-up'));
}

/**
 * Walk the schedule month by month.
 *
 * Iterative rather than closed-form on purpose. A closed form gives the term
 * and the total, but not the row-by-row table that is the actual product, and
 * it cannot express a payment that changes or a final payment that shrinks.
 */
function amortise(
  principal: Minor,
  annualRate: number,
  payment: Minor,
  /**
   * The contractual term. On this month the payment clears whatever is left,
   * however small or large — see the FINAL rule in the header. Omitted for an
   * overpaid schedule, which is supposed to finish early on its own.
   */
  termCap?: number,
): { schedule: MortgageMonth[]; totalInterest: Minor; totalPaid: Minor } {
  const i = annualRate / 12;
  const schedule: MortgageMonth[] = [];

  let balance = principal;
  let totalInterest = ZERO;
  let totalPaid = ZERO;
  let month = 0;

  while (balance > 0 && month < MAX_MONTHS) {
    month += 1;

    // Rounded here, every month, before anything else uses it.
    const interest = minor(roundToInteger(balance * i, 'half-up'));

    // The final payment is whatever is left plus this month's interest — never
    // the full contractual amount, and never one cent short of clearing it.
    const due = add(balance, interest);
    const lastMonth = termCap !== undefined && month >= termCap;
    const actual = payment >= due || lastMonth ? due : payment;

    const principalPaid = subtract(actual, interest);
    const closing = subtract(balance, principalPaid);

    totalInterest = add(totalInterest, interest);
    totalPaid = add(totalPaid, actual);

    schedule.push({
      month,
      openingBalance: balance,
      interest,
      principalPaid,
      payment: actual,
      closingBalance: closing,
      interestToDate: totalInterest,
    });

    balance = closing;
  }

  return { schedule, totalInterest, totalPaid };
}

/**
 * A payment that does not cover the first month's interest never retires the
 * loan — the balance grows for ever. Reported as an error rather than returned
 * as a 600-month schedule, because for a mortgage it means the inputs are
 * wrong, not that the answer is "a long time".
 */
function assertPaymentClears(principal: Minor, annualRate: number, payment: Minor): void {
  const firstInterest = minor(roundToInteger((principal * annualRate) / 12, 'half-up'));
  if (payment <= firstInterest) {
    throw new MortgageError(
      'That payment does not cover the first month of interest, so the balance would never fall.',
    );
  }
}

export function calculateMortgage(input: MortgageInput): MortgageResult {
  const { principal, annualRate, termMonths } = input;

  if (annualRate < 0) {
    throw new MortgageError('Interest rate cannot be negative.');
  }
  if (termMonths > MAX_MONTHS) {
    throw new MortgageError(`Term cannot exceed ${MAX_MONTHS} months.`);
  }

  const payment = contractualPayment(principal, annualRate, termMonths);
  assertPaymentClears(principal, annualRate, payment);

  const { schedule, totalInterest, totalPaid } = amortise(
    principal,
    annualRate,
    payment,
    termMonths,
  );

  return {
    contractualPayment: payment,
    schedule,
    months: schedule.length,
    totalInterest,
    totalPaid,
  };
}

/**
 * The whole point of the tool: the same loan, with and without the extra, side
 * by side. Rule 10 requires a comparison against the do-nothing baseline, and
 * here the baseline is the contract the borrower already signed.
 */
export function compareOverpayment(input: MortgageInput): OverpaymentComparison {
  const baseline = calculateMortgage({ ...input, monthlyOverpayment: ZERO });

  if (input.monthlyOverpayment < 0) {
    throw new MortgageError('Overpayment cannot be negative.');
  }

  const overpaidPayment = add(baseline.contractualPayment, input.monthlyOverpayment);

  // The cap is passed here too, and it matters in exactly one case: an
  // overpayment of zero. Without it that schedule runs to 361 months while the
  // baseline stops at 360, and "paying nothing extra" reports saving minus one
  // cent. Overpaying anything at all finishes long before the cap, so it never
  // binds — but a comparison whose no-op case is not a no-op is broken.
  const walked = amortise(
    input.principal,
    input.annualRate,
    overpaidPayment,
    input.termMonths,
  );

  const overpaid: MortgageResult = {
    contractualPayment: baseline.contractualPayment,
    schedule: walked.schedule,
    months: walked.schedule.length,
    totalInterest: walked.totalInterest,
    totalPaid: walked.totalPaid,
  };

  return {
    baseline,
    overpaid,
    monthsSaved: baseline.months - overpaid.months,
    interestSaved: subtract(baseline.totalInterest, overpaid.totalInterest),
  };
}

/** Balances by month, oldest first, for the chart. Includes the opening. */
export function balanceSeries(result: MortgageResult): Minor[] {
  const first = result.schedule[0];
  if (first === undefined) return [];
  return [first.openingBalance, ...result.schedule.map((m) => m.closingBalance)];
}

/** Convenience for callers holding major units. */
export const loanFromMajor = (amount: number): Minor => fromMajor(amount);
