import { describe, expect, it } from 'vitest';
import {
  DebtPayoffError,
  MAX_MONTHS,
  compareStrategies,
  orderDebts,
  simulate,
  type Debt,
} from '../../src/lib/calc/debt-payoff';
import { fromMajor, minor, sum, toMajor, type Minor } from '../../src/lib/calc/money';

/**
 * Fixtures for the debt payoff engine.
 *
 * The headline fixture ties this engine to a figure that exists outside our own
 * code. Every other assertion here is derived from our own arithmetic, so on its
 * own it would only prove the engine is self-consistent — not that it is right.
 */

const debt = (
  id: string,
  balanceMajor: number,
  annualRate: number,
  minimumMajor: number,
): Debt => ({
  id,
  name: id,
  balance: fromMajor(balanceMajor),
  annualRate,
  minimumPayment: fromMajor(minimumMajor),
});

describe('external cross-check: standard amortisation', () => {
  /**
   * SOURCE (published, independently derivable):
   *
   * The standard loan payment formula, P = B·i / (1 − (1+i)^−n), is the figure
   * every lender, textbook and amortisation table quotes. For a $10,000 loan at
   * 6.00% nominal annual interest over 60 months:
   *
   *   i = 0.06 / 12 = 0.005
   *   (1.005)^60    = 1.3488501525...
   *   P = 10000 × 0.005 / (1 − 1/1.3488501525) = 50 / 0.2586279... = 193.3280
   *   → the universally published monthly payment of $193.33
   *
   * Paying exactly $193.33 must therefore clear the balance in exactly 60
   * months, with a slightly reduced final payment because $193.33 is a fraction
   * of a cent more than the exact figure.
   *
   * This is the fixture flagged as outstanding in PR #2. It anchors the engine
   * to an external published figure rather than to our own output.
   */
  const loan: Debt = {
    id: 'loan',
    name: '$10,000 at 6% over 5 years',
    balance: fromMajor(10_000),
    annualRate: 0.06,
    minimumPayment: fromMajor(193.33),
  };

  const result = simulate({
    debts: [loan],
    monthlyBudget: fromMajor(193.33),
    strategy: 'avalanche',
  });

  it('clears in exactly the 60 months the published payment implies', () => {
    expect(result.neverPaysOff).toBe(false);
    expect(result.months).toBe(60);
  });

  it('matches a hand-computed first month to the cent', () => {
    const first = result.schedule[0]?.rows[0];
    // interest  = 1,000,000 × 0.005            = 5,000 minor = $50.00
    // principal = 19,333 − 5,000               = 14,333 minor = $143.33
    // closing   = 1,000,000 + 5,000 − 19,333   = 985,667 minor = $9,856.67
    expect(first?.openingBalance).toBe(1_000_000);
    expect(first?.interest).toBe(5_000);
    expect(first?.payment).toBe(19_333);
    expect(first?.principal).toBe(14_333);
    expect(first?.closingBalance).toBe(985_667);
  });

  it('reduces the final payment instead of overpaying', () => {
    const final = result.schedule[result.months - 1]?.rows[0];
    expect(final?.closingBalance).toBe(0);
    expect(final?.payment).toBeLessThan(19_333);
  });

  it('matches the closed-form total interest exactly', () => {
    // Closed form: 60 × 193.3280 − 10,000 = $1,599.68 of interest.
    //
    // Per-period rounding could in principle drift a few cents from this over
    // five years. It does not — the iterative schedule agrees to the cent. That
    // is asserted exactly rather than within a tolerance: a loose bound would
    // silently absorb a real regression in the rounding policy, which is the
    // one thing this project cannot afford to get wrong quietly.
    expect(result.totalInterest).toBe(fromMajor(1599.68));
    expect(result.totalPaid).toBe(fromMajor(11_599.68));
  });

  it('reconciles the final month by hand', () => {
    // Month 59 closes at $192.25. Interest on that is 192.25 × 0.005 = $0.96125,
    // which rounds half-up to $0.96, so the payoff figure is $193.21 — and that
    // is what the final payment must be, not the full $193.33.
    expect(result.schedule[58]?.rows[0]?.closingBalance).toBe(fromMajor(192.25));
    expect(result.schedule[59]?.rows[0]?.interest).toBe(fromMajor(0.96));
    expect(result.schedule[59]?.rows[0]?.payment).toBe(fromMajor(193.21));
  });
});

