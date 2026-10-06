import { describe, expect, it } from 'vitest';
import {
  bracketSteps,
  truePositionDisplay,
  wholeSteps,
  type TruePositionInput,
} from '../../src/lib/calc/true-position-display';

/**
 * What the true position page prints, checked as strings.
 *
 * Expected values come from three places, each named where it is used:
 *
 *   - GD&T Basics, "True Position" (retrieved 2026-10-06,
 *     https://www.gdandtbasics.com/true-position/): .003 and .002 in off,
 *     printed there as .007 to three places, in spec against .008.
 *   - Cogorno, Geometric Dimensioning and Tolerancing for Mechanical Design,
 *     2nd ed., p. 121, as reprinted in Technical Training Consultants'
 *     newsletter "Zero Positional Tolerance at Maximum Material Condition"
 *     (retrieved 2026-10-06,
 *     http://www.ttc-cogorno.com/Newsletters/130108ZeroPositionalTol.pdf):
 *     the hole plated to .518, rejected under Ø.520–.540 at Ø.020 MMC, and
 *     within Ø.010 under the equivalent Ø.500–.540 at zero MMC.
 *   - An independent reference in 60-digit Decimal arithmetic (Python, square
 *     roots in Decimal, not the integer bracket the site uses, half-even once
 *     to four places), run before this module existed. Every derived figure
 *     below was printed by it.
 */

type Coordinates = Extract<TruePositionInput, { entry: 'coordinates' }>;
type Deviations = Extract<TruePositionInput, { entry: 'deviations' }>;

/** The page's opening example: the app's store listing shows the same one. */
const coordinates = (over: Partial<Coordinates>) =>
  truePositionDisplay({
    entry: 'coordinates',
    units: 'mm',
    drawnX: 50,
    drawnY: 30,
    measuredX: 50.062,
    measuredY: 30.089,
    tolerance: 0.2,
    modifier: 'mmc',
    feature: 'hole',
    smallest: 10,
    largest: 10.1,
    measured: 10.048,
    ...over,
  });

const deviations = (over: Partial<Deviations>) =>
  truePositionDisplay({
    entry: 'deviations',
    units: 'mm',
    dx: 0,
    dy: 0,
    tolerance: 0.1,
    modifier: 'rfs',
    feature: 'hole',
    smallest: null,
    largest: null,
    measured: null,
    ...over,
  });

const fact = (d: ReturnType<typeof truePositionDisplay>, label: string) =>
  d.summary.find((s) => s.label === label)?.value;

describe('the opening example: out of position on its own, within with the bonus', () => {
  // 0.062 and 0.089 mm off: 2√(0.062² + 0.089²) = 0.21693316 mm. The hole,
  // 10 to 10.1 mm at Ø0.2 MMC, measures 10.048: a bonus of 0.048 mm.
  const d = coordinates({});

  it('passes, and says by how much', () => {
    expect([d.tone, d.headline]).toEqual(['pass', 'Within']);
    expect(d.detail).toBe(
      'Position Ø0.2169 mm against Ø0.2480 mm allowed: within, by 0.0311 mm.',
    );
  });

  it('shows what the same hole gets with no bonus', () => {
    expect(d.withoutBonus).toBe(
      'With no bonus, against Ø0.2 mm alone: over, by 0.0169 mm.',
    );
  });

  it('lists the figures', () => {
    expect(d.summary).toEqual([
      { label: 'Position', value: 'Ø0.2169 mm' },
      { label: 'Allowed', value: 'Ø0.2480 mm' },
      { label: 'Bonus', value: '0.0480 mm' },
      { label: 'Off in X', value: '0.0620 mm' },
      { label: 'Off in Y', value: '0.0890 mm' },
    ]);
  });

  it('prints the working, every line adding up as printed', () => {
    expect(d.working).toBe(
      [
        'position = 2 × √(dx² + dy²)',
        'A tolerance Ø t is a cylinder of diameter t round the true position',
        '(ASME Y14.5): an axis r from it is inside when 2r ≤ t.',
        '',
        'dx = measured X − drawn X = 50.062 − 50 = 0.0620 mm',
        'dy = measured Y − drawn Y = 30.089 − 30 = 0.0890 mm',
        'position = 2 × √(0.0620² + 0.0890²) = 0.2169 mm',
        '',
        'Hole at MMC: bonus = measured − smallest = 10.048 − 10 = 0.0480 mm',
        "Measured size: the hole's mating size, the largest perfect pin that fits in it.",
        'A bore gauge in an out-of-round hole can read larger, which would count too',
        'much bonus.',
        'allowed = tolerance + bonus = 0.2 + 0.0480 = 0.2480 mm',
        '',
        '0.2169 ≤ 0.2480: within, by 0.0311 mm',
        'Decided in whole nanometres before any rounding: 4 × (dx² + dy²) ≤ allowed².',
        '',
        'With no bonus, against the tolerance alone:',
        '0.2169 > 0.2000: over, by 0.0169 mm',
        '',
        'Not counted: datum feature shift, zones that are a width rather than a',
        'diameter, and spherical zones.',
      ].join('\n'),
    );
  });

  it('draws the axis inside the zone with the bonus, outside the zone without', () => {
    expect(d.figure).toEqual({
      x: 0.062,
      y: 0.089,
      zoneR: 0.1,
      allowedR: 0.124,
      inside: true,
    });
  });
});

