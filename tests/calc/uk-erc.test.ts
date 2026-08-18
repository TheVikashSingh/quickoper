import { describe, expect, it } from 'vitest';

import {
  JURISDICTION,
  UkErcError,
  allowanceFor,
  calculateUkErc,
  chargeFor,
} from '../../src/lib/calc/uk-erc';
import { fromMajor, toMajor } from '../../src/lib/calc/money';

/**
 * ANCHORING, STATED PLAINLY (rule 3, and D63's warning against pretending).
 *
 * This module has two halves and they are anchored differently.
 *
 * THE CHARGE is a percentage of an amount: 3% of £15,000 is £450. There is no
 * schedule to anchor and nothing a third party could publish that a reader
 * could not verify by multiplying. It is asserted exactly here and checkable in
 * one keystroke.
 *
 * THE SAVING comes entirely from mortgage.ts, which IS anchored to a published
 * third-party schedule — calculator.net's $2,066.16 (D39). This module walks no
 * schedule of its own, so the convention that matters (nominal annual rate over
 * twelve, half-up on the minor unit every period) is validated there and
 * inherited here rather than re-asserted.
 *
 * Every expected value below was read off a failing assertion, never predicted,
 * and every one is exact (D7).
 *
 * THE SCENARIO IS ILLUSTRATIVE, NOT QUOTED. £250,000 at 4.5% with three years
 * left of a fix, a 10% allowance and a 3% charge. Those are plausible shapes for
 * a UK deal and they are NOT market data — nothing in this repository quotes a
 * lender's terms, because CLAUDE.md forbids inventing one and we have no
 * citable source for any particular lender's numbers.
 */
const BALANCE = fromMajor(250_000);
const RATE = 0.045;
const TERM = 300;
const FIXED = 36;

const base = {
  balance: BALANCE,
  annualRate: RATE,
  remainingMonths: TERM,
  fixedPeriodMonths: FIXED,
  allowancePercent: 10,
  ercPercent: 3,
};

describe('jurisdiction registration (rule 13)', () => {
  it('declares itself rather than being switched on', () => {
    expect(JURISDICTION.id).toBe('uk');
    expect(JURISDICTION.currency).toBe('GBP');
    expect(JURISDICTION.locale).toBe('en-GB');
  });
});

describe('allowanceFor', () => {
  it('is a percentage of the balance, rounded once on the penny', () => {
    expect(toMajor(allowanceFor(BALANCE, 10))).toBe(25000);
    expect(toMajor(allowanceFor(BALANCE, 0))).toBe(0);
    // A balance that does not divide cleanly still rounds half-up on the penny.
    expect(toMajor(allowanceFor(fromMajor(123_456.78), 10))).toBe(12345.68);
  });
});

describe('chargeFor', () => {
  it('charges only the amount above the allowance', () => {
    const allowance = fromMajor(25_000);

    const under = chargeFor(fromMajor(10_000), allowance, 3);
    expect(toMajor(under.withinAllowance)).toBe(10000);
    expect(toMajor(under.chargeable)).toBe(0);
    expect(toMajor(under.charge)).toBe(0);

    const over = chargeFor(fromMajor(40_000), allowance, 3);
    expect(toMajor(over.withinAllowance)).toBe(25000);
    expect(toMajor(over.chargeable)).toBe(15000);
    // 3% of £15,000. Checkable by multiplication, which is the point.
    expect(toMajor(over.charge)).toBe(450);
  });

  it('charges exactly nothing at the allowance boundary', () => {
    const allowance = fromMajor(25_000);
    const at = chargeFor(fromMajor(25_000), allowance, 3);
    expect(at.chargeable).toBe(0);
    expect(at.charge).toBe(0);
  });
});

describe('calculateUkErc — the illustrative deal', () => {
  it('reports the contractual payment for the remaining term', () => {
    const r = calculateUkErc({ ...base, overpayment: fromMajor(25_000) });
    expect(toMajor(r.contractualPayment)).toBe(1389.58);
  });

  it('costs nothing inside the allowance, and still removes interest', () => {
    const r = calculateUkErc({ ...base, overpayment: fromMajor(10_000) });
    expect(toMajor(r.charge)).toBe(0);
    expect(toMajor(r.interestSavedOverFixedPeriod)).toBe(1399.75);
    expect(toMajor(r.interestSavedOverRemainingTerm)).toBe(19477.74);
    expect(r.monthsSaved).toBe(21);
  });

  it('separates the contractual horizon from the assumed one', () => {
    /**
     * The tool's reason to exist. Over the 36 months that are actually fixed,
     * the saving is £5,598.91 and rests on no assumption. Over the full 300
     * months it is £66,028.22 and assumes a rate that expires in three years.
     * A tool quoting only the larger number would be quoting a forecast.
     */
    const r = calculateUkErc({ ...base, overpayment: fromMajor(40_000) });

    expect(toMajor(r.chargeable)).toBe(15000);
    expect(toMajor(r.charge)).toBe(450);

    expect(toMajor(r.interestSavedOverFixedPeriod)).toBe(5598.91);
    expect(toMajor(r.interestSavedOverRemainingTerm)).toBe(66028.22);

    expect(toMajor(r.netOverFixedPeriod)).toBe(5148.91);
    expect(toMajor(r.netOverRemainingTerm)).toBe(65578.22);

    // The assumed horizon is always the larger of the two, by construction.
    expect(r.interestSavedOverRemainingTerm).toBeGreaterThan(
      r.interestSavedOverFixedPeriod,
    );
  });

  it('reports no break-even when the saving never falls behind the charge', () => {
    // At 4.5% over three fixed years, a pound saves far more than a 3% charge
    // costs it. Reporting some finite number here would be false, so it is null.
    const r = calculateUkErc({ ...base, overpayment: fromMajor(40_000) });
    expect(r.breakEvenOverpayment).toBeNull();
  });
});

