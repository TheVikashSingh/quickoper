/**
 * What the unit converter page SHOWS, as data rather than as DOM.
 *
 * The same split as the other shop pages, for the same reason (D72): the page
 * maps this object onto the DOM and does no arithmetic, and
 * `tests/calc/convert-display.test.ts` checks the STRINGS.
 *
 * ─── Rounding, once ─────────────────────────────────────────────────────────
 *
 * Every figure is a whole number of its own steps, rounded half-even once
 * from the exact value: lengths from whole nanometres (`convert.ts`), the
 * fractions' own decimals exactly (every 1/64 inch is 0.015625 in and
 * 0.396875 mm, no more places), and an angle from the exact fraction it was
 * typed as, or from floating point where π comes in. Nothing here is worked
 * from a figure already rounded for show.
 *
 * Nothing the visitor typed reaches the result's markup: the headline, the
 * detail and the facts are built from the parsed numbers. Only the working,
 * which the page sets as text, repeats what was typed.
 */

import {
  angleSteps,
  DENOMINATORS,
  fractionText,
  halfEvenBig,
  hundredthsOfSecond,
  lengthSteps,
  nearestFraction,
  NM_PER,
  parseAngle,
  parseLength,
  splitDms,
  type Angle,
  type AngleUnit,
  type Denominator,
  type LengthUnit,
} from './convert';
import { NM_PER_INCH } from './tap-drill';
import type { Fact } from './true-position-display';

export const UNIT_SYMBOL: Readonly<Record<LengthUnit, string>> = {
  mm: 'mm',
  in: 'in',
  thou: 'thou',
  um: 'µm',
};

const UNIT_NAME: Readonly<Record<LengthUnit, string>> = {
  mm: 'Millimetres',
  in: 'Inches',
  thou: 'Thou',
  um: 'Micrometres',
};

/** Places each unit is shown to: 0.0001 mm and in, 0.1 thou and µm (Gate 6). */
const PLACES: Readonly<Record<LengthUnit, number>> = { mm: 4, in: 4, thou: 1, um: 1 };

/** Whole steps as fixed-point text at `places` decimals: −1 at 4 is "-0.0001". */
export function fixed(count: number, places: number): string {
  const sign = count < 0 ? '-' : '';
  const abs = Math.abs(count);
  const unit = 10 ** places;
  const whole = Math.floor(abs / unit);
  if (places === 0) return `${sign}${whole}`;
  return `${sign}${whole}.${String(abs % unit).padStart(places, '0')}`;
}

/** Fixed-point text with trailing zeros trimmed, down to `min` places. */
function trimmed(count: number, places: number, min: number): string {
  let s = fixed(count, places);
  for (let i = places; i > min && s.endsWith('0'); i--) s = s.slice(0, -1);
  return s.endsWith('.') ? s.slice(0, -1) : s;
}

/** A length in one unit, rounded once: "5.1054 mm". */
export function lengthIn(nm: number, unit: LengthUnit): string {
  return `${fixed(lengthSteps(nm, unit), PLACES[unit])} ${UNIT_SYMBOL[unit]}`;
}

/** n/den of an inch exactly, in millionths of an inch: 1/64 is 15 625. */
const microInches = (numerator: number, den: number): number =>
  (numerator * 1_000_000) / den;
/** n/den of an inch exactly, in nanometres: 1/64 is 396 875. */
const fractionNm = (numerator: number, den: number): number =>
  (numerator * NM_PER_INCH) / den;

export interface FractionRow {
  readonly label: string;
  /** Reduced, as a mixed number: "13/64", "1 3/8". */
  readonly fraction: string;
  /** The fraction exactly, at four to six places: "0.203125 in". */
  readonly inch: string;
  readonly mm: string;
  /** How far the fraction is from the length: "0.0021 in (0.0540 mm) over". */
  readonly error: string;
}

export interface LengthDisplay {
  readonly headline: string;
  readonly detail: string;
  readonly units: readonly Fact[];
  readonly fractions: readonly FractionRow[];
  /** The row of the 64ths chart nearest the part below a whole inch; null on a whole inch. */
  readonly chartRow: number | null;
  readonly working: string;
}

const DENOMINATOR_NAME: Readonly<Record<Denominator, string>> = {
  64: '64ths',
  32: '32nds',
  16: '16ths',
};

