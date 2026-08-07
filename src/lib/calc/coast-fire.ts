/**
 * Coast FIRE: the point at which invested money will reach a retirement target
 * on its own, with no further contributions.
 *
 * Pure functions. No DOM, no Preact, no imports from components/.
 *
 * ─── Stated assumptions (these belong on the page, not just in the code) ─────
 *
 * 1. EVERYTHING IS IN TODAY'S MONEY. The return rate supplied is a REAL return
 *    — after inflation. Spending is today's spending. This avoids projecting a
 *    nominal balance whose size flatters the reader while buying less, and it
 *    removes a second guess (future inflation) from an already speculative
 *    projection.
 *
 * 2. THE COMPOUNDING CONVENTION DIFFERS FROM THE DEBT TOOL, DELIBERATELY.
 *
 *    debt-payoff.ts uses `annualRate / 12`, because that is how lenders quote
 *    an APR and how a statement computes a monthly charge.
 *
 *    An investment return does not work that way. A stated 7% annual return
 *    compounds to 7% over the year, so the monthly rate is the effective one,
 *    `(1 + r)^(1/12) − 1` = 0.5654%, not `7/12` = 0.5833%. Using the nominal
 *    division would overstate a 30-year projection by several percent.
 *
 *    Same word, different meaning, because the underlying contracts differ.
 *
 * 3. THE RETURN IS CONSTANT. Real markets are not. A projection assuming a
 *    steady 5% is a description of an arithmetic, not a forecast, and the page
 *    must say so — sequence-of-returns risk is precisely what a smooth curve
 *    hides.
 *
 * 4. THE WITHDRAWAL RATE IS THE USER'S INPUT, not our recommendation. It
 *    converts a spending figure into a target: a 4% rate means 25× spending.
 *    We do not endorse a number (rule A — compute, never advise).
 *
 * ─── Rounding policy (CLAUDE.md rule 3) ─────────────────────────────────────
 *
 * Delegated to calc/money.ts: half-up, per period, at every point a non-integer
 * is produced — the same policy as everywhere else, applied monthly.
 *
 * The debt tool's rationale for per-period rounding (a lender's statement
 * rounds each month and carries that figure forward) does NOT apply here; no
 * broker rounds a portfolio to the cent monthly. The policy is kept anyway for
 * consistency, and the resulting drift against the closed-form compound
 * interest formula is MEASURED rather than assumed — see the fixtures.
 */

import { add, compare, divide, isPositive, scale, subtract, type Minor } from './money';

/** Age bounds. Outside these a projection is not a meaningful answer. */
export const MIN_AGE = 16;
export const MAX_AGE = 100;

export class CoastFireError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CoastFireError';
  }
}

export interface CoastFireInput {
  readonly currentAge: number;
  readonly retirementAge: number;
  /** Invested today. Cash you intend to spend does not belong here. */
  readonly currentInvested: Minor;
  /** Annual spending in retirement, in TODAY's money. */
  readonly annualSpending: Minor;
  /** Decimal: 0.04 for 4%. Converts spending into a target. */
  readonly withdrawalRate: number;
  /** Annual REAL return, decimal: 0.05 for 5% after inflation. */
  readonly realReturn: number;
  /** Ongoing monthly contribution. Zero is valid — that IS coasting. */
  readonly monthlyContribution: Minor;
}

export interface ProjectionRow {
  readonly age: number;
  /** Projected balance at this age, contributions included. */
  readonly balance: Minor;
  /** What would need to be invested at this age to coast from here. */
  readonly coastTarget: Minor;
  /** True once balance has caught the target and contributions are optional. */
  readonly coasting: boolean;
}

export interface CoastFireResult {
  /** Spending ÷ withdrawal rate. The full retirement target. */
  readonly fireNumber: Minor;
  /** The target discounted back to today. Coast FIRE proper. */
  readonly coastNumber: Minor;
  readonly alreadyCoasting: boolean;
  /** Invested less the coast number. Negative means a shortfall. */
  readonly surplus: Minor;
  /** Age at which contributions could stop. Null if never, on these inputs. */
  readonly coastAge: number | null;
  /** Months until that point. Null if never. Zero if already there. */
  readonly monthsToCoast: number | null;
  /** Projected balance at the retirement age, if contributions continue. */
  readonly balanceAtRetirement: Minor;
  /** One row per year, current age through retirement age inclusive. */
  readonly projection: readonly ProjectionRow[];
}

// ── Validation ───────────────────────────────────────────────────────────────

