import { describe, expect, it } from 'vitest';
import {
  feedsDisplay,
  rpmAsPrinted,
  stepsOfSquare,
  type FeedsDisplay,
  type FeedsInput,
} from '../../src/lib/calc/feeds-speeds-display';

/**
 * What the feeds and speeds page prints, checked as strings.
 *
 * Expected values come from four places, each named where it is used:
 *
 *   - `machinist-calc-research` 03-spec/calculations.md §3: the chip and
 *     entering-angle golden values, worked in Python from Sandvik Coromant's
 *     and Kennametal's formulas as printed before any Kotlin existed, and
 *     worked again independently for this site (all agree).
 *   - The same file, §1 "Display": its own printed-arithmetic example,
 *     `0.4000 × 3183.09886 = 1273.2395`.
 *   - `feeds-speeds.test.ts`'s drilling and boring fixtures, computed
 *     independently from the ISO 3002-1 definitions.
 *   - A separate Python search over 148 500 milling cuts, replicating the
 *     page's double arithmetic and deciding each vf line with exact integers:
 *     it found the cuts below whose n needs six places, and one with none.
 */

const input = (over: Partial<FeedsInput>): FeedsInput => ({
  op: 'milling',
  units: 'metric',
  vc: 100,
  diameter: 10,
  feed: 0.1,
  teeth: 4,
  ae: 5,
  ap: 2,
  d0: 20,
  kappa: null,
  thread: { kind: 'pitch', value: 1.5 },
  ...over,
});

const stat = (d: FeedsDisplay, label: string) => d.stats.find((s) => s.label === label);

describe("the page's opening cut: Vc 100, Dc 10, fz 0.1, z 4, ae 5, ap 2", () => {
  const d = feedsDisplay(input({}));

  it('shows the speed, both feeds, the removal rate and both chips', () => {
    expect(d.stats).toEqual([
      { label: 'Spindle speed', value: '3183', unit: 'rev/min', note: null },
      { label: 'Feed', value: '1273.2395', unit: 'mm/min', note: null },
      { label: 'Feed per rev', value: '0.4000', unit: 'mm/rev', note: null },
      { label: 'Removal rate', value: '12.7324', unit: 'cm³/min', note: null },
      { label: 'Max chip', value: '0.1000', unit: 'mm', note: 'hex' },
      {
        label: 'Mean chip',
        value: '0.0637',
        unit: 'mm',
        note: 'hm, for the cutting force',
      },
    ]);
  });

  it('has no feed to restore: at half the diameter the chip is as thick as fz', () => {
    expect(d.restore).toBeNull();
  });

  it('prints the working, with the vf line multiplying out as printed', () => {
    expect(d.working).toBe(
      [
        'n  = Vc × 1000 / (π × Dc)',
        '   = 100 × 1000 / (π × 10.0000 mm)',
        '   = 3183.0989 rev/min, so S3183',
        '',
        'fn = fz × z = 0.1000 × 4 = 0.4000 mm/rev',
        // calculations.md §1's own example: four places, 3183.0989, give 1273.23956.
        'vf = fn × n = 0.4000 × 3183.09886 = 1273.2395 mm/min',
        '',
        'Q  = ae × ap × vf / 1000 = 5.0000 × 2.0000 × 1273.2395 / 1000 = 12.7324 cm³/min',
        '',
        'Chip, at D = Dc = 10.0000 mm, κr = 90°:',
        'ae / D = 5.0000 / 10.0000 = 0.5000',
        'hex = fz × sin κr = 0.1000 × 1 = 0.1000 mm   ae ≥ D/2 (Sandvik Coromant)',
        'hm  = fz × sin κr × (ae/D) × (360/π) / arccos°(1 − 2 × ae/D)   (Kennametal; it prints 114.6)',
        '    = 0.1000 × 1 × 0.5000 × 114.5916 / 90.0000° = 0.0637 mm',
      ].join('\n'),
    );
  });

  it('hands the power panel the exact mean chip, (2/π) × fz here', () => {
    expect(d.power?.chipLabel).toBe('hm');
    expect(d.power?.chipNm).toBeCloseTo((2 / Math.PI) * 100_000, 6);
    expect(d.power?.mrrCm3).toBeCloseTo(12.7324, 4);
  });
});