function errorText(errorNm: number, tie: boolean): string {
  if (errorNm === 0) return 'exact';
  const way = errorNm > 0 ? 'over' : 'under';
  const abs = Math.abs(errorNm);
  const inch = lengthSteps(abs, 'in');
  const inchText = inch === 0 ? 'less than 0.00005 in' : `${fixed(inch, 4)} in`;
  const tieText = tie ? ', exactly halfway: the even one is taken' : '';
  return `${inchText} (${fixed(lengthSteps(abs, 'mm'), 4)} mm) ${way}${tieText}`;
}

/** A quotient for the working: exact if it ends within four places, else ≈. */
function quotient(num: number, den: number): string {
  const steps = Number(halfEvenBig(BigInt(num) * 10_000n, BigInt(den)));
  const exact = (BigInt(num) * 10_000n) % BigInt(den) === 0n;
  return `${exact ? '= ' : '≈ '}${trimmed(steps, 4, 0)}`;
}

/** A length typed in one unit, in all four and as the nearest fractions of an inch. */
export function lengthDisplay(text: string, unit: LengthUnit): LengthDisplay {
  const { nm, exact } = parseLength(text, unit);
  const units: Fact[] = (['mm', 'in', 'thou', 'um'] as const).map((u) => ({
    label: UNIT_NAME[u],
    value: lengthIn(nm, u),
  }));

  const nearest = DENOMINATORS.map((den) => nearestFraction(nm, den));
  const fractions: FractionRow[] = nearest.map((f) => ({
    label: `Nearest 1/${f.denominator}`,
    fraction: `${fractionText(f.numerator, f.denominator)} in`,
    inch: `${trimmed(microInches(f.numerator, f.denominator), 6, 4)} in`,
    mm: `${trimmed(fractionNm(f.numerator, f.denominator), 6, 4)} mm`,
    error: errorText(f.errorNm, f.tie),
  }));

  const sixtyFourths = nearest[0]?.numerator ?? 0;
  const below = sixtyFourths % 64;

  const metric = unit === 'mm' || unit === 'um';
  const headline = metric ? lengthIn(nm, 'in') : lengthIn(nm, 'mm');
  const nearest64 = fractions[0];

  const pad = (s: string, n: number): string => s.padEnd(n, ' ');
  const typed = text.trim();
  const lines: string[] = [];
  lines.push(
    exact
      ? `${typed} ${UNIT_SYMBOL[unit]} = ${nm} nm`
      : `${typed} ${UNIT_SYMBOL[unit]} is not a whole number of nanometres: taken as ${nm} nm, the nearest`,
    `1 in = 25.4 mm exactly, so 1 in = ${NM_PER_INCH} nm, 1 thou = ${NM_PER.thou} nm.`,
    '',
  );
  for (const u of ['mm', 'in', 'thou', 'um'] as const) {
    lines.push(
      `${pad(UNIT_SYMBOL[u], 5)}${pad(`${nm} ÷ ${NM_PER[u]}`, 22)}${quotient(nm, NM_PER[u])}  → ${lengthIn(nm, u)}`,
    );
  }
  lines.push(
    '',
    'Each shown once, rounded half to even: mm and in to 4 places,',
    'thou and µm to 1.',
    '',
    'The nearest fraction of an inch:',
  );
  for (const f of nearest) {
    const whole = fractionText(f.numerator, f.denominator);
    const unreduced = `${f.numerator}/${f.denominator}`;
    lines.push(
      `${pad(DENOMINATOR_NAME[f.denominator], 7)}${nm} × ${f.denominator} ÷ ${NM_PER_INCH} ${quotient(nm * f.denominator, NM_PER_INCH)}  → ${unreduced}${whole === unreduced ? '' : ` = ${whole}`}`,
    );
  }
  lines.push(
    '',
    'Each to the nearest whole number of 64ths, 32nds or 16ths; exactly',
    'halfway goes to the even one.',
  );

  return {
    headline,
    detail: metric
      ? `In inches, to four places. The nearest 64th is ${nearest64?.fraction ?? ''}.`
      : `In millimetres, to four places. The nearest 64th is ${nearest64?.fraction ?? ''}.`,
    units,
    fractions,
    chartRow: below === 0 ? null : below,
    working: lines.join('\n'),
  };
}

