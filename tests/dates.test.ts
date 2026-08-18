import { describe, expect, it } from 'vitest';

import {
  DateError,
  addMonths,
  currentYearMonth,
  formatYearMonth,
  parseYearMonth,
  toInputValue,
} from '../src/lib/dates';

/**
 * Dates are presentation, not arithmetic, so these are not anchored to a
 * published financial schedule the way `calc/` fixtures are (D7, D63). What they
 * pin is the two failure modes the integer representation exists to make
 * impossible — month-end overflow and DST — plus the year boundaries where
 * off-by-one lives.
 */
describe('addMonths', () => {
  it('advances within a year', () => {
    expect(addMonths(202601, 1)).toBe(202602);
    expect(addMonths(202601, 11)).toBe(202612);
  });

  it('rolls the year over rather than producing month 13', () => {
    expect(addMonths(202612, 1)).toBe(202701);
    expect(addMonths(202611, 2)).toBe(202701);
  });

  it('does not skip February from a 31-day month', () => {
    // The whole reason this is integer arithmetic. `new Date(2026, 0, 31)` plus
    // one month is 3 March in JavaScript, because Date overflows instead of
    // clamping. There is no day here, so there is nothing to overflow.
    expect(addMonths(202601, 1)).toBe(202602);
    expect(addMonths(202603, 1)).toBe(202604);
  });

  it('handles long spans, which is what a 30-year schedule is', () => {
    expect(addMonths(202608, 360)).toBe(205608);
    expect(addMonths(202608, 224)).toBe(204504);
    expect(addMonths(202601, 12)).toBe(202701);
  });

  it('borrows from the year when moving backwards', () => {
    expect(addMonths(202601, -1)).toBe(202512);
    expect(addMonths(202601, -13)).toBe(202412);
    expect(addMonths(202608, 0)).toBe(202608);
  });

  it('rejects anything that is not a real YYYYMM', () => {
    expect(() => addMonths(202613, 1)).toThrow(DateError);
    expect(() => addMonths(202600, 1)).toThrow(DateError);
    expect(() => addMonths(189912, 1)).toThrow(DateError);
    expect(() => addMonths(202608.5, 1)).toThrow(DateError);
    expect(() => addMonths(202608, 1.5)).toThrow(DateError);
  });
});

describe('currentYearMonth', () => {
  it('reads a supplied date rather than the clock', () => {
    // The clock is injectable precisely so nothing else has to touch it, and so
    // this assertion does not expire overnight.
    expect(currentYearMonth(new Date(2026, 7, 18))).toBe(202608);
    expect(currentYearMonth(new Date(2026, 0, 1))).toBe(202601);
    expect(currentYearMonth(new Date(2026, 11, 31))).toBe(202612);
  });
});

describe('parseYearMonth', () => {
  it('accepts exactly what an input type=month produces', () => {
    expect(parseYearMonth('2026-08')).toBe(202608);
    expect(parseYearMonth('2026-01')).toBe(202601);
    expect(parseYearMonth('2026-12')).toBe(202612);
  });

  it('returns null rather than a coerced guess', () => {
    expect(parseYearMonth(null)).toBeNull();
    expect(parseYearMonth('')).toBeNull();
    expect(parseYearMonth('2026-13')).toBeNull();
    expect(parseYearMonth('2026-00')).toBeNull();
    expect(parseYearMonth('2026-8')).toBeNull();
    expect(parseYearMonth('202608')).toBeNull();
    expect(parseYearMonth('1899-12')).toBeNull();
  });
});

describe('toInputValue', () => {
  it('pads the month so the input accepts it', () => {
    expect(toInputValue(202608)).toBe('2026-08');
    expect(toInputValue(202612)).toBe('2026-12');
    expect(toInputValue(204504)).toBe('2045-04');
  });
});

describe('formatYearMonth', () => {
  it('renders a short month and a full year', () => {
    expect(formatYearMonth(202608, 'en-US')).toBe('Aug 2026');
    expect(formatYearMonth(204504, 'en-US')).toBe('Apr 2045');
  });

  it('does not shift a month for a reader west of Greenwich', () => {
    // Built with Date.UTC and formatted in UTC. A local-time midnight on the
    // 1st is the PREVIOUS month everywhere in the Americas, which would show
    // every row of the schedule one month early.
    expect(formatYearMonth(202601, 'en-US')).toBe('Jan 2026');
    expect(formatYearMonth(202612, 'en-US')).toBe('Dec 2026');
  });

  it('follows the locale it is given', () => {
    expect(formatYearMonth(202608, 'en-GB')).toBe('Aug 2026');
  });
});