describe('the vf line multiplies out as printed', () => {
  it.each([
    // [fn steps, n, vf steps, n as printed]
    [4000, 3183.0988618379067, 12732395, '3183.09886'],
    [12000, 1273.2395447351626, 15278875, '1273.239545'],
    [5600, 1660.747232263256, 9300185, null],
  ])('fn %i steps at n %f gives vf %i: n printed as %s', (fn, n, vf, shown) => {
    expect(rpmAsPrinted(fn, n, vf)).toBe(shown);
  });

  it('takes six places where five do not multiply out', () => {
    // Vc 40, Dc 10, fz 0.2, z 6: 1.2 × 1273.2395 and 1.2 × 1273.23954 both
    // give 1527.8874; the vf shown is 1527.8875.
    const d = feedsDisplay(input({ vc: 40, feed: 0.2, teeth: 6 }));
    expect(d.working).toContain('vf = fn × n = 1.2000 × 1273.239545 = 1527.8875 mm/min');
  });

  it('says so where no printing of n to six places multiplies out', () => {
    // Vc 60, Dc 11.5, fz 0.14, z 4: vf is 930.01845007, shown 930.0185, and
    // every rounding of n to four, five or six places multiplies to 930.0184.
    const d = feedsDisplay(input({ vc: 60, diameter: 11.5, feed: 0.14 }));
    expect(d.working).toContain(
      'vf = fn × n = 0.5600 × 1660.747232 = 930.0185 mm/min   (fn and n are rounded here, so this may not multiply out exactly)',
    );
  });

  it('marks an fn line whose fz has more places than are shown', () => {
    // 0.12345 shows as 0.1234 (half-even), and 0.12345 × 3 = 0.37035 as 0.3704.
    const d = feedsDisplay(input({ feed: 0.12345, teeth: 3 }));
    expect(d.working).toContain(
      'fn = fz × z = 0.1234 × 3 = 0.3704 mm/rev   (fz shown rounded)',
    );
  });
});

describe('a narrow cut thins the chip, and the page says what feed restores it', () => {
  // ae 1 of Dc 10, square shoulder: hex/fz 0.6 exactly, hm/fz 0.3107997753.
  const d = feedsDisplay(input({ ae: 1 }));

  it('shows the thinned chips', () => {
    expect(stat(d, 'Max chip')?.value).toBe('0.0600');
    expect(stat(d, 'Mean chip')?.value).toBe('0.0311');
    expect(d.working).toContain(
      'hex = fz × sin κr × 2 × √(D × ae − ae²) / D   ae < D/2 (Sandvik Coromant)\n' +
        '    = 0.1000 × 1 × 2 × √(10.0000 × 1.0000 − 1.0000²) / 10.0000 = 0.0600 mm',
    );
    expect(d.working).toContain(
      '    = 0.1000 × 1 × 0.1000 × 114.5916 / 36.8699° = 0.0311 mm',
    );
  });

  it('shows the feed that restores the chip, 1/0.6 of fz, and never applies it', () => {
    expect(d.restore?.value).toBe('0.1667');
    expect(d.restore?.unit).toBe('mm/tooth');
    expect(d.restore?.note).toContain('at this width');
    expect(d.working).toContain(
      'fz to restore the chip = fz ÷ (hex / fz) = 0.1000 ÷ 0.6000 = 0.1667 mm/tooth   shown, not applied',
    );
    // The feeds above are still the typed 0.1 × 4.
    expect(stat(d, 'Feed per rev')?.value).toBe('0.4000');
  });
});

