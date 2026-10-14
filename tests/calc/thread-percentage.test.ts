import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ENGAGEMENT_K,
  engagementPercentExact,
  inchToNm,
  mmToNm,
  roundHalfEven,
  tpiToPitchNm,
} from '../../src/lib/calc/tap-drill';
import {
  fourFigureDrill,
  threadPercentageFigures,
} from '../../src/lib/calc/thread-percentage';

/**
 * The figures on /machining/percentage-of-thread.
 *
 * Every expected value is one of two kinds, and each block says which:
 *
 *   PRINTED — a figure a maker published, read on 2026-10-14 from the text
 *   layer and the page image of the same PDF, which agree:
 *     - OSG USA, "Tapping Guide Vol 3: Tap Drill Sizes and Pitch Diameter
 *       Limits", EDP 800274CA-V3, © 2024, front page.
 *     - Guhring, "UNC / UNF Tap Drill Sizes" and "Metric Tap Drill Sizes",
 *       catalogue pp. 126–129.
 *
 *   DERIVED — worked from the formula by a separate 60-digit Python `decimal`
 *   run with √3 to 60 digits (the session's scratch script, not shipped),
 *   rounded once, half-even.
 */

const F = threadPercentageFigures();
const whole = (v: number): number => roundHalfEven(v, 0);

describe('the constants (DERIVED: √3 to 60 digits)', () => {
  it('H / P is √3 / 2 and the formula constant is 1.5 H / P', () => {
    expect(F.hPerPitch).toBe('0.866025');
    expect(F.k).toBe('1.299038');
  });

  it('drill = major − pitch is 100 / K = 76.98 % for every thread', () => {
    expect(F.shopRulePercent).toBe('76.98');
  });

  it('the basic minor diameter is 1.25 H, which is 83⅓ % in the formula', () => {
    expect(F.minorK).toBe('1.082532');
    expect(F.basicMinorPercent).toBe('83.33');
  });
});

describe('OSG’s worked example (PRINTED)', () => {
  it('2"-12N at 70 % is a 1.9242" drill, and 1.9242" is 70 %', () => {
    // OSG: 0.01299 × 70 = 0.9093 ÷ 12 = 0.0758; Drill Size = 1.9242".
    expect(F.osgExample.drill).toBe('1.9242');
    // OSG: 2.000 − 1.9242 = 0.0758 ÷ 0.01299 = 5.835 × 12 = 70 %.
    expect(F.osgExample.back).toBe('70.02');
    expect(whole(Number(F.osgExample.back))).toBe(70);
  });
});

/**
 * OSG's "Tap Drill Diameter - Cut Taps" columns for eight UNC threads: forty
 * figures, inches, as printed.
 */
const OSG_TABLE: readonly [string, number, number, readonly string[]][] = [
  ['#4-40', 0.112, 40, ['0.0860', '0.0876', '0.0893', '0.0909', '0.0925']],
  ['#6-32', 0.138, 32, ['0.1055', '0.1076', '0.1096', '0.1116', '0.1136']],
  ['#8-32', 0.164, 32, ['0.1315', '0.1336', '0.1356', '0.1376', '0.1396']],
  ['#10-24', 0.19, 24, ['0.1467', '0.1494', '0.1521', '0.1548', '0.1575']],
  ['1/4-20', 0.25, 20, ['0.1980', '0.2013', '0.2045', '0.2078', '0.2110']],
  ['5/16-18', 0.3125, 18, ['0.2548', '0.2584', '0.2620', '0.2656', '0.2692']],
  ['3/8-16', 0.375, 16, ['0.3101', '0.3141', '0.3182', '0.3222', '0.3263']],
  ['1/2-13', 0.5, 13, ['0.4201', '0.4251', '0.4301', '0.4351', '0.4400']],
];
const OSG_PERCENTS = [80, 75, 70, 65, 60] as const;

