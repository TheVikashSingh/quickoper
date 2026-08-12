import { describe, expect, it } from 'vitest';

import { compareStrategies, simulate } from '../../src/lib/calc/debt-payoff';
import { compareOverpayment } from '../../src/lib/calc/mortgage';
import { fromMajor, toMajor } from '../../src/lib/calc/money';

/**
 * DIRECTIONAL INVARIANTS.
 *
 * Every other fixture in this directory asks "is the number right". These ask
 * "does the number point the way the prose says it points" — which is a
 * different question, and the one that has actually gone wrong.
 *
 * Twice now a page has stated the exact opposite of its own arithmetic while
 * every gate stayed green:
 *
 *   D47  "SAVED VS MINIMUMS — $0.00" on a plan that saves the visitor from a
 *        debt the minimums never clear at all.
 *   D55  "Paying $150.00 instead of $250.00 removes 44 months" — the pair
 *        indexed the wrong way round.
 *
 * Neither was an arithmetic error. Both were a true number attached to a false
 * sentence, which is the worst failure this site can have: a reader cannot
 * detect it, and it discredits every other figure on the page.
 *
 * The structural fix is in the components — derive which side is which rather
 * than naming it. These tests defend the layer underneath: if the ENGINE ever
 * returns a comparison that points the wrong way, the components will faithfully
 * render a lie, so the engine has to be provably monotonic first.
 *
 * Ranges are swept rather than spot-checked, because a reversal that only
 * appears at one rate is exactly the kind that ships.
 */

const card = (id: string, balance: number, ratePct: number, minimum: number) => ({
  id,
  name: id,
  balance: fromMajor(balance),
  annualRate: ratePct / 100,
  minimumPayment: fromMajor(minimum),
});

describe('debt payoff — the comparison points the way the prose claims', () => {
  /**
   * `best` is what the UI names as the cheaper strategy, and
   * `interestDifferenceBetweenStrategies` is an ABSOLUTE value — the direction
   * is discarded. So the only thing keeping that sentence true is `best`
   * genuinely being the minimum. Asserted here across a spread of shapes.
   */
  it('best is never beaten by either strategy it chose between', () => {
    const shapes = [
      [card('a', 5_000, 24.99, 100), card('b', 900, 9.99, 40)],
      [card('a', 900, 24.99, 40), card('b', 5_000, 9.99, 100)],
      [card('a', 2_000, 19.99, 50), card('b', 2_000, 19.99, 50)],
      [card('a', 12_000, 6.99, 250), card('b', 400, 29.99, 25)],
      [
        card('a', 300, 29.99, 15),
        card('b', 8_000, 14.99, 160),
        card('c', 1_500, 22.99, 45),
      ],
    ];

    for (const debts of shapes) {
      const minimums = debts.reduce((sum, d) => sum + toMajor(d.minimumPayment), 0);
      for (const budget of [minimums, minimums + 100, minimums + 500]) {
        const c = compareStrategies(debts, fromMajor(budget));

        expect(c.best.totalInterest).toBeLessThanOrEqual(c.avalanche.totalInterest);
        expect(c.best.totalInterest).toBeLessThanOrEqual(c.snowball.totalInterest);

        // The headline difference must be the gap between the two named
        // strategies — not a stale or unrelated figure.
        expect(c.interestDifferenceBetweenStrategies).toBe(
          Math.abs(c.avalanche.totalInterest - c.snowball.totalInterest),
        );

        // `best.strategy` is what the sentence prints. It has to be one of the
        // two being compared — never the baseline.
        expect(['avalanche', 'snowball']).toContain(c.best.strategy);
      }
    }
  });

  /** Paying more never takes longer, and never costs more interest. */
  it('a larger budget never clears later or costs more', () => {
    const debts = [card('a', 6_000, 22.99, 150), card('b', 2_500, 6.99, 120)];
    const minimums = 270;

    let previous = compareStrategies(debts, fromMajor(minimums));

    for (const extra of [50, 100, 200, 400, 800]) {
      const current = compareStrategies(debts, fromMajor(minimums + extra));

      expect(current.best.months).toBeLessThanOrEqual(previous.best.months);
      expect(current.best.totalInterest).toBeLessThanOrEqual(previous.best.totalInterest);

      previous = current;
    }
  });

  /** The saving quoted against the baseline can never be negative. */
  it('never reports a negative saving against the minimums', () => {
    for (const rate of [0.99, 6.99, 14.99, 22.99, 29.99]) {
      const debts = [card('a', 4_000, rate, 80)];
      const c = compareStrategies(debts, fromMajor(300));

      expect(c.interestSavedVsMinimums).toBeGreaterThanOrEqual(0);
      expect(c.monthsSavedVsMinimums).toBeGreaterThanOrEqual(0);

      // When the baseline does clear, the plan must not finish later than it.
      if (!c.minimumsOnly.neverPaysOff) {
        expect(c.best.months).toBeLessThanOrEqual(c.minimumsOnly.months);
      }
    }
  });

  /** A payment below the interest charged must grow the balance, not shrink it. */
  it('a payment under the monthly interest grows the balance', () => {
    const balance = 3_000;
    const ratePct = 29.99;
    const monthlyInterest = (balance * (ratePct / 100)) / 12;

    const under = simulate({
      debts: [card('a', balance, ratePct, Math.floor(monthlyInterest) - 10)],
      monthlyBudget: fromMajor(Math.floor(monthlyInterest) - 10),
      strategy: 'minimums-only',
    });
    expect(under.neverPaysOff).toBe(true);

    const over = simulate({
      debts: [card('a', balance, ratePct, Math.ceil(monthlyInterest) + 10)],
      monthlyBudget: fromMajor(Math.ceil(monthlyInterest) + 10),
      strategy: 'minimums-only',
    });
    expect(over.neverPaysOff).toBe(false);
  });
});

describe('mortgage — overpaying always helps, never hurts', () => {
  /**
   * The overpayment panel says "removes N years M months and $X of interest".
   * That sentence is only true if the engine is monotonic in the overpayment,
   * so that is asserted directly rather than assumed.
   */
  it('a larger overpayment never removes fewer months or less interest', () => {
    const principal = fromMajor(320_000);
    const rate = 0.06706;
    const term = 360;

    let previousMonths = Infinity;
    let previousInterest = -Infinity;

    for (const extra of [0, 50, 100, 200, 400, 1_000]) {
      const c = compareOverpayment({
        principal,
        annualRate: rate,
        termMonths: term,
        monthlyOverpayment: fromMajor(extra),
      });

      expect(c.overpaid.months).toBeLessThanOrEqual(previousMonths);
      expect(c.interestSaved).toBeGreaterThanOrEqual(previousInterest);
      expect(c.interestSaved).toBeGreaterThanOrEqual(0);
      expect(c.monthsSaved).toBeGreaterThanOrEqual(0);

      previousMonths = c.overpaid.months;
      previousInterest = c.interestSaved;
    }
  });

  /** Overpaying nothing must be a no-op, not a saving or a penalty (D39). */
  it('reports exactly zero saved when nothing extra is paid', () => {
    const c = compareOverpayment({
      principal: fromMajor(320_000),
      annualRate: 0.06706,
      termMonths: 360,
      monthlyOverpayment: fromMajor(0),
    });

    expect(c.monthsSaved).toBe(0);
    expect(c.interestSaved).toBe(0);
  });
});