describe('the entering angle: the CoroMill 345 at 6 mm deep', () => {
  // Sandvik's 63 mm 45° cutter (345-063C6-13M), Vc 250, ap 6, ae 45, fz 0.2.
  const d = feedsDisplay(
    input({ vc: 250, diameter: 63, ap: 6, ae: 45, feed: 0.2, teeth: 6, kappa: 45 }),
  );

  it('works the speed at Dcap 75 mm: 1061 rev/min, not 1263', () => {
    expect(stat(d, 'Spindle speed')).toEqual({
      label: 'Spindle speed',
      value: '1061',
      unit: 'rev/min',
      note: 'at Dcap 75.0000 mm',
    });
    expect(d.working).toContain(
      'Dcap = Dc + 2 × ap / tan κr = 63.0000 + 2 × 6.0000 / tan 45° = 75.0000 mm',
    );
    expect(d.working).toContain('   = 250 × 1000 / (π × 75.0000 mm)');
    expect(d.working).toContain('   = 1061.0330 rev/min, so S1061');
  });

  it('thins the chip by sin κr at any width, and restores it by 1/sin κr', () => {
    expect(stat(d, 'Max chip')?.value).toBe('0.1414');
    expect(stat(d, 'Mean chip')?.value).toBe('0.0958');
    expect(d.working).toContain(
      'Chip, at D = Dcap = 75.0000 mm, κr = 45°, sin κr = 0.7071:',
    );
    // The arc the tooth is in the cut, arccos(1 − 2 × 0.6) = 101.5370°, as the app prints it.
    expect(d.working).toContain(
      '    = 0.2000 × 0.7071 × 0.6000 × 114.5916 / 101.5370° = 0.0958 mm',
    );
    expect(d.restore?.value).toBe('0.2828');
  });

  it('warns that a data sheet may have raised the feed for κr already', () => {
    expect(d.restore?.note).toContain('raising it again would be 1.4142 times too much');
  });

  it('gives the high-feed cutter its 1/sin 10° warning', () => {
    const hf = feedsDisplay(
      input({ vc: 200, diameter: 32, ap: 1, ae: 20, feed: 1, teeth: 3, kappa: 10 }),
    );
    expect(hf.restore?.value).toBe('5.7760');
    expect(hf.restore?.note).toContain('5.7588 times too much');
    expect(stat(hf, 'Spindle speed')?.note).toBe('at Dcap 43.3426 mm');
  });

  it('keeps the width check at Dc: 70 mm under a 63 mm cutter is two passes', () => {
    // Dcap is 75 at 6 mm deep, but only the tip leaves a flat floor.
    expect(() =>
      feedsDisplay(input({ vc: 250, diameter: 63, ap: 6, ae: 70, feed: 0.2, kappa: 45 })),
    ).toThrow(/that is two passes/);
  });

  it('shows the restoring feed for the slightest thinning too', () => {
    // 85° at full width thins by sin 85° = 0.99619: 0.1 / 0.99619 = 0.10038.
    const shallow = feedsDisplay(input({ kappa: 85 }));
    expect(shallow.restore?.value).toBe('0.1004');
    expect(shallow.restore?.note).toContain('1.0038 times too much');
    // A square shoulder at 45% of the diameter: 2√(0.45 × 0.55) = 0.99499.
    expect(feedsDisplay(input({ ae: 4.5 })).restore?.value).toBe('0.1005');
  });

  it('treats a typed 90° as a square shoulder, the same as a blank', () => {
    expect(feedsDisplay(input({ ae: 1, kappa: 90 }))).toEqual(
      feedsDisplay(input({ ae: 1 })),
    );
  });
});

describe('the other operations', () => {
  it('drilling: Vc 80, Dc 10, fn 0.2 — n 2546.4791, vf 509.2958, Q 40', () => {
    const d = feedsDisplay(input({ op: 'drilling', vc: 80, feed: 0.2 }));
    expect(d.stats.map((s) => s.value)).toEqual([
      '2546',
      '509.2958',
      '0.2000',
      '40.0000',
      '0.2000',
    ]);
    expect(d.working).toContain(
      'Q  = Dc × fn × Vc / 4 = 10.0000 × 0.2000 × 80 / 4 = 40.0000 cm³/min',
    );
    expect(d.restore).toBeNull();
    expect(d.power?.chipLabel).toBe('h = fn');
  });

  it('boring: 20 to 24 mm at Vc 150, fn 0.15 — ap 2, n 1989.4368, Q 45', () => {
    const d = feedsDisplay(
      input({ op: 'boring', vc: 150, diameter: 24, d0: 20, feed: 0.15 }),
    );
    expect(d.working).toContain('n  = Vc × 1000 / (π × d₁)');
    expect(d.working).toContain('   = 1989.4368 rev/min, so S1989');
    expect(d.working).toContain(
      'ap = (d₁ − d₀) / 2 = (24.0000 − 20.0000) / 2 = 2.0000 mm',
    );
    expect(d.working).toContain(
      'Q  = Vc × ap × fn = 150 × 2.0000 × 0.1500 = 45.0000 cm³/min',
    );
  });

  it('turning in inches: 500 sfm on a 2 in bar, fn 0.008, ap 0.1', () => {
    const d = feedsDisplay(
      input({ op: 'turning', units: 'inch', vc: 500, diameter: 2, feed: 0.008, ap: 0.1 }),
    );
    expect(d.stats.map((s) => `${s.value} ${s.unit}`)).toEqual([
      '955 rev/min',
      '7.6394 in/min',
      '0.0080 in/rev',
      '4.8000 in³/min',
      '0.0080 in',
    ]);
    expect(d.working).toContain('n  = Vc × 12 / (π × Dc)');
    expect(d.working).toContain(
      'Q  = Vc × 12 × ap × fn = 500 × 12 × 0.1000 × 0.0080 = 4.8000 in³/min',
    );
  });

  it('milling in inches multiplies sfm up, rather than dividing mm³ down', () => {
    const d = feedsDisplay(
      input({
        units: 'inch',
        vc: 400,
        diameter: 0.5,
        feed: 0.002,
        teeth: 4,
        ae: 0.25,
        ap: 0.1,
      }),
    );
    expect(d.working).toContain('Q  = ae × ap × vf = 0.2500 × 0.1000 × ');
    expect(stat(d, 'Removal rate')?.unit).toBe('in³/min');
    expect(stat(d, 'Mean chip')?.unit).toBe('in');
  });
});