describe('conservation invariants', () => {
  const debts = [debt('a', 5_000, 0.1999, 150), debt('b', 2_000, 0.0899, 60)];

  it('total paid equals original principal plus total interest', () => {
    // Follows from closing = opening + interest − payment for every row. If this
    // ever fails, a payment or an interest figure is being lost or invented.
    const result = simulate({
      debts,
      monthlyBudget: fromMajor(400),
      strategy: 'avalanche',
    });
    const originalPrincipal = sum(debts.map((d) => d.balance));
    expect(result.totalPaid).toBe(originalPrincipal + result.totalInterest);
  });

  it('every row reconciles: closing = opening + interest − payment', () => {
    const result = simulate({
      debts,
      monthlyBudget: fromMajor(400),
      strategy: 'snowball',
    });
    for (const month of result.schedule) {
      for (const row of month.rows) {
        expect(row.closingBalance).toBe(row.openingBalance + row.interest - row.payment);
        expect(row.principal).toBe(row.payment - row.interest);
      }
    }
  });

  it('each month opens where the previous month closed', () => {
    const result = simulate({
      debts,
      monthlyBudget: fromMajor(400),
      strategy: 'avalanche',
    });
    for (let m = 1; m < result.schedule.length; m += 1) {
      const previous = result.schedule[m - 1];
      const current = result.schedule[m];
      for (let d = 0; d < debts.length; d += 1) {
        expect(current?.rows[d]?.openingBalance).toBe(previous?.rows[d]?.closingBalance);
      }
    }
  });

  it('never pays more in a month than the budget', () => {
    const budget = fromMajor(400);
    const result = simulate({ debts, monthlyBudget: budget, strategy: 'avalanche' });
    for (const month of result.schedule) {
      expect(month.totalPaid).toBeLessThanOrEqual(budget);
    }
  });
});

describe('zero-interest sanity check', () => {
  it('clears a 0% balance in exactly balance ÷ payment months, with no interest', () => {
    const result = simulate({
      debts: [debt('zero', 1_000, 0, 100)],
      monthlyBudget: fromMajor(100),
      strategy: 'avalanche',
    });
    expect(result.months).toBe(10);
    expect(result.totalInterest).toBe(0);
    expect(result.totalPaid).toBe(fromMajor(1_000));
  });
});

describe('ordering', () => {
  const cardHighRate = debt('high-rate', 8_000, 0.2499, 200);
  const cardSmallBalance = debt('small-balance', 800, 0.0999, 25);
  const debts = [cardHighRate, cardSmallBalance];

  it('avalanche targets the highest rate first', () => {
    expect(orderDebts(debts, 'avalanche').map((d) => d.id)).toEqual([
      'high-rate',
      'small-balance',
    ]);
  });

  it('snowball targets the smallest balance first', () => {
    expect(orderDebts(debts, 'snowball').map((d) => d.id)).toEqual([
      'small-balance',
      'high-rate',
    ]);
  });

  it('clears debts in the order the strategy targets them', () => {
    const avalanche = simulate({
      debts,
      monthlyBudget: fromMajor(500),
      strategy: 'avalanche',
    });
    const snowball = simulate({
      debts,
      monthlyBudget: fromMajor(500),
      strategy: 'snowball',
    });
    expect(avalanche.payoffOrder).toEqual(['high-rate', 'small-balance']);
    expect(snowball.payoffOrder).toEqual(['small-balance', 'high-rate']);
  });

  it('breaks ties deterministically rather than by input order', () => {
    // Identical rate and balance: a calculator that answers differently for the
    // same inputs is worse than one that answers debatably but consistently.
    const x = debt('x', 1_000, 0.1, 50);
    const y = debt('y', 1_000, 0.1, 50);
    expect(orderDebts([y, x], 'avalanche').map((d) => d.id)).toEqual(['x', 'y']);
    expect(orderDebts([x, y], 'avalanche').map((d) => d.id)).toEqual(['x', 'y']);
    expect(orderDebts([y, x], 'snowball').map((d) => d.id)).toEqual(['x', 'y']);
  });
});

