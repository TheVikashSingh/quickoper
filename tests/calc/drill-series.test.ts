import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  FRACTIONAL_DRILLS,
  METRIC_DRILLS,
  PENDING_SERIES,
  drillsFor,
} from '../../src/lib/calc/drill-series';
import { LETTER_DRILLS, NUMBER_DRILLS } from '../../src/lib/calc/number-letter-drills';
import {
  NM_PER_INCH,
  snapToSeries,
  drillDiameterFor,
  inchToNm,
  mmToNm,
  tpiToPitchNm,
} from '../../src/lib/calc/tap-drill';

/**
 * The metric and fractional catalogues are GENERATED, so these tests check the
 * generator against the series definition rather than against a transcribed
 * list. Number and letter drills have no definition to check against; their
 * table and its provenance are tested in `number-letter-drills.test.ts`, and
 * this file checks how the indexes are assembled from all four.
 */

describe('metric series', () => {
  it('runs 0.5 mm to 13.0 mm', () => {
    expect(METRIC_DRILLS[0]?.nm).toBe(500_000);
    expect(METRIC_DRILLS.at(-1)?.nm).toBe(13_000_000);
    expect(METRIC_DRILLS.length).toBe(151);
  });

  it('steps 0.05 mm below 3 mm and 0.1 mm above, with no drift', () => {
    // The fine low end is not cosmetic: a uniform 0.1 mm step skips 1.25 mm
    // (M1.6's tap drill) and 2.05 mm (M2.5's). An earlier draft did exactly
    // that, and the fixture-coverage test below is what caught it.
    for (let i = 1; i < METRIC_DRILLS.length; i++) {
      const step = METRIC_DRILLS[i]!.nm - METRIC_DRILLS[i - 1]!.nm;
      expect(step).toBe(METRIC_DRILLS[i]!.nm <= 3_000_000 ? 50_000 : 100_000);
      expect(METRIC_DRILLS[i]!.nm % 50_000).toBe(0);
    }
  });

  it('contains every standard tap drill the fixtures rely on', () => {
    // If the range or step ever changes, the tap drill page silently starts
    // recommending a neighbour instead of the right drill.
    const byNm = new Set(METRIC_DRILLS.map((d) => d.nm));
    for (const mm of [1.25, 1.6, 2.05, 2.5, 3.3, 4.2, 5.0, 6.8, 8.5, 10.2]) {
      expect(byNm.has(mmToNm(mm)), `${mm} mm missing from the metric series`).toBe(true);
    }
  });

  it('labels without trailing-zero noise', () => {
    expect(METRIC_DRILLS.find((d) => d.nm === 3_300_000)?.label).toBe('3.3 mm');
    expect(METRIC_DRILLS.find((d) => d.nm === 5_000_000)?.label).toBe('5 mm');
    expect(METRIC_DRILLS.find((d) => d.nm === 1_250_000)?.label).toBe('1.25 mm');
  });
});

describe('fractional series', () => {
  it('runs 1/64" to 1/2"', () => {
    expect(FRACTIONAL_DRILLS.length).toBe(32);
    expect(FRACTIONAL_DRILLS[0]?.label).toBe('1/64"');
    expect(FRACTIONAL_DRILLS.at(-1)?.label).toBe('1/2"');
  });

  it('reduces fractions the way a drill is marked', () => {
    const labels = FRACTIONAL_DRILLS.map((d) => d.label);
    expect(labels).toContain('1/16"'); // 4/64
    expect(labels).toContain('1/8"'); // 8/64
    expect(labels).toContain('1/4"'); // 16/64
    expect(labels).not.toContain('4/64"');
  });

  it('sits within half a nanometre of the true fraction', () => {
    FRACTIONAL_DRILLS.forEach((d, i) => {
      const exact = ((i + 1) * NM_PER_INCH) / 64;
      expect(Math.abs(d.nm - exact)).toBeLessThanOrEqual(0.5);
    });
  });

  it('puts 1/4" at exactly 6 350 000 nm, with no rounding at all', () => {
    // 25400 / 4 is a whole number, so this one must be exact, not rounded.
    expect(FRACTIONAL_DRILLS.find((d) => d.label === '1/4"')?.nm).toBe(6_350_000);
    // 1/64" is the case that forced nanometres: 396.875 µm had to be rounded,
    // 396 875 nm does not. Every fractional drill is its exact nominal size.
    expect(FRACTIONAL_DRILLS[0]?.nm).toBe(396_875);
    expect(FRACTIONAL_DRILLS.every((d) => Number.isInteger(d.nm))).toBe(true);
  });
});

describe('drillsFor', () => {
  it('returns each catalogue ascending', () => {
    for (const series of ['metric', 'inch', 'fractional', 'both'] as const) {
      const drills = drillsFor(series);
      for (let i = 1; i < drills.length; i++) {
        expect(drills[i]!.nm).toBeGreaterThanOrEqual(drills[i - 1]!.nm);
      }
    }
  });

  it('combines the catalogues without losing any drill', () => {
    expect(drillsFor('inch').length).toBe(
      FRACTIONAL_DRILLS.length + NUMBER_DRILLS.length + LETTER_DRILLS.length,
    );
    expect(drillsFor('inch').length).toBe(138);
    expect(drillsFor('both').length).toBe(
      METRIC_DRILLS.length +
        FRACTIONAL_DRILLS.length +
        NUMBER_DRILLS.length +
        LETTER_DRILLS.length,
    );
    expect(drillsFor('both').length).toBe(289);
  });

  it('keeps metric drills out of the inch index', () => {
    expect(drillsFor('inch').some((d) => d.series === 'metric')).toBe(false);
  });

  /**
   * Two holes have two names: 1/2" is 12.7 mm, and 1/4" is letter E. The name
   * listed first is the one snapToSeries reports, so the order is pinned:
   * metric, fractional, number, letter.
   */
  it('lists one hole under two names in a fixed order', () => {
    const both = drillsFor('both').map((d) => d.label);
    expect(both.indexOf('12.7 mm')).toBe(both.indexOf('1/2"') - 1);
    const inch = drillsFor('inch').map((d) => d.label);
    expect(inch.indexOf('1/4"')).toBe(inch.indexOf('E') - 1);
  });
});