export interface ChartRow {
  /** 1 to 64. */
  readonly sixtyFourths: number;
  readonly fraction: string;
  /** Exactly, at six places: "0.203125". */
  readonly inch: string;
  /** Exactly, at six places: "5.159375". */
  readonly mm: string;
}

/** Every 64th of an inch to one inch, in inches and millimetres, exactly. */
export function sixtyFourthsChart(): readonly ChartRow[] {
  return Array.from({ length: 64 }, (_, i) => {
    const k = i + 1;
    return {
      sixtyFourths: k,
      fraction: fractionText(k, 64),
      inch: fixed(microInches(k, 64), 6),
      mm: fixed(fractionNm(k, 64), 6),
    };
  });
}

// ─── Angles ──────────────────────────────────────────────────────────────────

/** Six places of degrees: 0.0000036°, finer than the 0.01″ the seconds show. */
const DEGREE_PLACES = 6;
/** Eight places of radians: about 0.002″. */
const RADIAN_PLACES = 8;

export function dmsText(hundredths: number): string {
  const d = splitDms(hundredths);
  const sign = d.negative ? '-' : '';
  return `${sign}${d.degrees}° ${d.minutes}′ ${fixed(d.hundredths, 2)}″`;
}

export interface AngleDisplay {
  readonly headline: string;
  readonly detail: string;
  readonly facts: readonly Fact[];
  readonly working: string;
}

/** The angle written out exactly, in degrees, for the working. */
function exactDegrees(a: Extract<Angle, { kind: 'degrees' }>): string {
  const steps = Number((a.num * 10_000_000_000n) / a.den);
  const exact = (a.num * 10_000_000_000n) % a.den === 0n;
  return exact ? `${trimmed(steps, 10, 0)}°` : `${trimmed(steps, 10, 0)}…°`;
}

/** An angle typed in degrees or radians, in all three forms. */
export function angleDisplay(text: string, unit: AngleUnit): AngleDisplay {
  const a = parseAngle(text, unit);
  const degrees = `${fixed(angleSteps(a, 'deg', DEGREE_PLACES), DEGREE_PLACES)}°`;
  const radians = `${fixed(angleSteps(a, 'rad', RADIAN_PLACES), RADIAN_PLACES)} rad`;
  const h = hundredthsOfSecond(a);
  const dms = dmsText(h);
  const facts: Fact[] = [
    { label: 'Degrees, minutes, seconds', value: dms },
    { label: 'Decimal degrees', value: degrees },
    { label: 'Radians', value: radians },
  ];

  const typed = text.trim();
  const lines: string[] = [];
  const seconds = `${fixed(Math.abs(h), 2)}″`;
  const split = splitDms(h);
  const splitLine = `${seconds}${split.negative ? ' (its size)' : ''} = ${split.degrees} × 3600″ + ${split.minutes} × 60″ + ${fixed(split.hundredths, 2)}″`;

  let headline: string;
  let detail: string;
  if (a.kind === 'radians') {
    headline = dms;
    detail = `In degrees, minutes and seconds. In decimal degrees, ${degrees}.`;
    lines.push(
      `${typed} rad × 180 ÷ π = ${degrees}   (π rad = 180° exactly)`,
      '',
      `In seconds: × 3600, rounded once to 0.01″`,
      `  ${splitLine}`,
      `  = ${dms}`,
    );
  } else {
    headline = a.form === 'dms' ? degrees : dms;
    detail =
      a.form === 'dms'
        ? `In decimal degrees, to six places. In radians, ${radians}.`
        : `In degrees, minutes and seconds. In radians, ${radians}.`;
    lines.push(
      a.form === 'dms'
        ? `${typed} = d + m ÷ 60 + s ÷ 3600 = ${a.num < 0n ? '-' : ''}${exactDegrees({ ...a, num: a.num < 0n ? -a.num : a.num })}`
        : `${typed}°`,
      `Decimal degrees, to six places: ${degrees}`,
      '',
      `In seconds: × 3600, rounded once to 0.01″, then split`,
      `  ${splitLine}`,
      `  = ${dms}`,
      '',
      `Radians: × π ÷ 180 = ${radians}   (π rad = 180° exactly)`,
    );
  }
  lines.push(
    '',
    'Rounded once, half to even. Seconds are rounded as a whole count of',
    'hundredths before they are split, so 29.999999° is 30° 0′ 0.00″,',
    'never 29° 59′ 60.00″.',
  );
  return { headline, detail, facts, working: lines.join('\n') };
}
