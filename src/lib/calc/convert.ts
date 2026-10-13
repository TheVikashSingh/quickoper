/**
 * Conversions: a length between millimetres, inches, thou and micrometres, the
 * nearest fraction of an inch, and an angle between decimal degrees, degrees
 * minutes seconds and radians.
 *
 * ─── What this is ───────────────────────────────────────────────────────────
 *
 * Definitions, not measurements. 1 in = 25.4 mm exactly (the 1959
 * international inch), 1 thou = 0.001 in, 1 µm = 0.001 mm, 1° = 60′ = 3600″,
 * π rad = 180°. NIST Special Publication 811, Appendix B.8, prints the inch,
 * the mil and the micron as exact factors and the degree, minute and second in
 * radians to seven figures. Written from `machinist-calc-research`
 * 03-spec/calculations.md, "Conversions", not from the Android app's code, so
 * the two check each other (Gate 7). The published checks, NIST's factors and
 * Inch Calculator's and Omni Calculator's worked examples, are in
 * `tests/calc/convert.test.ts`.
 *
 * ─── Rounding (CLAUDE.md rule 3) ────────────────────────────────────────────
 *
 * WHERE: a typed length becomes whole nanometres, the grid every length on
 *        this site is on, half-even and only if it is not already on it (a
 *        typed 0.123456 in is 3 135 782.4 nm; the display says so). From
 *        there everything is integer arithmetic: mm and inches to four
 *        places, thou and µm to one, the same two steps (100 nm and 2 540 nm),
 *        and each fraction's numerator, all half-even, once.
 * TIES:  a fraction ties only where the length sits on an odd 128th (or 64th,
 *        32nd) exactly. The tie goes to the even numerator. A 64ths tie cannot
 *        happen at all: an odd 128th is 198 437.5 nm, half a nanometre off the
 *        grid (the spec's note on 0.2578125 in, which is 6 548 438 nm and so
 *        rightly 17/64).
 * ANGLES: a typed angle in degrees is held as an exact fraction, so its
 *        decimal degrees (six places) and its seconds (whole hundredths of an
 *        arc-second, rounded once and only then split into ° ′ ″) are exact,
 *        ties to even. So 29.999999° is 30° 0′ 0.00″, never 29° 59′ 60.00″.
 *        Radians are degrees × π / 180, irrational for any angle but 0, so no
 *        rounding boundary can be met; they are worked in floating point and
 *        checked against a 60-digit reference, as are degrees from radians.
 */

import { NM_PER_INCH } from './tap-drill';

export type LengthUnit = 'mm' | 'in' | 'thou' | 'um';

/** Nanometres in one of each unit. All four exact. */
export const NM_PER: Readonly<Record<LengthUnit, number>> = {
  mm: 1_000_000,
  in: NM_PER_INCH,
  thou: 25_400,
  um: 1_000,
};

/** The longest length taken: 10 m, as the countersink page. */
export const MAX_LENGTH_NM = 10_000_000_000;

/** The largest angle taken, either way round: ten turns. */
export const MAX_DEGREES = 3600;

/** The fractions of an inch a shop rule and a drill index are marked in. */
export type Denominator = 16 | 32 | 64;
export const DENOMINATORS: readonly Denominator[] = [64, 32, 16];

/** Half-even of num / den, both whole, den positive. */
export function halfEvenBig(num: bigint, den: bigint): bigint {
  const negative = num < 0n;
  const n = negative ? -num : num;
  let q = n / den;
  const twice = 2n * (n - q * den);
  if (twice > den || (twice === den && q % 2n === 1n)) q += 1n;
  return negative ? -q : q;
}

/** A typed decimal as an exact fraction: "12.50" is 1250 / 100. */
interface Decimal {
  num: bigint;
  den: bigint;
}

const DECIMAL = /^(\d+)(?:\.(\d*))?$|^\.(\d+)$/;

/** A plain, unsigned decimal, or null if the text is not one. */
function decimal(text: string): Decimal | null {
  const m = DECIMAL.exec(text);
  if (m === null) return null;
  const whole = m[1] ?? '0';
  const frac = m[2] ?? m[3] ?? '';
  return { num: BigInt(whole + frac), den: 10n ** BigInt(frac.length) };
}

export interface Length {
  /** Whole nanometres. */
  nm: number;
  /** Whether the typed length was already a whole number of nanometres. */
  exact: boolean;
}

/** A length as the exact fraction it was typed as, in nanometres. */
function onGrid(numNm: bigint, den: bigint): Length {
  const whole = halfEvenBig(numNm, den);
  if (whole > BigInt(MAX_LENGTH_NM)) {
    throw new RangeError('A length over 10 m is a slip in the inputs.');
  }
  return { nm: Number(whole), exact: whole * den === numNm };
}

const FRACTION = /^(?:(\d+)[\s-]+)?(\d+)\s*\/\s*(\d+)$/;

