import { describe, expect, it } from 'vitest';
import {
  CoastFireError,
  MAX_AGE,
  MIN_AGE,
  calculateCoastFire,
  coastOnly,
  discountToPresent,
  monthlyRate,
  type CoastFireInput,
} from '../../src/lib/calc/coast-fire';
import { fromMajor, toMajor } from '../../src/lib/calc/money';

/**
 * Fixtures for the Coast FIRE engine.
 *
 * The external anchor is the compound interest formula FV = PV × (1 + r)^n,
 * which is universally published and checkable on any calculator. Assertions
 * derived only from our own output would prove self-consistency, not
 * correctness.
 */

const base: CoastFireInput = {
  currentAge: 30,
  retirementAge: 60,
  currentInvested: fromMajor(100_000),
  annualSpending: fromMajor(40_000),
  withdrawalRate: 0.04,
  realReturn: 0.05,
  monthlyContribution: fromMajor(0),
};

describe('monthlyRate — the convention that differs from the debt tool', () => {
  it('uses the EFFECTIVE monthly rate, not the nominal division', () => {
    // A stated 7% annual return compounds to 7% over the year. The monthly
    // rate is therefore (1.07)^(1/12) − 1 = 0.5654%, NOT 7/12 = 0.5833%.
    expect(monthlyRate(0.07)).toBeCloseTo(0.005654145, 9);
    expect(monthlyRate(0.07)).not.toBeCloseTo(0.07 / 12, 5);
  });

  it('compounds back to exactly the annual rate over twelve months', () => {
    // The defining property. If this fails the convention is wrong.
    for (const annual of [0.03, 0.05, 0.07, 0.1]) {
      expect(Math.pow(1 + monthlyRate(annual), 12) - 1).toBeCloseTo(annual, 12);
    }
  });

  it('handles a zero and a negative real return', () => {
    expect(monthlyRate(0)).toBe(0);
    expect(monthlyRate(-0.02)).toBeLessThan(0);
  });
});

describe('external cross-check: the compound interest formula', () => {
  /**
   * SOURCE: FV = PV × (1 + r)^n, the standard compound interest formula.
   *
   * $100,000 at 7% for 30 years:
   *   1.07^30 = 7.612255042...
   *   FV      = $761,225.50
   *
   * Anyone can reproduce that on a pocket calculator, which is the point.
   */
  it('discounts a future target back to today, matching the formula', () => {
    // PV = FV ÷ (1 + r)^n, the same formula rearranged.
    const present = discountToPresent(fromMajor(761_225.5), 0.07, 30);
    expect(toMajor(present)).toBeCloseTo(100_000, 2);
  });

  it('grows a balance to the published figure over 30 years of monthly steps', () => {
    // 360 monthly steps at the effective rate must reproduce the annual closed
    // form. This is where the per-period rounding policy could bite, so the
    // drift is measured rather than assumed.
    const series = coastOnly(fromMajor(100_000), 0.07, 30);
    const final = series[series.length - 1];
    const closedForm = fromMajor(761_225.5);

    const driftCents = Math.abs((final ?? 0) - closedForm);
    // 42 cents on $761,225.50 — about five parts per billion, from 360
    // successive roundings to the cent. Asserted EXACTLY rather than under a
    // loose bound: a change to the rounding policy should have to be noticed
    // and justified, not silently absorbed by a tolerance.
    expect(driftCents).toBe(42);

    // ...and the DIRECTION, which the line above does not pin. Math.abs() means
    // a projection landing 42 cents HIGH would pass identically. Successive
    // rounding of a growing balance should lose fractions, not gain them, so
    // the sign is part of the claim.
    //
    // This matters more than it used to: /verify now publishes this exact
    // figure and invites the reader to reproduce it in a spreadsheet. A number
    // on that page must be pinned by a test, or the page is doing the very
    // thing it exists to argue against.
    //
    // Narrowed rather than defaulted, because `Minor` is branded (D4) and
    // `final ?? 0` widens to `0 | Minor`, which toMajor correctly refuses.
    if (final === undefined) throw new Error('coastOnly returned an empty series');
    expect(toMajor(final)).toBe(761_225.08);
  });

  it('produces one row per year, inclusive of both ends', () => {
    expect(coastOnly(fromMajor(1_000), 0.05, 10)).toHaveLength(11);
  });
});

describe('the coast number', () => {
  it('converts spending into a target using the withdrawal rate', () => {
    // A 4% withdrawal rate means 25× annual spending, by definition.
    const result = calculateCoastFire(base);
    expect(result.fireNumber).toBe(fromMajor(1_000_000));
    expect(toMajor(result.fireNumber)).toBe(toMajor(base.annualSpending) * 25);
  });

  it('discounts that target back over the years remaining', () => {
    // $1,000,000 ÷ 1.05^30 = $231,377.45
    //   1.05^30 = 4.321942375...
    const result = calculateCoastFire(base);
    expect(toMajor(result.coastNumber)).toBeCloseTo(231_377.45, 2);
  });

  it('reports a shortfall as a negative surplus rather than clamping it', () => {
    const result = calculateCoastFire(base);
    expect(result.alreadyCoasting).toBe(false);
    // $100,000 invested against a $231,377.45 target.
    expect(toMajor(result.surplus)).toBeCloseTo(-131_377.45, 2);
  });

  it('recognises someone already past the line', () => {
    const result = calculateCoastFire({
      ...base,
      currentInvested: fromMajor(300_000),
    });
    expect(result.alreadyCoasting).toBe(true);
    expect(result.coastAge).toBe(30);
    expect(result.monthsToCoast).toBe(0);
    expect(result.surplus).toBeGreaterThan(0);
  });
});

