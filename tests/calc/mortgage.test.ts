import { describe, expect, it } from 'vitest';

import {
  MortgageError,
  balanceSeries,
  calculateMortgage,
  compareLumpSum,
  compareOverpayment,
  contractualPayment,
} from '../../src/lib/calc/mortgage';
import { ZERO, fromMajor, toMajor } from '../../src/lib/calc/money';

/**
 * THE ANCHOR (D7).
 *
 * $400,000 home, 20% down, so $320,000 borrowed, 30 years at 6.706%.
 *
 * calculator.net's mortgage calculator publishes, for exactly these inputs:
 *
 *   Monthly payment                $2,066.16
 *   Total of 360 payments        $743,818.78
 *   Total interest               $423,818.78
 *
 * Retrieved 2026-08-08 from https://www.calculator.net/mortgage-calculator.html
 * (rate taken from their own "Latest Mortgage Rates: 30 Years 6.706%").
 *
 * This is a competitor's published output, not a formula we derived — which is
 * the entire point of D7. If our engine agrees with it, that is evidence from
 * outside this codebase.
 */
const PRINCIPAL = fromMajor(320_000);
const RATE = 0.06706;
const TERM = 360;

describe('contractualPayment', () => {
  it('reproduces the published monthly payment exactly', () => {
    // Their figure, to the cent. Half-up, not rounded up: the exact value is
    // $2,066.1633, which rounds UP to $2,066.17 and half-up to $2,066.16.
    expect(toMajor(contractualPayment(PRINCIPAL, RATE, TERM))).toBe(2066.16);
  });

  it('amortises linearly at a zero rate rather than dividing by zero', () => {
    expect(toMajor(contractualPayment(fromMajor(12_000), 0, 12))).toBe(1000);
  });

  it('refuses a term of zero months', () => {
    expect(() => contractualPayment(PRINCIPAL, RATE, 0)).toThrow(MortgageError);
  });

  it('refuses a loan of nothing', () => {
    expect(() => contractualPayment(ZERO, RATE, TERM)).toThrow(MortgageError);
  });
});

describe('calculateMortgage', () => {
  const result = calculateMortgage({
    principal: PRINCIPAL,
    annualRate: RATE,
    termMonths: TERM,
    monthlyOverpayment: ZERO,
  });

  it('clears the loan within the contractual term', () => {
    expect(result.months).toBe(360);
  });

  /**
   * WHERE WE DIFFER FROM calculator.net, AND WHY.
   *
   * They report $423,818.78 of interest. We report $423,821.51 — $2.73 MORE.
   *
   * The cause is stated, not hand-waved: they compute from the UNROUNDED
   * payment ($2,066.163273) carried at full precision across 360 months, which
   * is why their "total of 360 payments" is $743,818.78 rather than
   * $2,066.16 × 360 = $743,817.60. We charge the rounded payment a lender
   * actually collects — a hair lower — so slightly less principal is retired
   * each month and slightly more interest accrues, with the residue collected
   * in month 360.
   *
   * Ours being HIGHER is the direction that makes sense: a payment rounded down
   * pays the loan off marginally more slowly. $2.73 over thirty years is under
   * a cent a month.
   *
   * Asserted exactly rather than within a tolerance: if this moves, the cause
   * is a change to the rounding policy, and that should have to be justified.
   */
  it('differs from the published total by a stated, bounded amount', () => {
    expect(toMajor(result.totalInterest)).toBe(423_821.51);

    const published = 423_818.78;
    expect(toMajor(result.totalInterest) - published).toBeCloseTo(2.73, 2);
  });

  it('adjusts the final payment to clear the balance exactly', () => {
    const last = result.schedule[result.schedule.length - 1];
    if (last === undefined) throw new Error('empty schedule');

    expect(last.closingBalance).toBe(0);

    // LARGER than a normal payment here, not smaller. The contractual payment
    // is rounded a hair below the exact amortising figure, so month 360
    // collects the residue rather than a 361st payment existing at all.
    // See the FINAL rule in mortgage.ts.
    expect(last.payment).toBeGreaterThan(result.contractualPayment);
    expect(toMajor(last.payment)).toBe(2070.07);
  });

  it('never lets a rounding error leave a balance behind', () => {
    for (const month of result.schedule) {
      expect(month.closingBalance).toBeGreaterThanOrEqual(0);
    }
  });

  it('charges interest on the opening balance, month by month', () => {
    const first = result.schedule[0];
    if (first === undefined) throw new Error('empty schedule');

    // $320,000 × 6.706% ÷ 12 = $1,788.27 (half-up on the cent).
    expect(toMajor(first.interest)).toBe(1788.27);
    expect(first.openingBalance).toBe(PRINCIPAL);
  });

  it('keeps a running interest total that matches the sum of the rows', () => {
    const last = result.schedule[result.schedule.length - 1];
    if (last === undefined) throw new Error('empty schedule');
    expect(last.interestToDate).toBe(result.totalInterest);
  });

  it('refuses a negative rate', () => {
    expect(() =>
      calculateMortgage({
        principal: PRINCIPAL,
        annualRate: -0.01,
        termMonths: TERM,
        monthlyOverpayment: ZERO,
      }),
    ).toThrow(MortgageError);
  });
});