describe('the published examples', () => {
  it('GD&T Basics: .003 and .002 in off is Ø.0072 in, which they print as .007', () => {
    const d = deviations({ units: 'in', dx: 0.003, dy: 0.002, tolerance: 0.008 });
    expect(fact(d, 'Position')).toBe('Ø0.0072 in');
    expect(d.detail).toBe(
      'Position Ø0.0072 in against Ø0.0080 in allowed: within, by 0.0008 in. ' +
        'Regardless of feature size: no bonus is counted, and the size is not checked.',
    );
    expect(d.working).toContain('dx = 0.003 in, dy = 0.002 in (measured − drawn)');
    expect(d.working).toContain('position = 2 × √(0.0030² + 0.0020²) = 0.0072 in');
  });

  describe('Cogorno: a hole plated to .518', () => {
    const plated = (smallest: number, tolerance: number) =>
      deviations({
        units: 'in',
        dx: 0.005,
        tolerance,
        modifier: 'mmc',
        smallest,
        largest: 0.54,
        measured: 0.518,
      });

    it('is rejected as too small under Ø.520–.540 at Ø.020 MMC', () => {
      const d = plated(0.52, 0.02);
      expect([d.tone, d.headline]).toEqual(['fail', 'Fails on size']);
      expect(d.detail).toBe(
        'Measured Ø0.5180 in is below the smallest size, Ø0.5200 in: ' +
          'the hole fails on size whatever its position, and earns no bonus.',
      );
      expect(fact(d, 'Allowed')).toBeUndefined();
      expect(fact(d, 'Bonus')).toBeUndefined();
    });

    it('passes Ø.010 of position under Ø.500–.540 at zero MMC, on a bonus of .018', () => {
      const d = plated(0.5, 0);
      expect(d.detail).toBe(
        'Position Ø0.0100 in against Ø0.0180 in allowed: within, by 0.0080 in.',
      );
      expect(d.working).toContain(
        'Hole at MMC: bonus = measured − smallest = 0.518 − 0.5 = 0.0180 in',
      );
      expect(d.working).toContain('allowed = tolerance + bonus = 0 + 0.0180 = 0.0180 in');
      expect(d.withoutBonus).toBe(
        'With no bonus, against Ø0 in alone: over, by 0.0100 in.',
      );
    });
  });
});

describe('exact at the edge', () => {
  it('passes 0.03 and 0.04 mm off against Ø0.1: exactly on the limit', () => {
    const d = deviations({ dx: 0.03, dy: 0.04 });
    expect(d.headline).toBe('Within');
    expect(d.detail).toBe(
      'Position Ø0.1000 mm against Ø0.1000 mm allowed: within, exactly on the limit. ' +
        'Regardless of feature size: no bonus is counted, and the size is not checked.',
    );
  });

  it('fails 1.6 nm over, and does not print "0.1000 > 0.1000"', () => {
    const d = deviations({ dx: 0.03, dy: 0.040001 });
    expect([d.tone, d.headline]).toEqual(['fail', 'Over']);
    expect(d.detail).toContain('over, by less than 0.0001 mm.');
    expect(d.working).toContain('0.1000 against 0.1000: over, by less than 0.0001 mm');
    expect(d.working).not.toContain('0.1000 > 0.1000');
    // 0.040001 shows as 0.04, so the working says its figures are rounded.
    expect(d.working).toContain('An input has more decimal places than are shown here.');
  });

  // Exact ties go half-even: 0.108475 mm off is a position of 0.21695 mm, and
  // 0.108425 mm off is 0.21685 mm.
  it.each([
    [0.108475, 'Ø0.2170 mm'],
    [0.108425, 'Ø0.2168 mm'],
  ])('rounds a tie half-even: %f mm off is %s', (dx, shown) => {
    expect(fact(deviations({ dx, tolerance: 1 }), 'Position')).toBe(shown);
  });

  it('rounds once from the exact root, not to the nanometre first', () => {
    // dx 108 474 nm, dy 460 nm: the position is 216 949.95069 nm, 0.2169 mm.
    // Rounded to 216 950 nm first, it becomes a tie and prints 0.2170.
    expect(
      fact(deviations({ dx: 0.108474, dy: 0.00046, tolerance: 1 }), 'Position'),
    ).toBe('Ø0.2169 mm');
  });
});