describe('calculateUkErc — when the charge wins', () => {
  const punishing = {
    balance: BALANCE,
    annualRate: 0.015,
    remainingMonths: TERM,
    fixedPeriodMonths: 6,
    allowancePercent: 10,
    ercPercent: 5,
  };

  it('reports a negative net over the fixed period', () => {
    const r = calculateUkErc({ ...punishing, overpayment: fromMajor(50_000) });
    expect(toMajor(r.charge)).toBe(1250);
    expect(toMajor(r.interestSavedOverFixedPeriod)).toBe(313.29);
    expect(toMajor(r.netOverFixedPeriod)).toBe(-936.71);
  });

  it('finds the exact break-even, and the penny either side proves it', () => {
    /**
     * A self-verifying assertion. If the bisection is wrong, this fails — the
     * answer is only correct if the net is still non-negative AT it and
     * negative ONE PENNY past it. Asserting the number alone would prove
     * nothing about the search that produced it.
     */
    const r = calculateUkErc({ ...punishing, overpayment: fromMajor(50_000) });
    const breakEven = r.breakEvenOverpayment;
    expect(breakEven).not.toBeNull();
    expect(toMajor(breakEven!)).toBe(28581.69);

    const at = calculateUkErc({ ...punishing, overpayment: breakEven! });
    expect(at.netOverFixedPeriod).toBeGreaterThanOrEqual(0);

    const onePennyMore = calculateUkErc({
      ...punishing,
      overpayment: (breakEven! + 1) as typeof breakEven & number,
    });
    expect(onePennyMore.netOverFixedPeriod).toBeLessThan(0);
  });
});

describe('direction invariants (D55)', () => {
  it('a larger overpayment never removes less interest', () => {
    let previous = -1;
    for (const amount of [0, 5_000, 25_000, 25_001, 50_000, 100_000, 200_000]) {
      const r = calculateUkErc({ ...base, overpayment: fromMajor(amount) });
      expect(r.interestSavedOverRemainingTerm).toBeGreaterThanOrEqual(previous);
      previous = r.interestSavedOverRemainingTerm;
    }
  });

  it('a larger charge percentage never reduces the charge', () => {
    let previous = -1;
    for (const erc of [0, 1, 2, 3, 5, 10]) {
      const r = calculateUkErc({
        ...base,
        ercPercent: erc,
        overpayment: fromMajor(50_000),
      });
      expect(r.charge).toBeGreaterThanOrEqual(previous);
      previous = r.charge;
    }
  });

  it('overpaying nothing is exactly a no-op (D39)', () => {
    const r = calculateUkErc({ ...base, overpayment: fromMajor(0) });
    expect(r.charge).toBe(0);
    expect(r.interestSavedOverFixedPeriod).toBe(0);
    expect(r.interestSavedOverRemainingTerm).toBe(0);
    expect(r.netOverFixedPeriod).toBe(0);
    expect(r.netOverRemainingTerm).toBe(0);
    expect(r.monthsSaved).toBe(0);
  });

  it('a longer remaining fix never removes less interest within it', () => {
    let previous = -1;
    for (const fixedPeriodMonths of [1, 6, 12, 24, 36, 60]) {
      const r = calculateUkErc({
        ...base,
        fixedPeriodMonths,
        overpayment: fromMajor(40_000),
      });
      expect(r.interestSavedOverFixedPeriod).toBeGreaterThanOrEqual(previous);
      previous = r.interestSavedOverFixedPeriod;
    }
  });
});

describe('input validation', () => {
  const bad = (patch: Record<string, unknown>) => () =>
    calculateUkErc({ ...base, overpayment: fromMajor(10_000), ...patch } as never);

  it('rejects inputs that cannot describe a real mortgage', () => {
    expect(bad({ balance: fromMajor(0) })).toThrow(UkErcError);
    expect(bad({ annualRate: -0.01 })).toThrow(UkErcError);
    expect(bad({ remainingMonths: 0 })).toThrow(UkErcError);
    expect(bad({ remainingMonths: 1.5 })).toThrow(UkErcError);
    expect(bad({ remainingMonths: 601 })).toThrow(UkErcError);
    expect(bad({ fixedPeriodMonths: 0 })).toThrow(UkErcError);
  });

  it('refuses a fixed period that outlasts the mortgage', () => {
    expect(bad({ fixedPeriodMonths: TERM + 1 })).toThrow(UkErcError);
  });

  it('refuses percentages outside 0-100 and impossible overpayments', () => {
    expect(bad({ allowancePercent: -1 })).toThrow(UkErcError);
    expect(bad({ allowancePercent: 101 })).toThrow(UkErcError);
    expect(bad({ ercPercent: -1 })).toThrow(UkErcError);
    expect(bad({ ercPercent: 101 })).toThrow(UkErcError);
    expect(bad({ overpayment: fromMajor(-1) })).toThrow(UkErcError);
    expect(bad({ overpayment: fromMajor(250_001) })).toThrow(UkErcError);
  });
});