describe('compareOverpayment', () => {
  const comparison = compareOverpayment({
    principal: PRINCIPAL,
    annualRate: RATE,
    termMonths: TERM,
    monthlyOverpayment: fromMajor(200),
  });

  /**
   * The figures the tool exists to produce. Asserted exactly: a loose bound
   * here would absorb precisely the regression that matters, which is the
   * lesson D7 records from two earlier drafts.
   */
  it('removes 80 months and the stated interest for $200 a month', () => {
    expect(comparison.monthsSaved).toBe(80);
    expect(toMajor(comparison.interestSaved)).toBe(110_890.56);
  });

  it('leaves the contractual payment untouched', () => {
    expect(toMajor(comparison.overpaid.contractualPayment)).toBe(2066.16);
  });

  it('finishes sooner than the baseline, never later', () => {
    expect(comparison.overpaid.months).toBeLessThan(comparison.baseline.months);
  });

  it('is a no-op when nothing extra is paid', () => {
    const none = compareOverpayment({
      principal: PRINCIPAL,
      annualRate: RATE,
      termMonths: TERM,
      monthlyOverpayment: ZERO,
    });
    expect(none.monthsSaved).toBe(0);
    expect(none.interestSaved).toBe(0);
  });

  it('refuses a negative overpayment', () => {
    expect(() =>
      compareOverpayment({
        principal: PRINCIPAL,
        annualRate: RATE,
        termMonths: TERM,
        monthlyOverpayment: fromMajor(-50),
      }),
    ).toThrow(MortgageError);
  });
});

describe('balanceSeries', () => {
  it('opens at the principal and closes at zero', () => {
    const result = calculateMortgage({
      principal: PRINCIPAL,
      annualRate: RATE,
      termMonths: TERM,
      monthlyOverpayment: ZERO,
    });
    const series = balanceSeries(result);

    expect(series[0]).toBe(PRINCIPAL);
    expect(series[series.length - 1]).toBe(0);
    // One opening balance plus one closing balance per month.
    expect(series).toHaveLength(result.months + 1);
  });
});

/**
 * compareLumpSum — one extra payment, once, in a month you choose.
 *
 * EVERY EXPECTED VALUE HERE WAS READ OFF A FAILING ASSERTION (D7's technique),
 * not predicted. They are exact, never tolerances, for the reason D7 gives: a
 * loose bound absorbs the rounding regression it exists to catch.
 *
 * The anchor is inherited rather than restated. The baseline these figures are
 * differences against is the same $320,000 at 6.706% over 360 months that
 * reproduces calculator.net's published $2,066.16 payment to the cent, asserted
 * at the top of this file. A saving is only as trustworthy as the schedule it
 * is subtracted from.
 *
 * Reproducible in a spreadsheet by the method on /verify: build the 360-row
 * amortisation, add the lump to one month's payment, and difference the
 * interest columns.
 */
describe('compareLumpSum', () => {
  const LUMP = fromMajor(5_000);
  const loan = {
    principal: PRINCIPAL,
    annualRate: RATE,
    termMonths: TERM,
    monthlyOverpayment: ZERO,
  };

  it('saves far more in month 1 than the same lump in month 241', () => {
    const early = compareLumpSum(loan, LUMP, 1);
    const late = compareLumpSum(loan, LUMP, 241);

    expect(toMajor(early.interestSaved)).toBe(30332.98);
    expect(early.monthsSaved).toBe(17);

    expect(toMajor(late.interestSaved)).toBe(4604.94);
    expect(late.monthsSaved).toBe(4);
  });

  it('is worth less the longer it is left — swept across the term', () => {
    // The page's whole claim. Monotonic, not merely "bigger at the ends".
    const months = [1, 61, 121, 181, 241, 301];
    const saved = months.map((m) => compareLumpSum(loan, LUMP, m).interestSaved);

    for (let n = 1; n < saved.length; n += 1) {
      expect(saved[n]!).toBeLessThan(saved[n - 1]!);
    }
  });

  it('a lump of zero is exactly a no-op (D39)', () => {
    // The regression D39 records: a comparison whose no-op is not a no-op is
    // broken. Without the term cap this reports minus one cent.
    const none = compareLumpSum(loan, ZERO, 1);
    expect(none.interestSaved).toBe(0);
    expect(none.monthsSaved).toBe(0);
    expect(none.overpaid.months).toBe(TERM);
  });

  it('never costs more interest than the baseline, at any month', () => {
    for (const m of [1, 2, 180, 359, 360]) {
      const r = compareLumpSum(loan, LUMP, m);
      expect(r.overpaid.totalInterest).toBeLessThanOrEqual(r.baseline.totalInterest);
      expect(r.interestSaved).toBeGreaterThanOrEqual(0);
    }
  });

  it('rejects inputs that cannot describe a real payment', () => {
    expect(() => compareLumpSum(loan, fromMajor(-1), 1)).toThrow(MortgageError);
    expect(() => compareLumpSum(loan, LUMP, 0)).toThrow(MortgageError);
    expect(() => compareLumpSum(loan, LUMP, 1.5)).toThrow(MortgageError);
    expect(() => compareLumpSum(loan, LUMP, TERM + 1)).toThrow(MortgageError);
  });
});
