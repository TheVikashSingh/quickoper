/**
 * The figures on /machining/percentage-of-thread, a derivation page.
 *
 * ─── Why a module and not the page's frontmatter ────────────────────────────
 *
 * A derivation page is prose around numbers, and D47, D55 and D62 are each a
 * true number in a false sentence or a number that drifted from what computes
 * it. So the page types no figure. Every number it prints is a string returned
 * here, worked by the tap drill engine's own constants, and
 * `tests/calc/thread-percentage.test.ts` pins each one against what a maker
 * printed or against the derivation it stands for.
 *
 * ─── The two makers ─────────────────────────────────────────────────────────
 *
 *   - OSG USA, "Tapping Guide Vol 3: Tap Drill Sizes and Pitch Diameter
 *     Limits", EDP 800274CA-V3, © 2024. The front page prints the formula,
 *     Drill = Major − 0.01299 × % / TPI, worked for 2"-12N at 70 %, a table of
 *     drills for 80 to 60 % and the class 2B minor diameter limits.
 *   - Guhring, "UNC / UNF Tap Drill Sizes" and "Metric Tap Drill Sizes",
 *     catalogue pp. 126–129: the theoretical percentage of thread, as a whole
 *     number, for every drill from 81 % to 59 %.
 *
 * Both read on 2026-10-14, the text layer and the page image of the same PDF,
 * which agree. The figures below that are THEIRS are marked as printed; every
 * other figure is computed.
 *
 * ─── Rounding (CLAUDE.md rule 3) ────────────────────────────────────────────
 *
 * Each figure is rounded once, half-even, at the end, from the engine's
 * full-precision value: percentages to two decimals, millimetres and inches to
 * four, and the constants to six. Nothing here can land on a tie: the cutting
 * constant is 3√3/4, so a percentage or a diameter worked with it is
 * irrational. The one place a tie is the subject — OSG's four-figure constant —
 * is worked in integers (`fourFigureDrill`), so its ties are exact.
 */

import { FRACTIONAL_DRILLS } from './drill-series';
import { NUMBER_DRILLS } from './number-letter-drills';
import {
  ENGAGEMENT_K,
  H_PER_PITCH,
  MINOR_DIA_K,
  NM_PER_INCH,
  SHOP_RULE_PERCENT,
  drillDiameterFor,
  engagementPercentExact,
  mmToNm,
  roundHalfEven,
  type Drill,
} from './tap-drill';

/** The trade's four-figure constant, as OSG prints it: 0.01299 per percent. */
export const OSG_CONSTANT_TEXT = '0.01299';

const fixed = (value: number, decimals: number): string =>
  roundHalfEven(value, decimals).toFixed(decimals);

/**
 * Percentage of thread for an inch thread, worked in inches.
 *
 * The engine's expression, 100 × (D − d) / (K × P), with P = 1/TPI. Worked in
 * inches rather than through `engagementPercentExact` because a pitch of 1/24
 * or 1/13 inch is not a whole number of nanometres, and the engine's branded
 * pitch would round it. The test proves the two agree where the pitch is
 * exact.
 */
function inchPercent(majorIn: number, tpi: number, holeIn: number): number {
  return (100 * (majorIn - holeIn) * tpi) / ENGAGEMENT_K;
}

/** The basic minor diameter of an inch thread, D − 1.25 H, in inches. */
function basicMinorIn(majorIn: number, tpi: number): number {
  return majorIn - MINOR_DIA_K / tpi;
}

/** The hole for a percentage of an inch thread, worked in inches. */
function inchDrill(majorIn: number, tpi: number, percent: number): number {
  return majorIn - (ENGAGEMENT_K * percent) / (100 * tpi);
}

/**
 * OSG's formula exactly as printed, with 0.01299, as a decimal string.
 *
 * Worked in whole billionths of an inch, so a result that ends in 5 at the
 * fifth decimal IS 5 there and not a float near it. Every input this page uses
 * divides exactly; one that did not would be refused rather than rounded.
 */
export function fourFigureDrill(majorIn: string, tpi: number, percent: number): string {
  const major = Math.round(Number(majorIn) * 1e9);
  const step = 12_990_000 * percent; // 0.01299 in × %, in billionths
  if (step % tpi !== 0 || !Number.isSafeInteger(major)) {
    throw new RangeError(`0.01299 × ${percent} / ${tpi} is not a whole billionth`);
  }
  const value = major - step / tpi;
  return (value / 1e9).toFixed(9).replace(/0+$/, '');
}

