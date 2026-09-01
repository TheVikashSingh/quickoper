import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  FRACTIONAL_DRILLS,
  METRIC_DRILLS,
  PENDING_SERIES,
  drillsFor,
} from '../../src/lib/calc/drill-series';
import {
  UM_PER_INCH,
  snapToSeries,
  drillDiameterFor,
  mmToUm,
} from '../../src/lib/calc/tap-drill';

/**
 * The catalogues are GENERATED, so these tests check the generator against the
 * series definition rather than against a transcribed list. That is the whole
 * reason number and letter drills are absent: there is no definition to check
 * them against, only a table someone typed.
 */

describe('metric series', () => {
  it('runs 0.5 mm to 13.0 mm', () => {
    expect(METRIC_DRILLS[0]?.um).toBe(500);
    expect(METRIC_DRILLS.at(-1)?.um).toBe(13_000);
    expect(METRIC_DRILLS.length).toBe(151);
  });

  it('steps 0.05 mm below 3 mm and 0.1 mm above, with no drift', () => {
    // The fine low end is not cosmetic: a uniform 0.1 mm step skips 1.25 mm
    // (M1.6's tap drill) and 2.05 mm (M2.5's). An earlier draft did exactly
    // that, and the fixture-coverage test below is what caught it.
    for (let i = 1; i < METRIC_DRILLS.length; i++) {
      const step = METRIC_DRILLS[i]!.um - METRIC_DRILLS[i - 1]!.um;
      expect(step).toBe(METRIC_DRILLS[i]!.um <= 3_000 ? 50 : 100);
      expect(METRIC_DRILLS[i]!.um % 50).toBe(0);
    }
  });

  it('contains every standard tap drill the fixtures rely on', () => {
    // If the range or step ever changes, the tap drill page silently starts
    // recommending a neighbour instead of the right drill.
    const byUm = new Set(METRIC_DRILLS.map((d) => d.um));
    for (const mm of [1.25, 1.6, 2.05, 2.5, 3.3, 4.2, 5.0, 6.8, 8.5, 10.2]) {
      expect(byUm.has(mmToUm(mm)), `${mm} mm missing from the metric series`).toBe(true);
    }
  });

  it('labels without trailing-zero noise', () => {
    expect(METRIC_DRILLS.find((d) => d.um === 3300)?.label).toBe('3.3 mm');
    expect(METRIC_DRILLS.find((d) => d.um === 5000)?.label).toBe('5 mm');
    expect(METRIC_DRILLS.find((d) => d.um === 1250)?.label).toBe('1.25 mm');
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

  it('sits within half a micrometre of the true fraction', () => {
    FRACTIONAL_DRILLS.forEach((d, i) => {
      const exact = ((i + 1) * UM_PER_INCH) / 64;
      expect(Math.abs(d.um - exact)).toBeLessThanOrEqual(0.5);
    });
  });

  it('puts 1/4" at exactly 6350 µm', () => {
    // 25400 / 4 is a whole number, so this one must be exact, not rounded.
    expect(FRACTIONAL_DRILLS.find((d) => d.label === '1/4"')?.um).toBe(6350);
  });
});

describe('drillsFor', () => {
  it('returns each catalogue ascending', () => {
    for (const series of ['metric', 'fractional', 'both'] as const) {
      const drills = drillsFor(series);
      for (let i = 1; i < drills.length; i++) {
        expect(drills[i]!.um).toBeGreaterThanOrEqual(drills[i - 1]!.um);
      }
    }
  });

  it('combines both catalogues without losing any drill', () => {
    expect(drillsFor('both').length).toBe(
      METRIC_DRILLS.length + FRACTIONAL_DRILLS.length,
    );
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
      const target = drillDiameterFor(mmToUm(major), mmToUm(pitch), 76.98);
      const choice = snapToSeries(mmToUm(major), mmToUm(pitch), target, series);
      expect(choice, `M${major} found no drill`).toBeDefined();
      // WITHIN ONE DRILL SIZE, not exact. The published table is a curated
      // list, not the output of a rule: engagements across it range from
      // 73.90% (M8) to 79.18% (M12), and for M12 the chart picks 10.2 mm where
      // the nearest drill to the computed target is 10.3 mm. A calculator can
      // be correct from first principles and still differ from the chart by one
      // step, and pretending otherwise would mean reverse-engineering a rule
      // that does not exist.
      const gap = Math.abs(choice!.drill.um - mmToUm(expected));
      expect(
        gap,
        `M${major} is more than one drill size from the chart`,
      ).toBeLessThanOrEqual(100);
    }
  });

  it('never recommends a drill outside the catalogue', () => {
    const series = drillsFor('both');
    const known = new Set(series.map((d) => d.um));
    fc.assert(
      fc.property(
        fc.integer({ min: 2_000, max: 20_000 }),
        fc.integer({ min: 200, max: 2_500 }),
        (majorRaw, pitchRaw) => {
          fc.pre(pitchRaw * 3 < majorRaw);
          const major = mmToUm(majorRaw / 1000);
          const pitch = mmToUm(pitchRaw / 1000);
          const target = drillDiameterFor(major, pitch, 75);
          const choice = snapToSeries(major, pitch, target, series)!;
          expect(known.has(choice.drill.um)).toBe(true);
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('missing series are declared, not hidden', () => {
  it('names the catalogues that are not shipped and why', () => {
    // A calculator that silently omits the number drills recommends a 13/64"
    // where a #7 was right, and the user cannot tell. The UI reads this list.
    expect(PENDING_SERIES.length).toBeGreaterThan(0);
    for (const s of PENDING_SERIES) {
      expect(s.name).toBeTruthy();
      expect(s.reason).toMatch(/verif/i);
    }
  });
});
