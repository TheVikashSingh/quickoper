/**
 * What the feeds and speeds page SHOWS, as data rather than as DOM.
 *
 * The page used to do this itself: it converted, rounded and wrote its working
 * in its own script — the arrangement D72 moved the tap drill page away from,
 * because the tests stopped at the module boundary and the page's own
 * arithmetic was never checked. Now the page maps this object onto the DOM and
 * `tests/calc/feeds-speeds-display.test.ts` checks the strings.
 *
 * ─── Rounding, once ─────────────────────────────────────────────────────────
 *
 * Every length, feed and rate is rounded half-even once, from the value as
 * computed, to four decimals (Gate 6), and printed fixed so the figures line
 * up. The spindle speed is shown as the whole number a control takes, and
 * every feed is still worked from the unrounded n (calculations.md §1).
 *
 * ─── The vf line multiplies out as printed ──────────────────────────────────
 *
 * The working once printed `vf = 0.4 × 3183.1 = 1273.2395`, and 0.4 × 3183.1
 * is 1273.24. The Android app fixed its own copy of this (app PR #60,
 * calculations.md §1): n is printed to the fewest places, four to six, at
 * which fn × n multiplied exactly as printed and rounded half-even gives the
 * vf printed — `0.4000 × 3183.09886 = 1273.2395`. Where no such printing
 * exists, the line says so.
 */

import { formatSteps, roundHalfEvenWhole } from './hole-pattern-display';
import {
  boringDepthOfCut,
  chipThinning,
  chipThinningSquared,
  cuttingDiameterAtDepth,
  drillingMrr,
  feedPerRev,
  maxChipThickness,
  meanChipThickness,
  millingMrr,
  removalRateFor,
  restoringFeed,
  spindleSpeed,
  SQUARE_SHOULDER_DEG,
  tableFeed,
  turningMrr,
  type UnitSystem,
} from './feeds-speeds';
import { inchToNm, mmToNm, nm, type Nanometres } from './tap-drill';

export type Operation = 'milling' | 'turning' | 'drilling' | 'boring';

export interface FeedsInput {
  readonly op: Operation;
  readonly units: UnitSystem;
  /** Cutting speed: m/min, or surface feet per minute in inch units. */
  readonly vc: number;
  /** The cutter, the workpiece at the cut, the drill, or the bore this pass makes. */
  readonly diameter: number;
  /** Feed per tooth when milling; feed per revolution otherwise. */
  readonly feed: number;
  /** Milling only. */
  readonly teeth: number;
  readonly ae: number;
  /** Milling and turning. */
  readonly ap: number;
  /** Boring: the hole as it is before this pass. */
  readonly d0: number;
  /** Milling: the entering angle in degrees; null (blank) for a square shoulder. */
  readonly kappa: number | null;
}

export interface Stat {
  readonly label: string;
  readonly value: string;
  readonly unit: string;
  /** A short line under the figure, or null. */
  readonly note: string | null;
}

export interface FeedsDisplay {
  readonly stats: readonly Stat[];
  /** Milling with a thinned chip: the feed that would restore it. Never applied. */
  readonly restore: {
    readonly value: string;
    readonly unit: string;
    readonly note: string;
  } | null;
  /** The "how this was calculated" block, verbatim. */
  readonly working: string;
  /** What the power panel needs, unrounded. */
  readonly power: {
    readonly mrrCm3: number;
    /** The chip thickness the Kienzle force takes, nm. */
    readonly chipNm: number;
    /** How the power panel names that chip. */
    readonly chipLabel: string;
  };
}

/** Display steps: 0.0001 of the unit, in nanometres of it. Both exact. */
const STEP_NM: Readonly<Record<UnitSystem, number>> = { metric: 100, inch: 2_540 };

/** A length, a feed per rev or a feed per minute, in nm (of it), as fixed four places. */
function fixed(valueNm: number, units: UnitSystem): string {
  return formatSteps(roundHalfEvenWhole(valueNm / STEP_NM[units]));
}