describe('the catalogue serves real threads', () => {
  it('matches the published tap drill for common metric threads', () => {
    // METRIC index, not 'both'. Searching both puts 17/64" (6.747 mm) nearer
    // the M8 target than 6.8 mm, so a metric user would be sent to an imperial
    // drill. The index must follow the units the thread was entered in; the
    // page couples them for exactly this reason.
    const series = drillsFor('metric');
    // major, pitch, published tap drill (ISO 2306 / DIN 336). PENDING
    // verification like every other reference value - see the provenance gate.
    for (const [major, pitch, expected] of [
      [4, 0.7, 3.3],
      [5, 0.8, 4.2],
      [6, 1.0, 5.0],
      [8, 1.25, 6.8],
      [10, 1.5, 8.5],
      [12, 1.75, 10.2],
    ] as const) {
      const target = drillDiameterFor(mmToNm(major), mmToNm(pitch), 76.98);
      const choice = snapToSeries(mmToNm(major), mmToNm(pitch), target, series);
      expect(choice, `M${major} found no drill`).toBeDefined();
      // WITHIN ONE DRILL SIZE, not exact. The published table is a curated
      // list, not the output of a rule: engagements across it range from
      // 73.90% (M8) to 79.18% (M12), and for M12 the chart picks 10.2 mm where
      // the nearest drill to the computed target is 10.3 mm. A calculator can
      // be correct from first principles and still differ from the chart by one
      // step, and pretending otherwise would mean reverse-engineering a rule
      // that does not exist.
      const gap = Math.abs(choice!.drill.nm - mmToNm(expected));
      expect(
        gap,
        `M${major} is more than one drill size from the chart`,
      ).toBeLessThanOrEqual(100_000);
    }
  });

  /**
   * The inch index reproduces the published inch tap drill chart.
   *
   * Drill column: the Unified rows of `tests/fixtures/golden-tap-drill.csv`,
   * verified 2026-09-13 against the Dormer/Precision Twist Drill and Guhring
   * charts (D96). At 75 %, the basis the inch charts are worked at, the inch
   * index gives each thread exactly its published drill — not within one size.
   */
  it.each([
    ['#4-40', 0.112, 40, '#43'],
    ['#6-32', 0.138, 32, '#36'],
    ['#8-32', 0.164, 32, '#29'],
    ['#10-24', 0.19, 24, '#25'],
    ['1/4-20', 0.25, 20, '#7'],
    ['3/8-16', 0.375, 16, '5/16"'],
  ] as const)(
    '%s (%s in, %i tpi) at 75 percent gets the published %s',
    (_thread, major, tpi, expected) => {
      const majorNm = inchToNm(major);
      const pitchNm = tpiToPitchNm(tpi);
      const target = drillDiameterFor(majorNm, pitchNm, 75);
      expect(snapToSeries(majorNm, pitchNm, target, drillsFor('inch'))?.drill.label).toBe(
        expected,
      );
    },
  );

  it('cannot serve #8-32 from the fractional drills alone', () => {
    // Why the inch index exists: against fractions only, 75 % lands on 9/64",
    // which gives 57.58 % — derived here, 100 × (0.164 − 0.140625) / (K / 32).
    const majorNm = inchToNm(0.164);
    const pitchNm = tpiToPitchNm(32);
    const target = drillDiameterFor(majorNm, pitchNm, 75);
    const choice = snapToSeries(majorNm, pitchNm, target, drillsFor('fractional'));
    expect(choice?.drill.label).toBe('9/64"');
    expect(choice?.engagementPercent).toBeCloseTo(57.58, 2);
  });

  it('never recommends a drill outside the catalogue', () => {
    const series = drillsFor('both');
    const known = new Set(series.map((d) => d.nm));
    fc.assert(
      fc.property(
        fc.integer({ min: 2_000, max: 20_000 }),
        fc.integer({ min: 200, max: 2_500 }),
        (majorRaw, pitchRaw) => {
          fc.pre(pitchRaw * 3 < majorRaw);
          const major = mmToNm(majorRaw / 1000);
          const pitch = mmToNm(pitchRaw / 1000);
          const target = drillDiameterFor(major, pitch, 75);
          const choice = snapToSeries(major, pitch, target, series)!;
          expect(known.has(choice.drill.nm)).toBe(true);
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('missing series are declared, not hidden', () => {
  it('names the catalogues that are not shipped and why', () => {
    // Both pages read this list and print it above their results. An omission
    // a machinist cannot see is a recommendation they cannot question.
    expect(PENDING_SERIES.length).toBeGreaterThan(0);
    for (const s of PENDING_SERIES) {
      expect(s.name).toBeTruthy();
      expect(s.reason).toMatch(/verif/i);
    }
  });

  it('no longer lists number or letter drills, which now ship', () => {
    // If they were still listed, both pages would tell a machinist a series is
    // missing that the index in front of them contains.
    expect(PENDING_SERIES.map((s) => s.name).join(' ')).not.toMatch(/number|letter/i);
  });
});
