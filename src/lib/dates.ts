/**
 * Calendar months for a payment schedule.
 *
 * ─── Why this is not in calc/ ───────────────────────────────────────────────
 *
 * CLAUDE.md rule 1 requires `lib/calc/**` to be pure functions with fixture
 * tests. A schedule's *dates* are a presentation concern, not arithmetic: the
 * engines return month indices and always will, because a fixture that depended
 * on the clock would fail the following morning. `calc/` stays clock-free — it
 * contains no `Date` today and must not gain one.
 *
 * ─── Why months are integers, not Date objects ──────────────────────────────
 *
 * A month is stored as `YYYYMM` — August 2026 is `202608` — and advanced by
 * integer arithmetic. Doing it with `Date` invites two classic bugs and this
 * avoids both outright rather than handling them:
 *
 *   MONTH-END.  `new Date(2026, 0, 31)` plus one month is 3 March, not 28
 *               February, because JavaScript overflows rather than clamping. A
 *               schedule starting on the 31st would skip a month roughly seven
 *               times a year.
 *   DST.        Adding months in local time crosses daylight-saving boundaries
 *               and can land an hour earlier, which flips the day at midnight.
 *
 * Neither can happen to an integer. There is no day component at all, which is
 * also why the input asks only for a month and a year: a mortgage schedule
 * anchored to "March 2045" is exactly as useful as one anchored to "14 March
 * 2045", and the day would be a precision we have not got and cannot check.
 */

/** Bounds for a schedule anchor. Wide enough for any real mortgage. */
export const MIN_YEAR_MONTH = 190001;
export const MAX_YEAR_MONTH = 210012;

export class DateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DateError';
  }
}

function assertYearMonth(value: number): void {
  if (!Number.isInteger(value) || value < MIN_YEAR_MONTH || value > MAX_YEAR_MONTH) {
    throw new DateError(`${value} is not a YYYYMM month in range.`);
  }
  const month = value % 100;
  if (month < 1 || month > 12) {
    throw new DateError(`${value} has no month between 01 and 12.`);
  }
}

/**
 * The month a schedule starts in, from the clock.
 *
 * `now` is a parameter so this is testable and so nothing else in the codebase
 * has to read the clock. It is called in the island, never at build time — a
 * date baked into static HTML would be correct on the day it deployed and wrong
 * every day after.
 */
export function currentYearMonth(now: Date = new Date()): number {
  return now.getFullYear() * 100 + (now.getMonth() + 1);
}

/** Advance a YYYYMM by whole months. Negative moves backwards. */
export function addMonths(yearMonth: number, months: number): number {
  assertYearMonth(yearMonth);
  if (!Number.isInteger(months)) {
    throw new DateError('Months to add must be a whole number.');
  }

  const year = Math.floor(yearMonth / 100);
  const monthIndex = (yearMonth % 100) - 1 + months;

  // Floor division, so negative offsets borrow from the year correctly:
  // -1 month from January 2026 is December 2025, not month zero of 2026.
  const yearsMoved = Math.floor(monthIndex / 12);
  const finalMonth = monthIndex - yearsMoved * 12 + 1;

  return (year + yearsMoved) * 100 + finalMonth;
}

/**
 * Parse the value of an `<input type="month">`, which is always `YYYY-MM`.
 * Returns null on anything else — never a coerced guess, matching params.ts.
 */
export function parseYearMonth(raw: string | null): number | null {
  if (raw === null || !/^\d{4}-\d{2}$/.test(raw)) return null;
  const value = Number(raw.slice(0, 4)) * 100 + Number(raw.slice(5, 7));
  try {
    assertYearMonth(value);
  } catch {
    return null;
  }
  return value;
}

/** Format for an `<input type="month">` value attribute. */
export function toInputValue(yearMonth: number): string {
  assertYearMonth(yearMonth);
  return `${Math.floor(yearMonth / 100)}-${String(yearMonth % 100).padStart(2, '0')}`;
}

/**
 * `Intl.DateTimeFormat` is one of the more expensive constructors on the
 * platform, and a 360-row schedule formats one date per row. Cached per locale,
 * the same reasoning money.ts gives for its number formatters.
 */
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(locale: string): Intl.DateTimeFormat {
  let cached = formatters.get(locale);
  if (cached === undefined) {
    cached = new Intl.DateTimeFormat(locale, {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
    formatters.set(locale, cached);
  }
  return cached;
}

/**
 * "Mar 2045".
 *
 * Built with `Date.UTC` and formatted in UTC so the rendered month cannot shift
 * for a reader west of Greenwich — a local-time midnight on the 1st is the
 * previous month for anyone in the Americas.
 */
export function formatYearMonth(yearMonth: number, locale = 'en-US'): string {
  assertYearMonth(yearMonth);
  const date = new Date(Date.UTC(Math.floor(yearMonth / 100), (yearMonth % 100) - 1, 1));
  return formatter(locale).format(date);
}