describe('surplus allocation and rollover', () => {
  const debts = [debt('a', 1_000, 0.2, 50), debt('b', 3_000, 0.1, 100)];

  it('sends the whole surplus to the target and only the minimum elsewhere', () => {
    const result = simulate({
      debts,
      monthlyBudget: fromMajor(400),
      strategy: 'avalanche', // targets 'a' at 20%
    });
    const first = result.schedule[0];
    const rowA = first?.rows.find((r) => r.debtId === 'a');
    const rowB = first?.rows.find((r) => r.debtId === 'b');
    // b receives its £100 minimum; a receives 400 − 100 = 300.
    expect(rowB?.payment).toBe(fromMajor(100));
    expect(rowA?.payment).toBe(fromMajor(300));
  });

  it('cascades leftover surplus to the next debt within the same month', () => {
    // 'a' needs ~£1,016 to clear; a £2,000 budget must not leave £984 idle.
    const result = simulate({
      debts,
      monthlyBudget: fromMajor(2_000),
      strategy: 'avalanche',
    });
    const first = result.schedule[0];
    const rowA = first?.rows.find((r) => r.debtId === 'a');
    const rowB = first?.rows.find((r) => r.debtId === 'b');
    expect(rowA?.closingBalance).toBe(0);
    expect(rowB?.payment).toBeGreaterThan(fromMajor(100));
    expect(first?.totalPaid).toBe(fromMajor(2_000));
  });

  it('rolls a cleared debt’s minimum into the surplus', () => {
    const result = simulate({
      debts,
      monthlyBudget: fromMajor(400),
      strategy: 'avalanche',
    });
    const clearedMonth = result.schedule.findIndex((m) => m.clearedDebtIds.includes('a'));
    expect(clearedMonth).toBeGreaterThanOrEqual(0);
    // Once 'a' is gone the entire budget goes to 'b'.
    const after = result.schedule[clearedMonth + 1];
    const rowB = after?.rows.find((r) => r.debtId === 'b');
    expect(rowB?.payment).toBe(fromMajor(400));
  });
});

describe('debt that never amortises', () => {
  it('reports neverPaysOff instead of looping forever', () => {
    // £10,000 at 24% accrues ~£200/month. A £100 minimum never touches it.
    const result = simulate({
      debts: [debt('trap', 10_000, 0.24, 100)],
      monthlyBudget: fromMajor(100),
      strategy: 'minimums-only',
    });
    expect(result.neverPaysOff).toBe(true);
    expect(result.months).toBe(MAX_MONTHS);
    // The balance must be shown growing, not silently clamped.
    const last = result.schedule[result.months - 1]?.rows[0];
    expect(last?.closingBalance).toBeGreaterThan(fromMajor(10_000));
    expect(last?.principal).toBeLessThan(0);
  });

  it('quotes no saving against a baseline that never clears', () => {
    const debts = [debt('trap', 10_000, 0.24, 100)];
    const comparison = compareStrategies(debts, fromMajor(500));
    expect(comparison.minimumsOnly.neverPaysOff).toBe(true);
    expect(comparison.interestSavedVsMinimums).toBe(0);
    expect(comparison.monthsSavedVsMinimums).toBe(0);
    // The real strategies still resolve.
    expect(comparison.best.neverPaysOff).toBe(false);
  });
});