/** Whole display steps of a length or feed, rounded once. */
function stepsOf(valueNm: number, units: UnitSystem): number {
  return roundHalfEvenWhole(valueNm / STEP_NM[units]);
}

/**
 * Whole display steps of a length known by its exact square, num / den nm²:
 * half-even, with a tie decided exactly rather than by float noise.
 */
export function stepsOfSquare(num: bigint, den: bigint, units: UnitSystem): number {
  const s = BigInt(STEP_NM[units]);
  const v4 = 4n * num; // (2v)² × den
  let m = BigInt(roundHalfEvenWhole(Math.sqrt(Number(num) / Number(den)) / Number(s)));
  for (;;) {
    const lo = (2n * m - 1n) * s; // 2 × (m − ½) steps
    const hi = (2n * m + 1n) * s;
    if (m > 0n && v4 < lo * lo * den) {
      m -= 1n;
    } else if (v4 > hi * hi * den) {
      m += 1n;
    } else if (v4 === hi * hi * den && m % 2n === 1n) {
      return Number(m + 1n);
    } else if (m > 0n && v4 === lo * lo * den && m % 2n === 1n) {
      return Number(m - 1n);
    } else {
      return Number(m);
    }
  }
}

/** A plain number at four fixed places: rev/min, cm³/min. */
function four(value: number): string {
  return formatSteps(roundHalfEvenWhole(value * 10_000));
}

/** A typed input as written, without float noise: 100, 0.25. */
function typed(value: number): string {
  return String(Number(value.toPrecision(12)));
}

/** A whole number scaled by 10^places, as a decimal string. Not negative here. */
function decimal(scaled: number, places: number): string {
  const s = String(scaled).padStart(places + 1, '0');
  return `${s.slice(0, s.length - places)}.${s.slice(s.length - places)}`;
}

/** a ÷ b rounded half-even, for a ≥ 0 and b > 0. */
function halfEvenDivide(a: bigint, b: bigint): bigint {
  const q = a / b;
  const twice = 2n * (a % b);
  if (twice > b) return q + 1n;
  if (twice < b) return q;
  return q % 2n === 0n ? q : q + 1n;
}

/**
 * n printed to the fewest places, four to six, at which fn × n multiplied
 * exactly as printed and rounded half-even gives the vf printed. Null when no
 * such printing exists.
 */
export function rpmAsPrinted(
  fnSteps: number,
  rpm: number,
  vfSteps: number,
): string | null {
  for (const places of [4, 5, 6]) {
    const scale = 10 ** places;
    const nScaled = roundHalfEvenWhole(rpm * scale);
    const product = BigInt(fnSteps) * BigInt(nScaled);
    if (halfEvenDivide(product, BigInt(scale)) === BigInt(vfSteps)) {
      return decimal(nScaled, places);
    }
  }
  return null;
}

/** A typed length as whole nanometres, refusing what is not a length. */
function lengthNm(value: number, what: string, units: UnitSystem): Nanometres {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`Enter ${what} as a number above zero.`);
  }
  return units === 'metric' ? mmToNm(value) : inchToNm(value);
}

/** One pass cannot cut wider than the cutter: the width check stays at Dc (§3). */
function requireWidth(aeNm: number, dcNm: number): void {
  if (aeNm > dcNm) {
    throw new RangeError(
      'The width of cut aₑ cannot be more than the cutter diameter: that is two passes.',
    );
  }
}

const DIAMETER_WHAT: Readonly<Record<Operation, string>> = {
  milling: 'the cutter diameter',
  turning: 'the workpiece diameter',
  drilling: 'the drill diameter',
  boring: 'the final bore',
};

/**
 * Everything the feeds and speeds page shows, computed and formatted.
 *
 * Throws `RangeError` with the sentence the page shows the user.
 */