function validate(input: CoastFireInput): void {
  const { currentAge, retirementAge, withdrawalRate, realReturn } = input;

  for (const [label, age] of [
    ['Current age', currentAge],
    ['Retirement age', retirementAge],
  ] as const) {
    if (!Number.isFinite(age) || !Number.isInteger(age)) {
      throw new CoastFireError(`${label} must be a whole number of years.`);
    }
    if (age < MIN_AGE || age > MAX_AGE) {
      throw new CoastFireError(`${label} must be between ${MIN_AGE} and ${MAX_AGE}.`);
    }
  }

  if (retirementAge <= currentAge) {
    throw new CoastFireError('Retirement age must be later than your current age.');
  }

  if (!Number.isFinite(withdrawalRate) || withdrawalRate <= 0 || withdrawalRate > 0.2) {
    throw new CoastFireError(
      `Withdrawal rate must be above 0% and at most 20%, received ${withdrawalRate}. ` +
        'Rates are decimals: use 0.04 for 4%.',
    );
  }

  if (!Number.isFinite(realReturn) || realReturn <= -0.5 || realReturn > 0.3) {
    throw new CoastFireError(
      `Real return must be between -50% and 30%, received ${realReturn}. ` +
        'Rates are decimals: use 0.05 for 5%.',
    );
  }

  if (input.currentInvested < 0) {
    throw new CoastFireError('Amount invested cannot be negative.');
  }
  if (!isPositive(input.annualSpending)) {
    throw new CoastFireError('Annual spending in retirement must be more than zero.');
  }
  if (input.monthlyContribution < 0) {
    throw new CoastFireError('Monthly contribution cannot be negative.');
  }
}

// ── The arithmetic ───────────────────────────────────────────────────────────

/**
 * Effective monthly rate from a stated annual return.
 *
 * `(1 + r)^(1/12) − 1`, NOT `r / 12`. See assumption 2 in the module header —
 * this is the single most consequential line in the file.
 */
export function monthlyRate(annualRate: number): number {
  return Math.pow(1 + annualRate, 1 / 12) - 1;
}

/**
 * What must be invested today to reach `target` in `years` at `annualRate`,
 * contributing nothing further. The compound interest formula, rearranged:
 *
 *   FV = PV × (1 + r)^n   →   PV = FV ÷ (1 + r)^n
 */
export function discountToPresent(
  target: Minor,
  annualRate: number,
  years: number,
): Minor {
  return divide(target, Math.pow(1 + annualRate, years));
}

export function calculateCoastFire(input: CoastFireInput): CoastFireResult {
  validate(input);

  const {
    currentAge,
    retirementAge,
    currentInvested,
    annualSpending,
    withdrawalRate,
    realReturn,
    monthlyContribution,
  } = input;

  const yearsToRetirement = retirementAge - currentAge;

  // Spending ÷ withdrawal rate. A 4% rate is 25× spending.
  const fireNumber = divide(annualSpending, withdrawalRate);
  const coastNumber = discountToPresent(fireNumber, realReturn, yearsToRetirement);

  const surplus = subtract(currentInvested, coastNumber);
  const alreadyCoasting = compare(currentInvested, coastNumber) >= 0;

  // Month-by-month so contributions land monthly rather than as a lump.
  const rate = monthlyRate(realReturn);
  const totalMonths = yearsToRetirement * 12;

  const projection: ProjectionRow[] = [];
  let balance = currentInvested;
  let coastAge: number | null = alreadyCoasting ? currentAge : null;
  let monthsToCoast: number | null = alreadyCoasting ? 0 : null;

  const targetAt = (age: number): Minor =>
    discountToPresent(fireNumber, realReturn, retirementAge - age);

  projection.push({
    age: currentAge,
    balance,
    coastTarget: coastNumber,
    coasting: alreadyCoasting,
  });

  for (let month = 1; month <= totalMonths; month += 1) {
    balance = add(add(balance, scale(balance, rate)), monthlyContribution);

    const age = currentAge + month / 12;

    if (monthsToCoast === null) {
      // The target falls as retirement approaches; the balance rises. Coasting
      // begins the first month they cross.
      if (compare(balance, targetAt(age)) >= 0) {
        monthsToCoast = month;
        coastAge = currentAge + Math.ceil(month / 12);
      }
    }

    if (month % 12 === 0) {
      const wholeAge = currentAge + month / 12;
      projection.push({
        age: wholeAge,
        balance,
        coastTarget: targetAt(wholeAge),
        coasting: monthsToCoast !== null && month >= monthsToCoast,
      });
    }
  }

  return {
    fireNumber,
    coastNumber,
    alreadyCoasting,
    surplus,
    coastAge,
    monthsToCoast,
    balanceAtRetirement: balance,
    projection,
  };
}

/** Growth of a balance with no further contributions. Used by the chart. */
export function coastOnly(from: Minor, annualRate: number, years: number): Minor[] {
  const rate = monthlyRate(annualRate);
  const out: Minor[] = [from];
  let balance = from;
  for (let year = 1; year <= years; year += 1) {
    for (let month = 0; month < 12; month += 1) {
      balance = add(balance, scale(balance, rate));
    }
    out.push(balance);
  }
  return out;
}
