/**
 * Minor-unit money arithmetic.
 *
 * ─── Why this module exists ──────────────────────────────────────────────────
 *
 * Currency in IEEE-754 doubles is wrong in ways that are invisible until a user
 * notices. `0.1 + 0.2 === 0.30000000000000004`. Every amount here is therefore
 * an INTEGER count of minor units (cents, pence, paise) — exact up to
 * Number.MAX_SAFE_INTEGER, which is roughly 90 trillion dollars.
 *
 * ─── Rounding policy (CLAUDE.md rule 3) ──────────────────────────────────────
 *
 * WHERE:      Rounding happens at every point a non-integer is produced —
 *             per period, never deferred to the end. Real lenders round the
 *             payment to the minor unit and then apply it; a closed-form
 *             textbook implementation that rounds only at the end diverges from
 *             a bank statement by several units over a 30-year term.
 *
 * DIRECTION:  Default `half-up`, meaning half away from zero. This is the
 *             convention in retail lending. `half-even` (banker's rounding) is
 *             available where a cited source requires it.
 *
 * FINAL PERIOD: This module provides `allocate`, which distributes a total
 *             across parts without creating or destroying a single minor unit.
 *             Schedule modules use it so the last period absorbs accumulated
 *             drift rather than the total silently disagreeing with the sum of
 *             its rows.
 *
 * ─── The float-tolerance detail ──────────────────────────────────────────────
 *
 * `1.005 * 100` evaluates to `100.49999999999999`, so naive `Math.round` yields
 * 100 where correct half-up rounding yields 101. This is the single most common
 * money bug in JavaScript. Boundary comparisons here use a tolerance of a few
 * ULPs so a value that is mathematically exactly one half is treated as such
 * even after accumulating float error. The tolerance is far below any real
 * decision boundary — it only ever corrects representation error.
 *
 * Sources:
 *   - IEEE 754-2019, §4.3 (rounding-direction attributes) for the definitions
 *     of roundTiesToEven and roundTiesToAway.
 *   - Martin Fowler, *Patterns of Enterprise Application Architecture*, the
 *     Money pattern, for the allocation algorithm used in `allocate`.
 */

declare const MINOR_BRAND: unique symbol;

/**
 * An integer count of a currency's minor unit.
 *
 * Branded so a raw `number` cannot be passed where money is expected — the
 * compiler rejects `add(balance, 5)` and forces the intent to be explicit.
 */
export type Minor = number & { readonly [MINOR_BRAND]: 'minor' };

export type RoundingMode =
  /** Ties away from zero. Retail lending default. */
  | 'half-up'
  /** Ties to the nearest even integer. IEEE 754 roundTiesToEven. */
  | 'half-even'
  /** Toward zero (truncate). */
  | 'down'
  /** Away from zero. */
  | 'up';

/**
 * Tolerance for "is this fraction exactly one half?", in relative terms.
 *
 * Eight ULPs. A single multiply introduces about one ULP of error and a short
 * chain a handful, so this absorbs representation error without ever reaching a
 * value a human would consider genuinely below the boundary. At a balance of
 * 100,000.00 the tolerance is ~1.8e-11 minor units.
 */
const FLOAT_TOLERANCE = Number.EPSILON * 8;

/** Thrown when an operation would produce a value that cannot be trusted. */
export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