describe('no pass or fail without the size, at MMC or LMC', () => {
  it.each([[{ measured: null }], [{ smallest: null }], [{ largest: null }]])(
    'gives none with %o',
    (over) => {
      const d = coordinates(over);
      expect([d.verdict, d.tone, d.headline]).toEqual([
        'needs-size',
        'none',
        'No pass or fail yet',
      ]);
      expect(d.detail).toBe(
        'At MMC the tolerance grows with a bonus that depends on the size. ' +
          'Give the smallest and largest sizes and the measured size for a pass or fail.',
      );
      expect(d.summary.map((s) => s.label)).toEqual(['Position', 'Off in X', 'Off in Y']);
      expect(d.figure.inside).toBeNull();
    },
  );

  it('says which size to measure, for each of the four cases', () => {
    const which = (modifier: 'mmc' | 'lmc', feature: 'hole' | 'pin') =>
      coordinates({ modifier, feature, measured: null }).working;
    expect(which('mmc', 'hole')).toContain('the largest perfect pin that fits in it');
    expect(which('mmc', 'pin')).toContain('the smallest perfect ring that fits over');
    expect(which('lmc', 'hole')).toContain(
      'the smallest perfect cylinder\nthat encloses it',
    );
    expect(which('lmc', 'pin')).toContain('the largest perfect cylinder\ninside it');
  });
});

describe('the four bonus lines', () => {
  it.each([
    [
      'mmc',
      'hole',
      10,
      10.1,
      10.048,
      'Hole at MMC: bonus = measured − smallest = 10.048 − 10 = 0.0480 mm',
    ],
    [
      'mmc',
      'pin',
      9.9,
      10,
      9.95,
      'Pin at MMC: bonus = largest − measured = 10 − 9.95 = 0.0500 mm',
    ],
    [
      'lmc',
      'hole',
      10,
      10.1,
      10.02,
      'Hole at LMC: bonus = largest − measured = 10.1 − 10.02 = 0.0800 mm',
    ],
    [
      'lmc',
      'pin',
      9.9,
      10,
      9.95,
      'Pin at LMC: bonus = measured − smallest = 9.95 − 9.9 = 0.0500 mm',
    ],
  ] as const)('%s, %s', (modifier, feature, smallest, largest, measured, line) => {
    expect(
      coordinates({ modifier, feature, smallest, largest, measured }).working,
    ).toContain(line);
  });
});

describe('the position alone', () => {
  it('gives the position and no verdict while the tolerance is blank, as the app does', () => {
    const d = coordinates({ tolerance: null });
    expect([d.verdict, d.tone, d.headline]).toEqual([
      'no-tolerance',
      'none',
      'Position only',
    ]);
    expect(d.detail).toBe(
      'Give the tolerance from the feature control frame for a pass or fail.',
    );
    expect(d.summary.map((s) => s.label)).toEqual(['Position', 'Off in X', 'Off in Y']);
    expect(d.working).toContain(
      'No tolerance given: the position alone, with no pass or fail.',
    );
    expect(d.figure.zoneR).toBeNull();
  });

  it('works 100 mm off each way: Ø282.8427 mm, the same figure the app shows', () => {
    // 2√(100² + 100²) = 200√2 = 282.842712 mm.
    const d = deviations({ dx: 100, dy: -100, tolerance: null });
    expect(fact(d, 'Position')).toBe('Ø282.8427 mm');
  });
});