describe('compareStrategies', () => {
  const debts = [
    debt('card', 6_000, 0.2299, 150),
    debt('loan', 2_500, 0.0699, 120),
    debt('store', 900, 0.2999, 30),
  ];

  const comparison = compareStrategies(debts, fromMajor(600));

  it('avalanche never costs more interest than snowball', () => {
    // This is the mathematical guarantee of the avalanche method, and it is the
    // one claim the page is allowed to make without giving advice.
    expect(comparison.avalanche.totalInterest).toBeLessThanOrEqual(
      comparison.snowball.totalInterest,
    );
    expect(comparison.best.strategy).toBe('avalanche');
  });

  it('both strategies beat the minimums-only baseline', () => {
    expect(comparison.avalanche.months).toBeLessThan(comparison.minimumsOnly.months);
    expect(comparison.avalanche.totalInterest).toBeLessThan(
      comparison.minimumsOnly.totalInterest,
    );
    expect(comparison.interestSavedVsMinimums).toBeGreaterThan(0);
    expect(comparison.monthsSavedVsMinimums).toBeGreaterThan(0);
  });

  it('reports the difference between the two strategies as a positive figure', () => {
    const expected = Math.abs(
      comparison.avalanche.totalInterest - comparison.snowball.totalInterest,
    );
    expect(comparison.interestDifferenceBetweenStrategies).toBe(expected);
  });

  it('orders payoff by rate under avalanche and by balance under snowball', () => {
    // store 29.99% / £900, card 22.99% / £6,000, loan 6.99% / £2,500.
    // The store card happens to be both the smallest and the dearest, so the
    // strategies agree on the first target and diverge after it.
    expect(comparison.avalanche.payoffOrder).toEqual(['store', 'card', 'loan']);
    expect(comparison.snowball.payoffOrder).toEqual(['store', 'loan', 'card']);
  });

  it('pins the worked example the tool page will quote', () => {
    // £9,400 across three debts on a £600 monthly budget. These figures appear
    // in the explanation copy, so they are asserted here — if the engine moves,
    // the page must move with it rather than quietly going stale.
    expect(comparison.avalanche.months).toBe(19);
    expect(comparison.avalanche.totalInterest).toBe(fromMajor(1_427.27));
    expect(comparison.snowball.months).toBe(19);
    expect(comparison.snowball.totalInterest).toBe(fromMajor(1_657.92));
    expect(comparison.minimumsOnly.months).toBe(77);
    expect(comparison.minimumsOnly.totalInterest).toBe(fromMajor(6_448.64));
    expect(comparison.interestSavedVsMinimums).toBe(fromMajor(5_021.37));
    expect(comparison.monthsSavedVsMinimums).toBe(58);
    expect(comparison.interestDifferenceBetweenStrategies).toBe(fromMajor(230.65));
  });
});

describe('validation', () => {
  const ok = debt('a', 1_000, 0.1, 50);

  it('rejects a budget below the total minimums', () => {
    expect(() =>
      simulate({
        debts: [ok, debt('b', 2_000, 0.1, 100)],
        monthlyBudget: fromMajor(149),
        strategy: 'avalanche',
      }),
    ).toThrow(DebtPayoffError);
  });

  it('rejects an empty debt list', () => {
    expect(() =>
      simulate({ debts: [], monthlyBudget: fromMajor(100), strategy: 'avalanche' }),
    ).toThrow(DebtPayoffError);
  });

  it('rejects duplicate ids, which would silently corrupt the payoff order', () => {
    expect(() =>
      simulate({
        debts: [ok, { ...ok, name: 'copy' }],
        monthlyBudget: fromMajor(500),
        strategy: 'avalanche',
      }),
    ).toThrow(DebtPayoffError);
  });

  it('rejects a rate entered as a percentage instead of a decimal', () => {
    // 19.99 rather than 0.1999 is the most likely data-entry error, and it
    // would otherwise produce a confident, catastrophic, wrong answer.
    expect(() =>
      simulate({
        debts: [debt('a', 1_000, 19.99, 50)],
        monthlyBudget: fromMajor(500),
        strategy: 'avalanche',
      }),
    ).toThrow(DebtPayoffError);
  });

  it('rejects non-positive balances and invalid rates', () => {
    const bad: [string, Partial<Debt>][] = [
      ['zero balance', { balance: 0 as Minor }],
      ['negative balance', { balance: minor(-100) }],
      ['negative rate', { annualRate: -0.1 }],
      ['NaN rate', { annualRate: Number.NaN }],
      ['negative minimum', { minimumPayment: minor(-1) }],
    ];
    for (const [label, patch] of bad) {
      expect(
        () =>
          simulate({
            debts: [{ ...ok, ...patch }],
            monthlyBudget: fromMajor(500),
            strategy: 'avalanche',
          }),
        label,
      ).toThrow(DebtPayoffError);
    }
  });
});

describe('display integration', () => {
  it('produces figures that format cleanly for a results panel', () => {
    const result = simulate({
      debts: [debt('card', 5_000, 0.1999, 150)],
      monthlyBudget: fromMajor(250),
      strategy: 'avalanche',
    });
    expect(Number.isInteger(result.totalInterest)).toBe(true);
    expect(toMajor(result.totalPaid)).toBeCloseTo(
      toMajor(result.totalInterest) + 5_000,
      2,
    );
  });
});