describe('refusals reach the page as sentences', () => {
  it.each([
    [{ vc: Number.NaN }, /Enter the cutting speed as a number above zero/],
    [{ vc: 0 }, /Enter the cutting speed as a number above zero/],
    [{ diameter: 0 }, /Enter the cutter diameter as a number above zero/],
    [{ feed: -0.1 }, /Enter the feed per tooth as a number above zero/],
    [{ teeth: 2.5 }, /whole number, 1 or more/],
    [{ ae: Number.NaN }, /Enter the width of cut aₑ as a number above zero/],
    [{ ae: 10.5 }, /cannot be more than the cutter diameter/],
    [{ kappa: 0 }, /A lead angle of 0° is a square shoulder: enter 90°/],
    [{ kappa: 120 }, /more than 0° and no more than 90°/],
    [{ op: 'boring' as const, diameter: 20, d0: 24 }, /must enlarge the hole/],
    [
      { op: 'turning' as const, feed: Number.NaN },
      /Enter the feed per rev as a number above zero/,
    ],
  ])('refuses %o', (over, message) => {
    expect(() => feedsDisplay(input(over))).toThrow(message);
  });
});

/**
 * The app's sweep, on the site: over a grid of typed metric cuts, the vf line
 * either multiplies out exactly as printed or says that it may not — never
 * neither, never both — and saying so is rare. Checked with exact integers.
 */
describe('the vf line over a sweep of cuts', () => {
  /** "1273.2395" as [digits, places]. */
  const parse = (s: string): [bigint, number] => {
    const [whole = '0', frac = ''] = s.split('.');
    return [BigInt(whole + frac), frac.length];
  };
  /** fn × n, multiplied exactly as printed and rounded half-even to vf's places. */
  const multipliesOut = (fn: string, n: string, vf: string): boolean => {
    const [a, pa] = parse(fn);
    const [b, pb] = parse(n);
    const [c, pc] = parse(vf);
    const drop = 10n ** BigInt(pa + pb - pc);
    const product = a * b;
    let q = product / drop;
    const twice = 2n * (product % drop);
    if (twice > drop || (twice === drop && q % 2n === 1n)) q += 1n;
    return q === c;
  };

  it('multiplies out, or says it may not, and rarely needs to say it', () => {
    let cases = 0;
    let noted = 0;
    for (const vc of [37, 60, 85, 100, 140, 180, 220, 275, 333, 410]) {
      for (const dc of [3, 4.5, 6, 8, 10, 12.7, 16, 20, 25, 32, 50, 63]) {
        for (const fz of [0.02, 0.05, 0.08, 0.1, 0.12, 0.15]) {
          for (const z of [2, 3, 4, 6]) {
            const w = feedsDisplay(
              input({ vc, diameter: dc, feed: fz, teeth: z, ae: dc / 2 }),
            ).working;
            const line = w.split('\n').find((l) => l.startsWith('vf = fn × n = ')) ?? '';
            const m = line.match(/= (\d+\.\d{4}) × (\d+\.\d+) = (\d+\.\d{4}) mm\/min/);
            expect(m, line).not.toBeNull();
            const note = line.includes('may not multiply out');
            expect(note, line).toBe(
              !multipliesOut(m?.[1] ?? '', m?.[2] ?? '', m?.[3] ?? ''),
            );
            cases++;
            if (note) noted++;
          }
        }
      }
    }
    expect(cases).toBe(2880);
    // The spec measured 10 noted lines in 5760 cuts on the app; rare, not never.
    expect(noted / cases).toBeLessThan(0.01);
  });
});