describe('the working', () => {
  it('brackets a negative figure after a minus, as the app prints it', () => {
    // The app's own case: drawn (-25, 40), measured (-24.97, 39.96), Ø0.1.
    const d = coordinates({
      drawnX: -25,
      drawnY: 40,
      measuredX: -24.97,
      measuredY: 39.96,
      tolerance: 0.1,
      modifier: 'rfs',
    });
    expect(d.working).toContain('dx = measured X − drawn X = -24.97 − (-25) = 0.0300 mm');
    expect(d.working).toContain('dy = measured Y − drawn Y = 39.96 − 40 = -0.0400 mm');
    expect(d.working).toContain('position = 2 × √(0.0300² + (-0.0400)²) = 0.1000 mm');
    expect(d.headline).toBe('Within');
  });

  it('brackets a negative deviation before squaring it', () => {
    const d = coordinates({ measuredX: 49.938 });
    expect(d.working).toContain('position = 2 × √((-0.0620)² + 0.0890²) = 0.2169 mm');
    expect(fact(d, 'Off in X')).toBe('-0.0620 mm');
  });

  it('says nothing about rounding when every input is shown as typed', () => {
    expect(coordinates({}).working).not.toContain('decimal places');
  });

  it('says its figures are rounded when an input has more places than shown', () => {
    // 0.00775 + 0.00175 in prints as 0.0078 + 0.0018 = 0.0095: each figure
    // right, the line a step out.
    const d = deviations({
      units: 'in',
      dx: 0.001,
      tolerance: 0.00775,
      modifier: 'mmc',
      smallest: 0.5,
      largest: 0.51,
      measured: 0.50175,
    });
    expect(d.working).toContain(
      'allowed = tolerance + bonus = 0.0078 + 0.0018 = 0.0095 in',
    );
    expect(d.working).toContain('An input has more decimal places than are shown here.');
  });
});

describe('refusals reach the page as sentences', () => {
  it.each([
    [{ measuredX: Number.NaN }, /Enter every length as a number/],
    [{ drawnX: 100_001 }, /coordinate more than 100 m from the datum/],
    [{ measuredY: 130.1 }, /More than 100 mm off in X or Y/],
    [{ tolerance: 0, modifier: 'rfs' as const }, /zero tolerance needs MMC or LMC/i],
    [{ smallest: 10.2 }, /wrong way round/],
  ])('refuses %o', (over, message) => {
    expect(() => coordinates(over)).toThrow(message);
  });
});

describe('rounding a bracket', () => {
  it('rounds an exact tie half-even, in millimetres and in inches', () => {
    expect(bracketSteps({ floor: 216_950, exact: true }, 'mm')).toBe(2170);
    expect(bracketSteps({ floor: 216_850, exact: true }, 'mm')).toBe(2168);
    expect(bracketSteps({ floor: 1_270, exact: true }, 'in')).toBe(0);
    expect(bracketSteps({ floor: 3_810, exact: true }, 'in')).toBe(2);
  });

  it('rounds a value just past a boundary up, and one just short of it down', () => {
    // (216 950, 216 951) is past the boundary at 216 950; (216 949, 216 950) is short.
    expect(bracketSteps({ floor: 216_950, exact: false }, 'mm')).toBe(2170);
    expect(bracketSteps({ floor: 216_949, exact: false }, 'mm')).toBe(2169);
    expect(bracketSteps({ floor: 216_850, exact: false }, 'mm')).toBe(2169);
  });

  it('rounds whole nanometres of either sign, and never to −0', () => {
    expect(wholeSteps(-150, 'mm')).toBe(-2);
    expect(wholeSteps(-250, 'mm')).toBe(-2);
    expect(Object.is(wholeSteps(-50, 'mm'), 0)).toBe(true);
  });
});

/**
 * The claim in the display module's header: when every input is a whole number
 * of display steps, every line of the working adds up as printed, so the note
 * about rounding is never needed. Checked by parsing the printed lines back,
 * over random inputs (a fixed seed, so a failure reproduces).
 */