describe('projection', () => {
  it('reaches the FIRE number by retirement when starting exactly on the line', () => {
    // Someone who is exactly at their coast number, contributing nothing, must
    // land on the target. This is the definition of coasting, and it ties the
    // projection loop to the closed form.
    const onTheLine = calculateCoastFire(base).coastNumber;
    const result = calculateCoastFire({
      ...base,
      currentInvested: onTheLine,
      monthlyContribution: fromMajor(0),
    });
    // $1,000,000.12 — twelve cents ABOVE the $1,000,000 target after 360
    // monthly roundings. That the discount and the projection are inverses to
    // within twelve cents over thirty years is the real assertion here, and
    // erring high rather than low is the safe direction for a target.
    expect(result.balanceAtRetirement).toBe(fromMajor(1_000_000.12));
    expect(result.balanceAtRetirement).toBeGreaterThanOrEqual(result.fireNumber);
  });

  it('emits one row per year from current age to retirement inclusive', () => {
    const result = calculateCoastFire(base);
    expect(result.projection).toHaveLength(31);
    expect(result.projection[0]?.age).toBe(30);
    expect(result.projection[30]?.age).toBe(60);
  });

  it('grows the balance and lowers the target as retirement approaches', () => {
    const result = calculateCoastFire({ ...base, monthlyContribution: fromMajor(500) });
    for (let i = 1; i < result.projection.length; i += 1) {
      const previous = result.projection[i - 1];
      const current = result.projection[i];
      expect(current?.balance).toBeGreaterThan(previous?.balance ?? 0);
      expect(current?.coastTarget).toBeGreaterThan(previous?.coastTarget ?? 0);
    }
    // The final year's target IS the full FIRE number — nothing left to coast.
    const last = result.projection[result.projection.length - 1];
    expect(last?.coastTarget).toBe(result.fireNumber);
  });

  it('finds the crossing point when contributing', () => {
    const result = calculateCoastFire({ ...base, monthlyContribution: fromMajor(1_000) });
    expect(result.monthsToCoast).not.toBeNull();
    expect(result.coastAge).not.toBeNull();
    expect(result.coastAge).toBeGreaterThan(30);
    expect(result.coastAge).toBeLessThanOrEqual(60);

    // At the crossing month the balance must genuinely be at or above target.
    const crossingRow = result.projection.find((row) => row.coasting);
    expect(crossingRow?.balance).toBeGreaterThanOrEqual(crossingRow?.coastTarget ?? 0);
  });

  it('never reports coasting for someone contributing nothing and short', () => {
    const result = calculateCoastFire(base);
    expect(result.monthsToCoast).toBeNull();
    expect(result.coastAge).toBeNull();
    expect(result.projection.some((row) => row.coasting)).toBe(false);
  });

  it('handles a zero real return without dividing by zero', () => {
    const result = calculateCoastFire({
      ...base,
      realReturn: 0,
      monthlyContribution: fromMajor(1_000),
    });
    // With no growth the coast number IS the full target.
    expect(result.coastNumber).toBe(result.fireNumber);
    // And the balance is simply contributions plus the opening amount.
    expect(toMajor(result.balanceAtRetirement)).toBeCloseTo(100_000 + 1_000 * 360, 2);
  });

  it('handles a negative real return without producing nonsense', () => {
    const result = calculateCoastFire({ ...base, realReturn: -0.02 });
    // Money shrinking in real terms means you need MORE than the target today.
    expect(result.coastNumber).toBeGreaterThan(result.fireNumber);
    expect(result.balanceAtRetirement).toBeLessThan(base.currentInvested);
  });
});

describe('validation', () => {
  const cases: [string, Partial<CoastFireInput>][] = [
    ['retirement age equal to current', { retirementAge: 30 }],
    ['retirement age before current', { retirementAge: 25 }],
    ['age below the floor', { currentAge: MIN_AGE - 1 }],
    ['age above the ceiling', { retirementAge: MAX_AGE + 1 }],
    ['fractional age', { currentAge: 30.5 }],
    ['zero withdrawal rate', { withdrawalRate: 0 }],
    ['withdrawal rate above 20%', { withdrawalRate: 0.25 }],
    ['withdrawal rate as a percentage', { withdrawalRate: 4 }],
    ['real return as a percentage', { realReturn: 5 }],
    ['NaN return', { realReturn: Number.NaN }],
    ['zero spending', { annualSpending: fromMajor(0) }],
    ['negative invested', { currentInvested: fromMajor(-1) }],
    ['negative contribution', { monthlyContribution: fromMajor(-1) }],
  ];

  for (const [label, patch] of cases) {
    it(`rejects ${label}`, () => {
      expect(() => calculateCoastFire({ ...base, ...patch })).toThrow(CoastFireError);
    });
  }

  it('accepts a zero contribution — that is precisely what coasting means', () => {
    expect(() =>
      calculateCoastFire({ ...base, monthlyContribution: fromMajor(0) }),
    ).not.toThrow();
  });
});