/**
 * A chip exactly on a rounding tie is rounded half-even exactly, not by float
 * noise. Found by search: before this, 390 of 2.1 million 45° cuts printed the
 * restoring feed a step out — a 50 mm 45° cutter 20 mm deep with ae 10 thins
 * the chip to exactly 4/9 of fz, so fz 0.001 mm is restored by exactly
 * 0.00225 mm, which the floats printed as 0.0023. The ties below were each
 * worked by hand from the exact ratio.
 */
describe('a chip exactly on a rounding tie', () => {
  const restore = (d: FeedsDisplay) => d.restore?.value;
  const hex = (d: FeedsDisplay) => stat(d, 'Max chip')?.value;

  it.each([
    // Dcap 50 + 2 × 20 = 90, ae 10: hex/fz = √2/2 × 2√(10 × 80)/90 = 4/9.
    [
      '45°: 0.001 × 9/4 = 0.00225 → 0.0022',
      { diameter: 50, ap: 20, ae: 10, kappa: 45, feed: 0.001 },
      restore,
      '0.0022',
    ],
    [
      '45°: 0.0002 × 9/4 = 0.00045 → 0.0004',
      { diameter: 50, ap: 20, ae: 10, kappa: 45, feed: 0.0002 },
      restore,
      '0.0004',
    ],
    // Dc 0.5, ap 1.1: Dcap 2.7 exactly (the floats made it 2.7000000000000005),
    // ae 0.3 = Dcap/9, so 4/9 again.
    [
      '45°, Dcap 2.7: 0.001 × 9/4 = 0.00225 → 0.0022',
      { diameter: 0.5, ap: 1.1, ae: 0.3, kappa: 45, feed: 0.001 },
      restore,
      '0.0022',
    ],
    // Full width at 30°: hex = fz × sin 30° = fz / 2.
    [
      '30°, full width: 0.0003 / 2 = 0.00015 → 0.0002',
      { diameter: 10, ap: 1, ae: 10, kappa: 30, feed: 0.0003 },
      hex,
      '0.0002',
    ],
    // Inch, Dcap 0.5 + 2 × 0.2 = 0.9, ae 0.1: 4/9 again.
    [
      'inch 45°: 0.0038 × 9/4 = 0.00855 → 0.0086',
      {
        units: 'inch' as const,
        diameter: 0.5,
        ap: 0.2,
        ae: 0.1,
        kappa: 45,
        feed: 0.0038,
      },
      restore,
      '0.0086',
    ],
    // Inch, square shoulder, ae/Dc 0.2: hex/fz = 2√(0.2 × 0.8) = 0.8.
    [
      'inch 90°: 0.001 / 0.8 = 0.00125 → 0.0012',
      { units: 'inch' as const, diameter: 2, ae: 0.4, ap: 0.1, feed: 0.001, teeth: 1 },
      restore,
      '0.0012',
    ],
  ])('%s', (_name, over, pick, shown) => {
    expect(pick(feedsDisplay(input(over)))).toBe(shown);
  });

  it('rounds a length from its exact square, ties to even', () => {
    expect(stepsOfSquare(2250n * 2250n, 1n, 'metric')).toBe(22); // 0.00225 mm: a tie, to 22
    expect(stepsOfSquare(2350n * 2350n, 1n, 'metric')).toBe(24); // 0.00235 mm: a tie, to 24
    expect(stepsOfSquare(2251n * 2251n, 1n, 'metric')).toBe(23);
    expect(stepsOfSquare(2249n * 2249n, 1n, 'metric')).toBe(22);
    expect(stepsOfSquare(217_170n * 217_170n, 1n, 'inch')).toBe(86); // 0.00855 in: to 86
    expect(stepsOfSquare(2n, 1n, 'metric')).toBe(0); // √2 nm
    // 4/9 of 2025 nm, squared: a fraction, not a whole square.
    expect(stepsOfSquare(2025n * 2025n * 16n, 81n, 'metric')).toBe(9); // 900 nm
  });
});

/**
 * Tapping, through the page's own path: a cutting speed and a diameter give
 * S, and the feed is worked from S. The spec's golden table (calculations.md
 * §3, worked in Python with decimal arithmetic before any Kotlin existed),
 * row by row, and the working's lines as the app prints them.
 */