function drill(series: readonly Drill[], label: string): Drill {
  const found = series.find((d) => d.label === label);
  if (found === undefined) throw new Error(`thread-percentage: no drill "${label}"`);
  return found;
}

const inches = (d: Drill): number => d.nm / NM_PER_INCH;

// ─── What the makers printed ───────────────────────────────────────────────

/**
 * Guhring's printed percentage beside three drills for M8 × 1.25, p. 128.
 * The test checks every one of the nine rows Guhring prints for M8 × 1.25.
 */
const GUHRING_M8 = [
  { mm: 6.7, printed: 80 },
  { mm: 6.8, printed: 74 },
  { mm: 6.9, printed: 68 },
] as const;

/**
 * OSG's class 2B minor diameter limits, in inches as printed, for the six
 * Unified coarse threads whose chart drill is verified in
 * `tests/fixtures/golden-tap-drill.csv`. The drill and its label are that
 * file's; the test holds them to it.
 */
const CLASS_2B = [
  { thread: '#4-40', major: 0.112, tpi: 40, min: '0.0849', max: '0.0939', drill: '#43' },
  { thread: '#6-32', major: 0.138, tpi: 32, min: '0.1040', max: '0.1140', drill: '#36' },
  { thread: '#8-32', major: 0.164, tpi: 32, min: '0.1300', max: '0.1390', drill: '#29' },
  { thread: '#10-24', major: 0.19, tpi: 24, min: '0.1450', max: '0.1560', drill: '#25' },
  { thread: '1/4-20', major: 0.25, tpi: 20, min: '0.1960', max: '0.2070', drill: '#7' },
  {
    thread: '3/8-16',
    major: 0.375,
    tpi: 16,
    min: '0.3070',
    max: '0.3210',
    drill: '5/16"',
  },
] as const;

/**
 * The two of OSG's forty figures for eight coarse threads that the full
 * constant does not reproduce at four decimals. Both are exact ties under
 * 0.01299, and OSG prints both rounded up.
 */
const OSG_TIES = [
  { thread: '3/8-16', major: '0.375', tpi: 16, percent: 80, printed: '0.3101' },
  { thread: '1/2-13', major: '0.5', tpi: 13, percent: 65, printed: '0.4351' },
] as const;

/** OSG's 75 % and 65 % columns and 2B maximum for 1/4-20, as printed. */
const OSG_QUARTER_20 = { at75: '0.2013', at65: '0.2078', max2B: '0.2070' } as const;

// ─── The figures ───────────────────────────────────────────────────────────

export interface DrillFigure {
  label: string;
  /** The drill's diameter in the thread's unit, four decimals. */
  size: string;
  percent: string;
}

export interface ThreadPercentageFigures {
  /** H / P = √3 / 2, six decimals. */
  hPerPitch: string;
  /** K = 1.5 H / P = 3√3 / 4, six decimals. */
  k: string;
  /** 100 / K: what "drill = major − pitch" gives, two decimals. */
  shopRulePercent: string;
  /** (D − D₁) / P = 1.25 H / P = 5√3 / 8, six decimals. */
  minorK: string;
  /** A hole at the basic minor diameter, as a percentage: 1.25 / 1.5. */
  basicMinorPercent: string;
  /** OSG's worked example, 2"-12N at 70 %, worked with √3. */
  osgExample: { drill: string; back: string };
  m8: {
    target75: string;
    shopTarget: string;
    drills: (DrillFigure & { guhring: number })[];
  };
  m12: { shopTarget: string; fourFigureTarget: string; gapNm: string };
  quarter20: {
    target75: string;
    target75Long: string;
    osg75: string;
    drills: DrillFigure[];
    osg65: string;
    max2B: string;
    max2BPercent: string;
  };
  ties: {
    thread: string;
    percent: number;
    printed: string;
    fourFigure: string;
    exact: string;
    exactRounded: string;
  }[];
  classRange: {
    thread: string;
    drill: string;
    drillPercent: string;
    min: string;
    minPercent: string;
    max: string;
    maxPercent: string;
    /** The basic minor diameter D − 1.25 H, inches, five decimals. */
    basicMinor: string;
  }[];
  /** Which printed 2B minimum is furthest from its basic minor diameter, and by how much. */
  furthestMinimum: { thread: string; gap: string };
  /** #8-32 on a #29, with the full constant and with 1.299. */
  eight32: { exact: string; fourFigure: string };
}