/**
 * A typed length. Decimals in any unit: `0.201`, `.5`, `12`. In inches also a
 * fraction: `13/64`, `1 3/8` or `1-3/8`. Refused in words: anything else, a
 * minus sign, a zero denominator, and over 10 m.
 */
export function parseLength(text: string, unit: LengthUnit): Length {
  const t = text.trim();
  if (t === '') throw new RangeError('Enter a length.');
  if (t.startsWith('-') || t.startsWith('−')) {
    throw new RangeError('A length is zero or more.');
  }
  const per = BigInt(NM_PER[unit]);
  const d = decimal(t);
  if (d !== null) return onGrid(d.num * per, d.den);
  const f = FRACTION.exec(t);
  if (f !== null) {
    if (unit !== 'in') {
      throw new RangeError(
        'A fraction is taken in inches. Switch the unit to inches, or type a decimal.',
      );
    }
    const whole = BigInt(f[1] ?? '0');
    const top = BigInt(f[2] ?? '0');
    const bottom = BigInt(f[3] ?? '0');
    if (bottom === 0n)
      throw new RangeError('A fraction’s bottom number has to be more than zero.');
    if (f[1] !== undefined && top >= bottom) {
      throw new RangeError(
        'In a mixed number such as 1 3/8 the fraction is less than one.',
      );
    }
    return onGrid((whole * bottom + top) * per, bottom);
  }
  throw new RangeError(
    unit === 'in'
      ? 'Enter the length as a decimal, such as 0.201, or a fraction, such as 13/64 or 1 3/8.'
      : 'Enter the length as a decimal, such as 12.5.',
  );
}

/** A length in a unit's display steps: 0.0001 mm or in, 0.1 µm or thou. */
export const STEP_NM: Readonly<Record<LengthUnit, number>> = {
  mm: 100,
  in: 2_540,
  thou: 2_540,
  um: 100,
};

/** Whole display steps of a length, half-even, once. */
export function lengthSteps(nm: number, unit: LengthUnit): number {
  return Number(halfEvenBig(BigInt(nm), BigInt(STEP_NM[unit])));
}

export interface NearestFraction {
  denominator: Denominator;
  /** In units of 1/denominator, not reduced: 13 for 13/64. */
  numerator: number;
  /** The fraction less the length, in nanometres: positive when it is over. */
  errorNm: number;
  /** Whether the length sat exactly halfway, so the even numerator was taken. */
  tie: boolean;
}

/** The nearest 1/16, 1/32 or 1/64 inch to a length, a tie to the even numerator. */
export function nearestFraction(nm: number, denominator: Denominator): NearestFraction {
  const scaled = BigInt(nm) * BigInt(denominator);
  const inch = BigInt(NM_PER_INCH);
  const numerator = Number(halfEvenBig(scaled, inch));
  const rem = scaled % inch;
  // Every 1/16, 1/32 and 1/64 inch is a whole number of nanometres.
  const errorNm = (numerator * NM_PER_INCH) / denominator - nm;
  return { denominator, numerator, errorNm, tie: 2n * rem === inch };
}

/** A fraction of an inch reduced, as a mixed number: 24/16 is "1 1/2". */
export function fractionText(numerator: number, denominator: number): string {
  const whole = Math.floor(numerator / denominator);
  let top = numerator % denominator;
  let bottom = denominator;
  while (top % 2 === 0 && bottom % 2 === 0 && top > 0) {
    top /= 2;
    bottom /= 2;
  }
  if (top === 0) return String(whole);
  return whole === 0 ? `${top}/${bottom}` : `${whole} ${top}/${bottom}`;
}

// ─── Angles ──────────────────────────────────────────────────────────────────

export type AngleUnit = 'deg' | 'rad';

export type Angle =
  | {
      /** Typed in degrees, decimal or ° ′ ″: held exactly, in degrees. */
      kind: 'degrees';
      form: 'decimal' | 'dms';
      num: bigint;
      den: bigint;
    }
  | {
      /** Typed in radians: exact as typed, irrational in degrees. */
      kind: 'radians';
      num: bigint;
      den: bigint;
    };

/**
 * Degrees, minutes and seconds in any of the ways a drawing or a person
 * writes them: `12 30 15`, `12°30′15″`, `12° 30' 15"`, `12d 30m 15s`. Minutes
 * and seconds are optional and under 60; only the last part may have
 * decimals.
 */