function assertSafe(value: number, operation: string): void {
  if (!Number.isFinite(value)) {
    throw new MoneyError(`${operation} produced a non-finite value (${value}).`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(
      `${operation} produced ${value}, which is outside the exact-integer range. ` +
        'Money beyond Number.MAX_SAFE_INTEGER minor units cannot be represented exactly.',
    );
  }
}

/**
 * Round a real number to an integer under an explicit policy.
 *
 * Exported because the rounding policy is behaviour worth testing directly
 * rather than only through its callers.
 */
export function roundToInteger(value: number, mode: RoundingMode = 'half-up'): number {
  if (!Number.isFinite(value)) {
    throw new MoneyError(`Cannot round a non-finite value (${value}).`);
  }

  const sign = value < 0 ? -1 : 1;
  const magnitude = Math.abs(value);
  const floor = Math.floor(magnitude);
  const fraction = magnitude - floor;

  // Scale the tolerance with magnitude: float resolution degrades as values grow.
  const tolerance = Math.max(magnitude, 1) * FLOAT_TOLERANCE;
  const atHalf = Math.abs(fraction - 0.5) <= tolerance;
  const isWholeNumber = fraction <= tolerance;

  let rounded: number;
  switch (mode) {
    case 'half-up':
      rounded = atHalf || fraction > 0.5 ? floor + 1 : floor;
      break;
    case 'half-even':
      if (atHalf) rounded = floor % 2 === 0 ? floor : floor + 1;
      else rounded = fraction > 0.5 ? floor + 1 : floor;
      break;
    case 'down':
      rounded = floor;
      break;
    case 'up':
      rounded = isWholeNumber ? floor : floor + 1;
      break;
  }

  // `sign * 0` would yield -0, which breaks Object.is comparisons in fixtures.
  return rounded === 0 ? 0 : sign * rounded;
}

// ── Construction ─────────────────────────────────────────────────────────────

/** Wrap an integer count of minor units. Rejects anything non-integral. */
export function minor(units: number): Minor {
  if (!Number.isInteger(units)) {
    throw new MoneyError(
      `minor() requires an integer count of minor units, received ${units}. ` +
        'Use fromMajor() to convert a decimal amount, choosing a rounding mode.',
    );
  }
  assertSafe(units, 'minor()');
  return units as Minor;
}

/**
 * Convert a major-unit amount (dollars, pounds) to minor units.
 *
 * Rounding is REQUIRED to be a conscious choice, which is why the mode is a
 * parameter with a documented default rather than an implementation detail.
 */
export function fromMajor(
  amount: number,
  scale = 100,
  mode: RoundingMode = 'half-up',
): Minor {
  if (!Number.isFinite(amount)) {
    throw new MoneyError(`fromMajor() received a non-finite amount (${amount}).`);
  }
  if (!Number.isInteger(scale) || scale <= 0) {
    throw new MoneyError(
      `fromMajor() scale must be a positive integer, received ${scale}.`,
    );
  }
  const units = roundToInteger(amount * scale, mode);
  assertSafe(units, 'fromMajor()');
  return units as Minor;
}

/**
 * Convert minor units back to a major-unit number.
 *
 * FOR DISPLAY AND EXPORT ONLY. Never feed the result back into arithmetic —
 * that reintroduces exactly the float error this module exists to prevent.
 */
export function toMajor(amount: Minor, scale = 100): number {
  return amount / scale;
}

export const ZERO = 0 as Minor;

// ── Arithmetic ───────────────────────────────────────────────────────────────

export function add(a: Minor, b: Minor): Minor {
  const result = a + b;
  assertSafe(result, 'add()');
  return result as Minor;
}

export function subtract(a: Minor, b: Minor): Minor {
  const result = a - b;
  assertSafe(result, 'subtract()');
  return result as Minor;
}

export function negate(a: Minor): Minor {
  return (a === 0 ? 0 : -a) as Minor;
}

export function absolute(a: Minor): Minor {
  return Math.abs(a) as Minor;
}

export function sum(amounts: readonly Minor[]): Minor {
  let total = 0;
  for (const amount of amounts) total += amount;
  assertSafe(total, 'sum()');
  return total as Minor;
}

/**
 * Multiply by a real factor and round back to whole minor units.
 *
 * This is where periodic interest is computed: `scale(balance, annualRate / 12)`.
 * It is the single most correctness-critical function in the module, because a
 * one-unit error here compounds across every remaining period of a schedule.
 */
export function scale(
  amount: Minor,
  factor: number,
  mode: RoundingMode = 'half-up',
): Minor {
  if (!Number.isFinite(factor)) {
    throw new MoneyError(`scale() received a non-finite factor (${factor}).`);
  }
  const result = roundToInteger(amount * factor, mode);
  assertSafe(result, 'scale()');
  return result as Minor;
}

/** Divide by a real divisor and round back to whole minor units. */
export function divide(
  amount: Minor,
  divisor: number,
  mode: RoundingMode = 'half-up',
): Minor {
  if (!Number.isFinite(divisor) || divisor === 0) {
    throw new MoneyError(`divide() received an invalid divisor (${divisor}).`);
  }
  const result = roundToInteger(amount / divisor, mode);
  assertSafe(result, 'divide()');
  return result as Minor;
}

// ── Allocation ───────────────────────────────────────────────────────────────

/**
 * Distribute a total across weighted parts, conserving every minor unit.
 *
 * `allocate(minor(100), [1, 1, 1])` returns `[34, 33, 33]`, not three lots of
 * 33.33. The sum of the parts ALWAYS equals the total exactly — that invariant
 * is what stops a schedule's rows from disagreeing with its own header figure,
 * which is the most visible way a finance tool loses trust.
 *
 * Algorithm: truncate each share toward zero, then hand out the remaining units
 * one at a time from the first part onward (Fowler, *PoEAA*, Money pattern).
 */
export function allocate(total: Minor, weights: readonly number[]): Minor[] {
  if (weights.length === 0) {
    throw new MoneyError('allocate() requires at least one weight.');
  }
  if (weights.some((w) => !Number.isFinite(w) || w < 0)) {
    throw new MoneyError('allocate() weights must be finite and non-negative.');
  }

  const totalWeight = weights.reduce((acc, w) => acc + w, 0);
  if (totalWeight <= 0) {
    throw new MoneyError('allocate() requires the weights to sum to more than zero.');
  }

  const shares = weights.map((w) => roundToInteger((total * w) / totalWeight, 'down'));

  let remainder = total - shares.reduce((acc, s) => acc + s, 0);
  const step = remainder < 0 ? -1 : 1;

  // Truncation loses at most one unit per part, so this terminates in under
  // weights.length iterations.
  for (let i = 0; remainder !== 0; i = (i + 1) % shares.length) {
    shares[i] = (shares[i] as number) + step;
    remainder -= step;
  }

  return shares as Minor[];
}

/** Split a total into `parts` equal shares, conserving every minor unit. */
export function split(total: Minor, parts: number): Minor[] {
  if (!Number.isInteger(parts) || parts <= 0) {
    throw new MoneyError(
      `split() requires a positive integer part count, received ${parts}.`,
    );
  }
  return allocate(total, new Array<number>(parts).fill(1));
}

// ── Comparison ───────────────────────────────────────────────────────────────

export function compare(a: Minor, b: Minor): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export const isZero = (a: Minor): boolean => a === 0;
export const isNegative = (a: Minor): boolean => a < 0;
export const isPositive = (a: Minor): boolean => a > 0;

export const min = (a: Minor, b: Minor): Minor => (a <= b ? a : b);
export const max = (a: Minor, b: Minor): Minor => (a >= b ? a : b);

/** Clamp to zero. A remaining balance must never render as a negative figure. */
export const clampAtZero = (a: Minor): Minor => (a < 0 ? ZERO : a);

// ── Formatting ───────────────────────────────────────────────────────────────

/**
 * Format for display. Uses Intl, so no currency-symbol table is maintained here
 * and every locale is handled by the platform.
 */
export function format(
  amount: Minor,
  currency: string,
  locale = 'en-US',
  scaleFactor = 100,
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(amount / scaleFactor);
}

/** Format without the currency symbol, for dense schedule tables. */
export function formatPlain(amount: Minor, locale = 'en-US', scaleFactor = 100): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount / scaleFactor);
}