describe('tapping', () => {
  const tap = (over: Partial<FeedsInput>) =>
    feedsDisplay(input({ op: 'tapping', ...over }));
  const shown = (d: FeedsDisplay) => d.stats.map((s) => `${s.value} ${s.unit}`);

  it.each([
    // [tap, input, S, fn, vf]
    [
      'M10 × 1.5 at 10 m/min',
      { vc: 10, diameter: 10, thread: { kind: 'pitch', value: 1.5 } },
      '318',
      '1.5000 mm/rev',
      '477.0000 mm/min',
    ],
    [
      'M6 × 1 at 8 m/min',
      { vc: 8, diameter: 6, thread: { kind: 'pitch', value: 1 } },
      '424',
      '1.0000 mm/rev',
      '424.0000 mm/min',
    ],
    [
      '1/4-20 at 30 sfm',
      { units: 'inch', vc: 30, diameter: 0.25, thread: { kind: 'tpi', value: 20 } },
      '458',
      '0.0500 in/rev',
      '22.9000 in/min',
    ],
    [
      '1/4-20 at 30 sfm, metric machine',
      { vc: 9.144, diameter: 6.35, thread: { kind: 'tpi', value: 20 } },
      '458',
      '1.2700 mm/rev',
      '581.6600 mm/min',
    ],
    [
      '1/2-13 at 50 sfm',
      { units: 'inch', vc: 50, diameter: 0.5, thread: { kind: 'tpi', value: 13 } },
      '382',
      '0.0769 in/rev',
      '29.3846 in/min',
    ],
    [
      '#10-24 at 20 sfm',
      { units: 'inch', vc: 20, diameter: 0.19, thread: { kind: 'tpi', value: 24 } },
      '402',
      '0.0417 in/rev',
      '16.7500 in/min',
    ],
    [
      'M10 × 1.5 on an inch machine',
      { units: 'inch', vc: 33.3, diameter: 0.4, thread: { kind: 'pitch', value: 1.5 } },
      '318',
      '0.0591 in/rev',
      '18.7795 in/min',
    ],
  ] as const)('%s', (_name, over, S, fn, vf) => {
    const d = tap(over as Partial<FeedsInput>);
    expect(shown(d)).toEqual([`${S} rev/min`, vf, fn]);
    expect(d.restore).toBeNull();
    expect(d.power).toBeNull();
  });

  it('prints the feed line the way the app and Haas do', () => {
    const metric = tap({ vc: 10, diameter: 10 }).working;
    expect(metric).toContain('   = 318.3099 rev/min, so S318');
    expect(metric).toContain('vf = P × S = 1.5 × 318 = 477.0000 mm/min');
    expect(metric).toContain(
      "With a floating holder, the holder's maker gives the feed.",
    );
    const inch = tap({
      units: 'inch',
      vc: 30,
      diameter: 0.25,
      thread: { kind: 'tpi', value: 20 },
    }).working;
    expect(inch).toContain('vf = S / TPI = 458 / 20 = 22.9000 in/min');
    const across = tap({
      vc: 9.144,
      diameter: 6.35,
      thread: { kind: 'tpi', value: 20 },
    }).working;
    expect(across).toContain('vf = S / TPI × 25.4 = 458 / 20 × 25.4 = 581.6600 mm/min');
    const back = tap({ units: 'inch', vc: 33.3, diameter: 0.4 }).working;
    expect(back).toContain('vf = P × S / 25.4 = 1.5 × 318 / 25.4 = 18.7795 in/min');
  });

  it('works the feed from S, not n: F ÷ S is the pitch', () => {
    // Worked from n = 318.3099 the feed would be 477.4648, a 1.5015 mm thread.
    expect(stat(tap({ vc: 10, diameter: 10 }), 'Feed')?.value).toBe('477.0000');
  });

  it('rounds an exact tie half-even: a 32-thread tap at S1001', () => {
    // 1/32 in = 0.03125, a tie, to 0.0312; 1001 / 32 = 31.28125, a tie, to 31.2812.
    const d = tap({
      units: 'inch',
      vc: 65.5,
      diameter: 0.25,
      thread: { kind: 'tpi', value: 32 },
    });
    expect(shown(d)).toEqual(['1001 rev/min', '31.2812 in/min', '0.0312 in/rev']);
  });

  it.each([
    [{ thread: { kind: 'pitch', value: 0 } }, /Enter the pitch as a number above zero/],
    [{ thread: { kind: 'tpi', value: 0 } }, /threads per inch as a number above zero/],
    [{ vc: 0.001 }, /less than 1 rev\/min/],
    [{ diameter: Number.NaN }, /Enter the tap diameter as a number above zero/],
  ] as const)('refuses %o', (over, message) => {
    expect(() => tap(over as Partial<FeedsInput>)).toThrow(message);
  });
});