const DMS =
  /^(\d+(?:\.\d*)?)\s*(?:°|d|deg)?\s*(?:(\d+(?:\.\d*)?)\s*(?:′|'|m|min)?\s*(?:(\d+(?:\.\d*)?)\s*(?:″|"|''|s|sec)?)?)?$/i;

/**
 * A typed angle. In degrees: `12.5`, `-12.5`, or ° ′ ″ in any of the forms
 * above. In radians: a decimal. Refused in words: anything else, minutes or
 * seconds of 60 or more, decimals before the last part, and more than ten
 * turns.
 */
export function parseAngle(text: string, unit: AngleUnit): Angle {
  let t = text.trim();
  if (t === '') throw new RangeError('Enter an angle.');
  const negative = t.startsWith('-') || t.startsWith('−');
  if (negative) t = t.slice(1).trim();
  const signed = (n: bigint): bigint => (negative ? -n : n);

  if (unit === 'rad') {
    const d = decimal(t);
    if (d === null)
      throw new RangeError('Enter the angle in radians as a decimal, such as 0.5.');
    const angle: Angle = { kind: 'radians', num: signed(d.num), den: d.den };
    if (Math.abs(degreesOf(angle)) > MAX_DEGREES) {
      throw new RangeError(
        'An angle of more than ten turns, 3600°, is a slip in the inputs.',
      );
    }
    return angle;
  }

  const plainDecimal = decimal(t);
  const m = plainDecimal === null ? DMS.exec(t) : null;
  if (plainDecimal === null && m === null) {
    throw new RangeError(
      'Enter the angle as decimal degrees, such as 12.5, or as degrees, minutes and seconds, such as 12 30 15.',
    );
  }
  let num: bigint;
  let den: bigint;
  let form: 'decimal' | 'dms';
  if (plainDecimal !== null) {
    ({ num, den } = plainDecimal);
    form = 'decimal';
  } else {
    const parts = [m?.[1], m?.[2], m?.[3]].filter((p): p is string => p !== undefined);
    const values = parts.map((p) => decimal(p));
    if (values.some((v) => v === null)) {
      throw new RangeError(
        'Enter the angle as degrees, minutes and seconds, such as 12 30 15.',
      );
    }
    const [deg, min, sec] = values as Decimal[];
    if (parts.slice(0, -1).some((p) => p.includes('.'))) {
      throw new RangeError(
        'Only the last part can have decimals: 12 30 15.5, not 12.5 30 15.',
      );
    }
    for (const [v, name] of [
      [min, 'Minutes'],
      [sec, 'Seconds'],
    ] as const) {
      if (v !== undefined && v.num >= 60n * v.den) {
        throw new RangeError(`${name} have to be less than 60.`);
      }
    }
    // d + m / 60 + s / 3600, over one common denominator.
    const D = deg as Decimal;
    den = 3600n * D.den * (min?.den ?? 1n) * (sec?.den ?? 1n);
    num =
      D.num * 3600n * (min?.den ?? 1n) * (sec?.den ?? 1n) +
      (min === undefined ? 0n : min.num * 60n * D.den * (sec?.den ?? 1n)) +
      (sec === undefined ? 0n : sec.num * D.den * (min?.den ?? 1n));
    form = parts.length === 1 ? 'decimal' : 'dms';
  }
  if (num > BigInt(MAX_DEGREES) * den) {
    throw new RangeError(
      'An angle of more than ten turns, 3600°, is a slip in the inputs.',
    );
  }
  return { kind: 'degrees', form, num: signed(num), den };
}

/** The angle in degrees, as a float. */
export function degreesOf(a: Angle): number {
  const v = Number(a.num) / Number(a.den);
  return a.kind === 'degrees' ? v : (v * 180) / Math.PI;
}

/** The angle in radians, as a float. */
export function radiansOf(a: Angle): number {
  const v = Number(a.num) / Number(a.den);
  return a.kind === 'radians' ? v : (v * Math.PI) / 180;
}

/** Half-even of a float to a whole number. Its callers' values are irrational. */
function halfEvenFloat(x: number): number {
  const floor = Math.floor(x);
  const diff = x - floor;
  const r =
    diff > 0.5 ? floor + 1 : diff < 0.5 ? floor : floor % 2 === 0 ? floor : floor + 1;
  return r === 0 ? 0 : r;
}

/**
 * The angle at `places` decimals in its own unit or the other, as a whole
 * count of steps (of 10^−places). Exact where the angle was typed in that
 * unit, from floating point where it must cross π.
 */
export function angleSteps(a: Angle, unit: AngleUnit, places: number): number {
  const scale = 10n ** BigInt(places);
  if ((a.kind === 'degrees') === (unit === 'deg')) {
    return Number(halfEvenBig(a.num * scale, a.den));
  }
  const v = unit === 'deg' ? degreesOf(a) : radiansOf(a);
  return halfEvenFloat(v * Number(scale));
}

/** The angle as whole hundredths of an arc-second, rounded once. */
export function hundredthsOfSecond(a: Angle): number {
  if (a.kind === 'degrees') return Number(halfEvenBig(a.num * 360_000n, a.den));
  return halfEvenFloat(degreesOf(a) * 360_000);
}

export interface Dms {
  negative: boolean;
  degrees: number;
  minutes: number;
  /** Hundredths of a second, 0 to 5999. */
  hundredths: number;
}

/** Whole hundredths of a second split into ° ′ ″, after the one rounding. */
export function splitDms(hundredths: number): Dms {
  const negative = hundredths < 0;
  const h = Math.abs(hundredths);
  return {
    negative,
    degrees: Math.floor(h / 360_000),
    minutes: Math.floor((h % 360_000) / 6_000),
    hundredths: h % 6_000,
  };
}