export function feedsDisplay(input: FeedsInput): FeedsDisplay {
  const { op, units: u } = input;
  const milling = op === 'milling';
  const metric = u === 'metric';
  const L = metric ? 'mm' : 'in';
  const perRev = metric ? 'mm/rev' : 'in/rev';
  const perMin = metric ? 'mm/min' : 'in/min';

  if (!Number.isFinite(input.vc) || input.vc <= 0) {
    throw new RangeError('Enter the cutting speed as a number above zero.');
  }
  const vc = input.vc;
  const dcNm = lengthNm(input.diameter, DIAMETER_WHAT[op], u);
  const feedNm = lengthNm(
    input.feed,
    milling ? 'the feed per tooth' : 'the feed per rev',
    u,
  );

  // ─── Milling's cutting diameter ──────────────────────────────────────
  let teeth = 1;
  let aeNm = dcNm;
  let kappa = SQUARE_SHOULDER_DEG;
  let apNm: Nanometres;
  if (milling) {
    if (!Number.isInteger(input.teeth) || input.teeth < 1) {
      throw new RangeError('Enter the number of teeth as a whole number, 1 or more.');
    }
    teeth = input.teeth;
    aeNm = lengthNm(input.ae, 'the width of cut aₑ', u);
    requireWidth(aeNm, dcNm);
    if (input.kappa !== null) kappa = input.kappa;
  }
  const d0Nm = op === 'boring' ? lengthNm(input.d0, 'the starting bore', u) : null;
  if (op === 'drilling') {
    // A drill has no depth of cut to enter: drilling IS turning at Dc/4
    // (`drillingMrr`), and nothing below uses ap for a drill.
    apNm = nm(Math.max(1, Math.round(dcNm / 4)));
  } else if (d0Nm !== null) {
    apNm = boringDepthOfCut(d0Nm, dcNm);
  } else {
    apNm = lengthNm(input.ap, 'the depth of cut aₚ', u);
  }
  // The diameter the speed and the chip are worked at: Dcap on an angled
  // cutter, Dc otherwise (Sandvik, H 79). The width check above stays at Dc.
  const cutNm = milling ? cuttingDiameterAtDepth(dcNm, apNm, kappa) : dcNm;
  const angled = milling && kappa !== SQUARE_SHOULDER_DEG;

  // ─── Speed, feed, removal rate ───────────────────────────────────────
  const rpm = spindleSpeed(vc, cutNm as Nanometres, u);
  const fnNm = milling ? feedPerRev(feedNm, teeth) : feedNm;
  const vfNm = tableFeed(fnNm, rpm);
  const mrrCm3 = milling
    ? millingMrr(aeNm as Nanometres, apNm, vfNm)
    : op === 'drilling'
      ? drillingMrr(vc, dcNm, fnNm, u)
      : turningMrr(vc, apNm, fnNm, u);
  const rate = removalRateFor(mrrCm3, u);

  const S = roundHalfEvenWhole(rpm);
  const fnSteps = stepsOf(fnNm, u);
  const vfSteps = stepsOf(vfNm, u);
  const lines: string[] = [];

  // ─── Working: speed and feed ─────────────────────────────────────────
  const dName = angled ? 'Dcap' : op === 'boring' ? 'd₁' : 'Dc';
  if (angled) {
    lines.push(
      `Dcap = Dc + 2 × ap / tan κr = ${fixed(dcNm, u)} + 2 × ${fixed(apNm, u)} / tan ${typed(kappa)}° = ${fixed(cutNm, u)} ${L}`,
      '       the diameter an angled cutter cuts at, at depth ap (Sandvik Coromant)',
      '',
    );
  }
  lines.push(
    `n  = ${metric ? 'Vc × 1000' : 'Vc × 12'} / (π × ${dName})`,
    `   = ${typed(vc)} × ${metric ? '1000' : '12'} / (π × ${fixed(cutNm, u)} ${L})`,
    `   = ${four(rpm)} rev/min, so S${S}`,
    '',
  );
  if (milling) {
    const fzSteps = stepsOf(feedNm, u);
    lines.push(
      `fn = fz × z = ${fixed(feedNm, u)} × ${teeth} = ${fixed(fnNm, u)} ${perRev}` +
        (fzSteps * teeth === fnSteps ? '' : '   (fz shown rounded)'),
    );
  } else {
    lines.push(`fn = ${fixed(fnNm, u)} ${perRev}   (entered)`);
  }
  const nShown = rpmAsPrinted(fnSteps, rpm, vfSteps);
  lines.push(
    nShown === null
      ? `vf = fn × n = ${fixed(fnNm, u)} × ${decimal(roundHalfEvenWhole(rpm * 1e6), 6)} = ${fixed(vfNm, u)} ${perMin}` +
          '   (fn and n are rounded here, so this may not multiply out exactly)'
      : `vf = fn × n = ${fixed(fnNm, u)} × ${nShown} = ${fixed(vfNm, u)} ${perMin}`,
    '',
  );

  // ─── Working: removal rate ───────────────────────────────────────────
  // Metric and inch are different equations here, not one with the numbers
  // swapped: metric divides mm³ down to cm³, inch multiplies surface FEET per
  // minute up to inches per minute.
  const q = `${four(rate.value)} ${rate.unit}`;
  const a = (v: number) => fixed(v, u);
  if (milling) {
    lines.push(
      metric
        ? `Q  = ae × ap × vf / 1000 = ${a(aeNm)} × ${a(apNm)} × ${a(vfNm)} / 1000 = ${q}`
        : `Q  = ae × ap × vf = ${a(aeNm)} × ${a(apNm)} × ${a(vfNm)} = ${q}`,
    );
  } else if (op === 'drilling') {
    lines.push(
      metric
        ? `Q  = Dc × fn × Vc / 4 = ${a(dcNm)} × ${a(fnNm)} × ${typed(vc)} / 4 = ${q}`
        : `Q  = Dc × fn × Vc × 12 / 4 = ${a(dcNm)} × ${a(fnNm)} × ${typed(vc)} × 12 / 4 = ${q}`,
      '     a drill removes the whole cylinder, not a swept slot',
    );
  } else {
    if (d0Nm !== null) {
      lines.push(`ap = (d₁ − d₀) / 2 = (${a(dcNm)} − ${a(d0Nm)}) / 2 = ${a(apNm)} ${L}`);
    }
    lines.push(
      metric
        ? `Q  = Vc × ap × fn = ${typed(vc)} × ${a(apNm)} × ${a(fnNm)} = ${q}`
        : `Q  = Vc × 12 × ap × fn = ${typed(vc)} × 12 × ${a(apNm)} × ${a(fnNm)} = ${q}`,
    );
  }

  const stats: Stat[] = [
    {
      label: 'Spindle speed',
      value: String(S),
      unit: 'rev/min',
      note: angled ? `at Dcap ${fixed(cutNm, u)} ${L}` : null,
    },
    { label: 'Feed', value: fixed(vfNm, u), unit: perMin, note: null },
    { label: 'Feed per rev', value: fixed(fnNm, u), unit: perRev, note: null },
    { label: 'Removal rate', value: four(rate.value), unit: rate.unit, note: null },
  ];

  if (!milling) {
    stats.push({
      label: 'Chip thickness',
      value: fixed(fnNm, u),
      unit: L,
      note: 'h = fn',
    });
    return {
      stats,
      restore: null,
      working: lines.join('\n'),
      power: { mrrCm3, chipNm: fnNm, chipLabel: 'h = fn' },
    };
  }

  // ─── Milling: the chip a tooth really cuts ───────────────────────────
  const ratio = chipThinning(aeNm, cutNm, kappa);
  const hexNm = maxChipThickness(feedNm, aeNm, cutNm, kappa);
  const hmNm = meanChipThickness(feedNm, aeNm, cutNm, kappa);
  // hex and the restoring feed can land exactly on a rounding tie wherever the
  // thinning is rational, and are then rounded from their exact squares.
  // hm cannot: it carries an arccos and π.
  const squared = chipThinningSquared(aeNm, cutNm, kappa);
  const fz2 = BigInt(feedNm) * BigInt(feedNm);
  const hexShown = formatSteps(
    squared === null
      ? stepsOf(hexNm, u)
      : stepsOfSquare(fz2 * squared.num, squared.den, u),
  );
  const wide = 2 * aeNm >= cutNm;
  // The substituted figures, as the app prints them. Shown only: every chip
  // figure is worked unrounded in `feeds-speeds.ts`.
  const sinK = angled ? Math.sin((kappa * Math.PI) / 180) : 1;
  const share = aeNm / cutNm;
  const arcDeg = (Math.acos(1 - 2 * share) * 180) / Math.PI;
  const fz = fixed(feedNm, u);
  const times = angled ? ` × ${four(sinK)}` : ' × 1';
  lines.push(
    '',
    `Chip, at D = ${angled ? 'Dcap' : 'Dc'} = ${fixed(cutNm, u)} ${L}, κr = ${typed(kappa)}°` +
      (angled ? `, sin κr = ${four(sinK)}:` : ':'),
    `ae / D = ${fixed(aeNm, u)} / ${fixed(cutNm, u)} = ${four(share)}`,
    wide
      ? `hex = fz × sin κr = ${fz}${times} = ${hexShown} ${L}   ae ≥ D/2 (Sandvik Coromant)`
      : `hex = fz × sin κr × 2 × √(D × ae − ae²) / D   ae < D/2 (Sandvik Coromant)\n` +
          `    = ${fz}${times} × 2 × √(${fixed(cutNm, u)} × ${fixed(aeNm, u)} − ${fixed(aeNm, u)}²) / ${fixed(cutNm, u)} = ${hexShown} ${L}`,
    'hm  = fz × sin κr × (ae/D) × (360/π) / arccos°(1 − 2 × ae/D)   (Kennametal; it prints 114.6)',
    `    = ${fz}${times} × ${four(share)} × 114.5916 / ${four(arcDeg)}° = ${fixed(hmNm, u)} ${L}`,
  );
  // "hex" and "hm" stay in the notes: the page sets labels in capitals, where
  // "MAX CHIP HEX" reads as hexadecimal.
  stats.push(
    { label: 'Max chip', value: hexShown, unit: L, note: 'hex' },
    {
      label: 'Mean chip',
      value: fixed(hmNm, u),
      unit: L,
      note: 'hm, for the cutting force',
    },
  );

  let restore: FeedsDisplay['restore'] = null;
  if (ratio < 1) {
    const backNm = restoringFeed(feedNm, aeNm, cutNm, kappa);
    const backShown = formatSteps(
      squared === null
        ? stepsOf(backNm, u)
        : stepsOfSquare(fz2 * squared.den, squared.num, u),
    );
    const perTooth = metric ? 'mm/tooth' : 'in/tooth';
    lines.push(
      `fz to restore the chip = fz ÷ (hex / fz) = ${fz} ÷ ${four(ratio)} = ${backShown} ${perTooth}   shown, not applied`,
    );
    // What raising an already-raised feed again would cost: the entering
    // angle's own share of the thinning, 1 / sin κr (1.4142 at 45°, 5.7588 at
    // 10°), not the radial share, which no data sheet builds in.
    const twice = 1 / sinK;
    restore = {
      value: backShown,
      unit: perTooth,
      note: angled
        ? `The feed per tooth that cuts a chip as thick as the ${fixed(feedNm, u)} ${L} you typed. ` +
          'Use it only where your data sheet gives a chip thickness: data sheets for angled cutters ' +
          `often print a feed already raised for κr, and raising it again would be ${four(twice)} ` +
          'times too much. The figures above use the feed as typed.'
        : `The feed per tooth that cuts a chip as thick as the ${fixed(feedNm, u)} ${L} you typed, at ` +
          'this width. Use it only where your data sheet gives a chip thickness. The figures above ' +
          'use the feed as typed.',
    };
  }

  return {
    stats,
    restore,
    working: lines.join('\n'),
    power: { mrrCm3, chipNm: hmNm, chipLabel: 'hm' },
  };
}