describe('OSG’s drill table (PRINTED): the full constant against 0.01299', () => {
  const misses: string[] = [];
  for (const [thread, major, tpi, printed] of OSG_TABLE) {
    OSG_PERCENTS.forEach((percent, i) => {
      const exact = major - (ENGAGEMENT_K * percent) / (100 * tpi);
      if (roundHalfEven(exact, 4).toFixed(4) !== printed[i]) {
        misses.push(`${thread}@${percent}`);
      }
    });
  }

  it('reproduces 38 of the 40 figures at four decimals', () => {
    expect(misses).toEqual(['3/8-16@80', '1/2-13@65']);
  });

  it('misses only where 0.01299 lands exactly on a tie that OSG rounds up', () => {
    expect(F.ties.map((t) => [t.thread, t.percent, t.printed])).toEqual([
      ['3/8-16', 80, '0.3101'],
      ['1/2-13', 65, '0.4351'],
    ]);
    for (const t of F.ties) {
      // Exactly halfway between two ten-thousandths under the printed rule.
      expect(t.fourFigure).toMatch(/^0\.\d{4}5$/);
      expect(t.printed).toBe((Number(t.fourFigure) + 0.00005).toFixed(4));
    }
    // DERIVED: with √3 both sit 2 millionths below the tie, so they round down.
    expect(F.ties.map((t) => [t.fourFigure, t.exact, t.exactRounded])).toEqual([
      ['0.31005', '0.310048', '0.3100'],
      ['0.43505', '0.435048', '0.4350'],
    ]);
  });

  it('works the four-figure formula in integers, and refuses what does not divide', () => {
    expect(fourFigureDrill('0.25', 20, 75)).toBe('0.2012875');
    expect(() => fourFigureDrill('0.25', 7, 75)).toThrow(RangeError);
  });
});

describe('Guhring’s percentages (PRINTED, whole numbers)', () => {
  it('every row printed for M8 × 1.25, p. 128', () => {
    const rows: [number, number][] = [
      [6.7, 80],
      [6.75, 77],
      [6.8, 74],
      [6.85, 71],
      [6.9, 68],
      [6.95, 65],
      [7.0, 62],
      [7.03, 60],
      [7.05, 59],
    ];
    for (const [mm, printed] of rows) {
      const pct = engagementPercentExact(mmToNm(8), mmToNm(1.25), mmToNm(mm));
      expect(whole(pct), `${mm} mm`).toBe(printed);
    }
  });

  it('every row printed for 1/4-20, p. 127, by its decimal-inch column', () => {
    // The mm column is that decimal converted; Guhring's percentage follows
    // the decimal (0.2055 is #5: 68.51 % by the inch, 68.49 % by 5.220 mm).
    const rows: [number, number][] = [
      [0.1988, 79],
      [0.1992, 78],
      [0.2008, 76],
      [0.2012, 75],
      [0.2028, 73],
      [0.2031, 72],
      [0.2039, 71],
      [0.2047, 70],
      [0.2055, 69],
      [0.2067, 67],
      [0.2087, 64],
      [0.2091, 63],
      [0.2106, 61],
    ];
    for (const [inch, printed] of rows) {
      const pct = engagementPercentExact(
        inchToNm(0.25),
        tpiToPitchNm(20),
        inchToNm(inch),
      );
      expect(whole(pct), `${inch} in`).toBe(printed);
    }
  });

  it('the page’s M8 drills carry Guhring’s figure and round to it', () => {
    expect(F.m8.drills.map((d) => [d.label, d.size, d.percent, d.guhring])).toEqual([
      ['6.7 mm', '6.7000', '80.06', 80],
      ['6.8 mm', '6.8000', '73.90', 74],
      ['6.9 mm', '6.9000', '67.74', 68],
    ]);
    for (const d of F.m8.drills) expect(whole(Number(d.percent))).toBe(d.guhring);
  });
});

describe('the worked examples (DERIVED)', () => {
  it('M8 × 1.25: 6.7822 mm at 75 %, exactly 6.75 mm by the shop rule', () => {
    expect(F.m8.target75).toBe('6.7822');
    expect(F.m8.shopTarget).toBe('6.7500');
  });

  it('M12 × 1.75: 1.299 × 76.98 puts the shop-rule tie 52 nm high', () => {
    expect(F.m12.shopTarget).toBe('10.2500');
    expect(F.m12.fourFigureTarget).toBe('10.25005');
    expect(F.m12.gapNm).toBe('52');
  });

  it('1/4-20: 0.201286" at 75 %, which OSG prints as 0.2013', () => {
    expect(F.quarter20.target75Long).toBe('0.201286');
    expect(F.quarter20.target75).toBe(F.quarter20.osg75);
    expect(F.quarter20.drills.map((d) => [d.label, d.size, d.percent])).toEqual([
      ['#8', '0.1990', '78.52'],
      ['#7', '0.2010', '75.44'],
      ['13/64"', '0.2031', '72.17'],
      ['#6', '0.2040', '70.82'],
    ]);
  });

  it('1/4-20: OSG’s own 65 % column is above its class 2B maximum', () => {
    expect(Number(F.quarter20.osg65)).toBeGreaterThan(Number(F.quarter20.max2B));
    expect(F.quarter20.max2BPercent).toBe('66.20');
  });

  it('#8-32 on a #29 is 68.97 %, and 68.98 % with 1.299', () => {
    expect(F.eight32).toEqual({ exact: '68.97', fourFigure: '68.98' });
  });
});