export function threadPercentageFigures(): ThreadPercentageFigures {
  const m8Major = mmToNm(8);
  const m8Pitch = mmToNm(1.25);
  const m12Major = mmToNm(12);
  const m12Pitch = mmToNm(1.75);

  // 1.299 × 76.98, as an engine typed with the rounded figures would work it.
  const m12FourFigure = 12 - (1.299 * 1.75 * 76.98) / 100;
  const m12ShopNm = drillDiameterFor(m12Major, m12Pitch, SHOP_RULE_PERCENT);

  const quarterDrills = [
    drill(NUMBER_DRILLS, '#8'),
    drill(NUMBER_DRILLS, '#7'),
    drill(FRACTIONAL_DRILLS, '13/64"'),
    drill(NUMBER_DRILLS, '#6'),
  ];

  const twenty9 = inches(drill(NUMBER_DRILLS, '#29'));

  return {
    hPerPitch: fixed(H_PER_PITCH, 6),
    k: fixed(ENGAGEMENT_K, 6),
    shopRulePercent: fixed(SHOP_RULE_PERCENT, 2),
    minorK: fixed(MINOR_DIA_K, 6),
    basicMinorPercent: fixed((100 * MINOR_DIA_K) / ENGAGEMENT_K, 2),
    osgExample: {
      drill: fixed(inchDrill(2, 12, 70), 4),
      back: fixed(inchPercent(2, 12, 1.9242), 2),
    },
    m8: {
      target75: fixed(drillDiameterFor(m8Major, m8Pitch, 75) / 1e6, 4),
      shopTarget: fixed(drillDiameterFor(m8Major, m8Pitch, SHOP_RULE_PERCENT) / 1e6, 4),
      drills: GUHRING_M8.map((g) => ({
        label: `${g.mm.toFixed(1)} mm`,
        size: g.mm.toFixed(4),
        percent: fixed(engagementPercentExact(m8Major, m8Pitch, mmToNm(g.mm)), 2),
        guhring: g.printed,
      })),
    },
    m12: {
      shopTarget: fixed(m12ShopNm / 1e6, 4),
      fourFigureTarget: fixed(m12FourFigure, 5),
      gapNm: fixed(m12FourFigure * 1e6 - m12ShopNm, 0),
    },
    quarter20: {
      target75: fixed(inchDrill(0.25, 20, 75), 4),
      target75Long: fixed(inchDrill(0.25, 20, 75), 6),
      osg75: OSG_QUARTER_20.at75,
      drills: quarterDrills.map((d) => ({
        label: d.label,
        size: fixed(inches(d), 4),
        percent: fixed(inchPercent(0.25, 20, inches(d)), 2),
      })),
      osg65: OSG_QUARTER_20.at65,
      max2B: OSG_QUARTER_20.max2B,
      max2BPercent: fixed(inchPercent(0.25, 20, Number(OSG_QUARTER_20.max2B)), 2),
    },
    ties: OSG_TIES.map((t) => ({
      thread: t.thread,
      percent: t.percent,
      printed: t.printed,
      fourFigure: fourFigureDrill(t.major, t.tpi, t.percent),
      exact: fixed(inchDrill(Number(t.major), t.tpi, t.percent), 6),
      exactRounded: fixed(inchDrill(Number(t.major), t.tpi, t.percent), 4),
    })),
    classRange: CLASS_2B.map((c) => {
      const d = inches(drill([...NUMBER_DRILLS, ...FRACTIONAL_DRILLS], c.drill));
      return {
        thread: c.thread,
        drill: c.drill,
        drillPercent: fixed(inchPercent(c.major, c.tpi, d), 2),
        min: c.min,
        minPercent: fixed(inchPercent(c.major, c.tpi, Number(c.min)), 2),
        max: c.max,
        maxPercent: fixed(inchPercent(c.major, c.tpi, Number(c.max)), 2),
        basicMinor: fixed(basicMinorIn(c.major, c.tpi), 5),
      };
    }),
    furthestMinimum: CLASS_2B.map((c) => ({
      thread: c.thread,
      gap: Math.abs(Number(c.min) - basicMinorIn(c.major, c.tpi)),
    }))
      .sort((a, b) => b.gap - a.gap)
      .map((g) => ({ thread: g.thread, gap: fixed(g.gap, 4) }))[0] ?? {
      thread: '',
      gap: '',
    },
    eight32: {
      exact: fixed(inchPercent(0.164, 32, twenty9), 2),
      fourFigure: fixed((100 * (0.164 - twenty9) * 32) / 1.299, 2),
    },
  };
}