describe('every printed line adds up when the inputs are shown as typed', () => {
  /** "0.0620", "-0.05" or "10" as whole steps of 0.0001. */
  const asSteps = (s: string): number => {
    const negative = s.startsWith('-');
    const [whole = '0', frac = ''] = s.replace('-', '').split('.');
    const n = Number(whole) * 10_000 + Number(frac.padEnd(4, '0'));
    return negative ? -n : n;
  };
  const NUM = String.raw`(-?\d+(?:\.\d+)?)`;
  const DIFF = new RegExp(String.raw`= ${NUM} − ${NUM} = ${NUM}`);
  const SUM = new RegExp(String.raw`= ${NUM} \+ ${NUM} = ${NUM}`);
  const ROOT = new RegExp(String.raw`2 × √\(\(?${NUM}\)?² \+ \(?${NUM}\)?²\) = ${NUM}`);
  const VERDICT = new RegExp(
    String.raw`^${NUM} (≤|>|against) ${NUM}: (within|over), (by ${NUM}|by less than 0\.0001|exactly on the limit)`,
  );

  /** Mulberry32: a small seeded generator, so the cases are the same every run. */
  function rng(seed: number): () => number {
    let a = seed;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
    };
  }

  it('over 3000 random checks in both units, all four bonus cases and regardless of size', () => {
    const r = rng(20261006);
    const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
    const typed = (steps: number) => steps / 10_000;
    const modifiers = ['rfs', 'mmc', 'lmc'] as const;
    let lines = 0;
    for (let i = 0; i < 3000; i++) {
      const modifier = modifiers[i % 3] ?? 'rfs';
      const smallest = int(1, 500_000);
      const largest = smallest + int(0, 2_000);
      const drawnX = int(-900_000, 900_000);
      const drawnY = int(-900_000, 900_000);
      const d = truePositionDisplay({
        entry: i % 2 === 0 ? 'deviations' : 'coordinates',
        units: i % 4 < 2 ? 'mm' : 'in',
        dx: typed(int(-3_000, 3_000)),
        dy: typed(int(-3_000, 3_000)),
        drawnX: typed(drawnX),
        drawnY: typed(drawnY),
        measuredX: typed(drawnX + int(-3_000, 3_000)),
        measuredY: typed(drawnY + int(-3_000, 3_000)),
        tolerance: typed(int(modifier === 'rfs' ? 1 : 0, 3_000)),
        modifier,
        feature: i % 5 < 2 ? 'pin' : 'hole',
        smallest: typed(smallest),
        largest: typed(largest),
        measured: typed(int(smallest - 50, largest + 50)),
      } as TruePositionInput);
      expect(d.working).not.toContain('decimal places');
      for (const line of d.working.split('\n')) {
        let m: RegExpMatchArray | null;
        if ((m = line.match(DIFF))) {
          expect(asSteps(m[1] ?? '') - asSteps(m[2] ?? ''), line).toBe(
            asSteps(m[3] ?? ''),
          );
          lines++;
        } else if ((m = line.match(SUM))) {
          expect(asSteps(m[1] ?? '') + asSteps(m[2] ?? ''), line).toBe(
            asSteps(m[3] ?? ''),
          );
          lines++;
        } else if ((m = line.match(ROOT))) {
          // The printed position p is the root rounded when it is within half
          // a step of it, p − ½ < √T < p + ½ with T = 4(x² + y²) in steps²:
          // (2p − 1)² < 4T < (2p + 1)², or 4T < 1 when p is 0. No tie is
          // possible, so both ends are strict.
          const x = BigInt(asSteps(m[1] ?? ''));
          const y = BigInt(asSteps(m[2] ?? ''));
          const p = BigInt(asSteps(m[3] ?? ''));
          const t4 = 16n * (x * x + y * y);
          const ok =
            p === 0n ? t4 < 1n : (2n * p - 1n) ** 2n < t4 && t4 < (2n * p + 1n) ** 2n;
          expect(ok, line).toBe(true);
          lines++;
        } else if ((m = line.match(VERDICT))) {
          const [, pos = '', sign, allowed = '', verdict, by, margin] = m;
          const gap =
            verdict === 'within'
              ? asSteps(allowed) - asSteps(pos)
              : asSteps(pos) - asSteps(allowed);
          expect(gap, line).toBe(margin === undefined ? 0 : asSteps(margin));
          if (by === 'exactly on the limit') expect(pos, line).toBe(allowed);
          if (sign === '>') expect(asSteps(pos), line).toBeGreaterThan(asSteps(allowed));
          lines++;
        }
      }
    }
    // Enough lines were really checked for the claim to mean something.
    expect(lines).toBeGreaterThan(6000);
  });
});