describe('llms.txt', () => {
  // It is static text, so its figures are typed. Each one must be a figure
  // this module computes, or the entry has drifted from the page.
  const llms = readFileSync(
    fileURLToPath(new URL('../../public/llms.txt', import.meta.url)),
    'utf8',
  );
  const start = llms.indexOf('### Percentage of thread');
  const entry = llms.slice(start, llms.indexOf('## Verification', start));
  const quarter = F.classRange.find((r) => r.thread === '1/4-20');
  const four40 = F.classRange.find((r) => r.thread === '#4-40');

  it.each([
    F.shopRulePercent,
    F.basicMinorPercent,
    F.m8.target75,
    F.m8.drills[1]?.percent,
    F.quarter20.target75Long,
    F.quarter20.osg75,
    F.quarter20.drills[1]?.percent,
    quarter?.minPercent,
    quarter?.maxPercent,
    four40?.minPercent,
    four40?.maxPercent,
    F.quarter20.osg65,
    F.quarter20.max2B,
    F.ties[0]?.fourFigure,
    F.ties[1]?.fourFigure,
    F.eight32.exact,
    F.eight32.fourFigure,
  ])('names %s as the page computes it', (figure) => {
    expect(figure).toBeDefined();
    expect(entry).toContain(String(figure));
  });
});

describe('the class 2B range (limits PRINTED by OSG, percentages DERIVED)', () => {
  it('works each limit as a percentage', () => {
    expect(F.classRange.map((r) => [r.thread, r.minPercent, r.maxPercent])).toEqual([
      ['#4-40', '83.45', '55.73'],
      ['#6-32', '83.75', '59.12'],
      ['#8-32', '83.75', '61.58'],
      ['#10-24', '83.14', '62.82'],
      ['1/4-20', '83.14', '66.20'],
      ['3/8-16', '83.75', '66.51'],
    ]);
  });

  it('each printed minimum is its basic minor diameter, rounded', () => {
    // DERIVED: D − 1.25 H, √3 to 60 digits.
    expect(F.classRange.map((r) => [r.thread, r.basicMinor])).toEqual([
      ['#4-40', '0.08494'],
      ['#6-32', '0.10417'],
      ['#8-32', '0.13017'],
      ['#10-24', '0.14489'],
      ['1/4-20', '0.19587'],
      ['3/8-16', '0.30734'],
    ]);
    for (const r of F.classRange) {
      expect(Math.abs(Number(r.min) - Number(r.basicMinor)), r.thread).toBeLessThan(
        0.0005,
      );
    }
    expect(F.furthestMinimum).toEqual({ thread: '3/8-16', gap: '0.0003' });
  });

  it('agrees with the engine’s nanometre arithmetic where the pitch is exact', () => {
    const exactPitch: Record<string, [number, number]> = {
      '#4-40': [0.112, 40],
      '#6-32': [0.138, 32],
      '#8-32': [0.164, 32],
      '1/4-20': [0.25, 20],
      '3/8-16': [0.375, 16],
    };
    for (const r of F.classRange) {
      const t = exactPitch[r.thread];
      if (t === undefined) continue;
      const [major, tpi] = t;
      const viaEngine = engagementPercentExact(
        inchToNm(major),
        tpiToPitchNm(tpi),
        inchToNm(Number(r.max)),
      );
      expect(roundHalfEven(viaEngine, 2).toFixed(2), r.thread).toBe(r.maxPercent);
    }
  });

  it('names the verified chart drill and its engagement for every thread', () => {
    const csv = readFileSync(
      fileURLToPath(new URL('../fixtures/golden-tap-drill.csv', import.meta.url)),
      'utf8',
    );
    const golden = new Map(
      csv
        .trim()
        .split('\n')
        .slice(1)
        .map((line) => {
          const c = line.split(',');
          return [c[0], { label: c[5], pct: c[6] }] as const;
        }),
    );
    for (const r of F.classRange) {
      const g = golden.get(r.thread);
      expect(g, r.thread).toBeDefined();
      expect(r.drill.replace('"', '')).toBe(g?.label);
      expect(r.drillPercent).toBe(g?.pct);
      // The chart drill sits inside the class: between the two limits.
      expect(Number(r.drillPercent)).toBeLessThan(Number(r.minPercent));
      expect(Number(r.drillPercent)).toBeGreaterThan(Number(r.maxPercent));
    }
  });
});
