import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  boringDepthOfCut,
  chipThinning,
  chipThinningSquared,
  CM3_PER_IN3,
  cuttingDiameterAtDepth,
  cuttingSpeedToMetric,
  DEFAULT_EFFICIENCY,
  drillingMrr,
  M_PER_MIN_PER_SFM,
  removalRateFor,
  feedPerRev,
  meanChipThickness,
  millingMrr,
  netCuttingPower,
  machinePower,
  maxChipThickness,
  millingPower,
  restoringFeed,
  specificCuttingForce,
  spindleSpeed,
  tableFeed,
  tapPitch,
  tappingFeed,
  turningMrr,
} from '../../src/lib/calc/feeds-speeds';
import { inchToNm, mmToNm, roundHalfEven, nm } from '../../src/lib/calc/tap-drill';

/**
 * Fixtures for feeds and speeds.
 *
 * Unlike the tap drill module there is no published TABLE to anchor against,
 * because there is nothing here to look up — every figure is derived from
 * inputs the machinist supplies from their own tooling data. The anchor is
 * therefore the ISO 3002-1 definitions themselves, computed independently in a
 * separate script and pasted in below rather than read back out of this
 * implementation.
 *
 * That distinction matters for what these tests can prove. They prove the
 * arithmetic is right. They cannot prove a cutting speed is sensible, because
 * this module deliberately never invents one.
 */

// Independently computed. Metric: Vc 100 m/min, Dc 10 mm, fz 0.1 mm, z 4,
// ae 5 mm, ap 2 mm.
const METRIC = {
  vc: 100,
  dcMm: 10,
  fzMm: 0.1,
  teeth: 4,
  aeMm: 5,
  apMm: 2,
  rpm: 3183.0989,
  fnMm: 0.4,
  vfMm: 1273.2395,
  qCm3: 12.7324,
} as const;

describe('spindle speed', () => {
  it('matches the metric worked example', () => {
    const n = spindleSpeed(METRIC.vc, mmToNm(METRIC.dcMm), 'metric');
    expect(roundHalfEven(n, 4)).toBeCloseTo(METRIC.rpm, 3);
  });

  it('matches the inch worked example', () => {
    // Vc 300 sfm, Dc 0.5 in -> 2291.8312 rpm
    const n = spindleSpeed(300, inchToNm(0.5), 'inch');
    expect(roundHalfEven(n, 4)).toBeCloseTo(2291.8312, 3);
  });

  it('agrees across unit systems for the same physical cut', () => {
    // 100 m/min on a 10 mm cutter is the same cut expressed either way.
    const metric = spindleSpeed(100, mmToNm(10), 'metric');
    const sfm = (100 * 1000) / (12 * 25.4); // m/min -> surface feet per minute
    const inch = spindleSpeed(sfm, mmToNm(10), 'inch');
    expect(inch).toBeCloseTo(metric, 6);
  });

  it('rejects a zero diameter rather than dividing by it', () => {
    expect(() => spindleSpeed(100, nm(1_000), 'metric')).not.toThrow();
    expect(() => spindleSpeed(0, mmToNm(10), 'metric')).toThrow(RangeError);
  });
});

describe('feed', () => {
  it('reports feed per revolution and table feed from the same inputs', () => {
    const fn = feedPerRev(mmToNm(METRIC.fzMm), METRIC.teeth);
    expect(fn / 1_000_000).toBeCloseTo(METRIC.fnMm, 6);

    const vf = tableFeed(fn, METRIC.rpm);
    expect(roundHalfEven(vf / 1_000_000, 4)).toBeCloseTo(METRIC.vfMm, 3);
  });

  it('requires a whole number of teeth', () => {
    expect(() => feedPerRev(mmToNm(0.1), 2.5)).toThrow(RangeError);
    expect(() => feedPerRev(mmToNm(0.1), 0)).toThrow(RangeError);
  });
});

describe('material removal rate', () => {
  it('matches the milling worked example', () => {
    const q = millingMrr(
      mmToNm(METRIC.aeMm),
      mmToNm(METRIC.apMm),
      METRIC.vfMm * 1_000_000,
    );
    expect(roundHalfEven(q, 4)).toBeCloseTo(METRIC.qCm3, 3);
  });

  it('uses a different formula for turning, not the milling one relabelled', () => {
    // Vc 200 m/min, ap 2 mm, fn 0.25 mm/rev -> 100 cm3/min exactly.
    expect(turningMrr(200, mmToNm(2), mmToNm(0.25), 'metric')).toBeCloseTo(100, 9);
  });

  it('scales linearly in depth of cut', () => {
    const base = millingMrr(mmToNm(5), mmToNm(2), 1_000_000);
    const deeper = millingMrr(mmToNm(5), mmToNm(4), 1_000_000);
    expect(deeper).toBeCloseTo(base * 2, 9);
  });
});

describe('Kienzle specific cutting force', () => {
  it('matches the worked example', () => {
    // kc1.1 1500 N/mm2, mc 0.25, h 0.1 mm -> 2667.4191 N/mm2
    const kc = specificCuttingForce(1500, 0.25, mmToNm(0.1));
    expect(roundHalfEven(kc, 4)).toBeCloseTo(2667.4191, 3);
  });

  it('reduces to kc1.1 at a 1 mm chip', () => {
    // h = 1 mm makes h^-mc equal 1 for any mc. A good check that the exponent
    // is applied to millimetres and not to nanometres.
    expect(specificCuttingForce(1500, 0.25, mmToNm(1))).toBeCloseTo(1500, 9);
  });

  it('rises as the chip gets thinner', () => {
    const thick = specificCuttingForce(1500, 0.25, mmToNm(0.2));
    const thin = specificCuttingForce(1500, 0.25, mmToNm(0.05));
    expect(thin).toBeGreaterThan(thick);
  });

  it('rejects an mc outside [0, 1)', () => {
    expect(() => specificCuttingForce(1500, 1, mmToNm(0.1))).toThrow(RangeError);
    expect(() => specificCuttingForce(1500, -0.1, mmToNm(0.1))).toThrow(RangeError);
  });
});

describe('cutting power', () => {
  it('matches the worked example', () => {
    // ae 5, ap 2, vf 1273.2395 mm/min, kc 2667.4191, eta 0.8 -> 0.7076 kW
    const pc = millingPower(
      mmToNm(5),
      mmToNm(2),
      METRIC.vfMm * 1_000_000,
      2667.4191,
      0.8,
    );
    expect(roundHalfEven(pc, 4)).toBeCloseTo(0.7076, 3);
  });

  it('is inversely proportional to efficiency', () => {
    const a = millingPower(mmToNm(5), mmToNm(2), 1e6, 2000, 0.8);
    const b = millingPower(mmToNm(5), mmToNm(2), 1e6, 2000, 0.4);
    expect(b).toBeCloseTo(a * 2, 9);
  });

  it('defaults efficiency rather than assuming a perfect spindle', () => {
    expect(DEFAULT_EFFICIENCY).toBeLessThan(1);
    expect(DEFAULT_EFFICIENCY).toBeGreaterThan(0.5);
  });

  it('rejects an efficiency above 1', () => {
    expect(() => millingPower(mmToNm(5), mmToNm(2), 1e6, 2000, 1.2)).toThrow(RangeError);
  });
});

/**
 * The chip a milling tooth really cuts: `calculations.md` §3, "Chip thickness"
 * and "Entering angle κr".
 *
 * The tables are the spec's own golden values, computed independently in
 * Python from the formulas as printed (Sandvik Coromant's hex and fz, and
 * Kennametal US 12,202,058 B2's hm with the exact 360/π) before any Kotlin
 * existed, and computed again for this site before this module changed: all
 * agree to every digit the spec prints. Per unit feed, D the diameter the chip
 * is cut at.
 */
describe('chip thickness, square shoulder (κr 90°)', () => {
  // [ae/D, hex/fz, fz to restore / fz, hm/fz]
  it.each([
    [0.05, 0.4358898944, 2.2941573387, 0.2217163091],
    [0.1, 0.6, 1.6666666667, 0.3107997753],
    [0.2, 0.8, 1.25, 0.4313620865],
    [0.25, 0.8660254038, 1.1547005384, 0.4774648293],
    [0.5, 1, 1, 0.6366197724],
    [0.75, 1, 1, 0.7161972439],
    [1, 1, 1, 0.6366197724],
  ])('at ae/D %f: hex %f, restore %f, hm %f', (x, hex, back, hm) => {
    const D = 1_000_000;
    const fz = nm(1_000_000);
    const ae = x * D;
    expect(maxChipThickness(fz, ae, D) / fz).toBeCloseTo(hex, 10);
    expect(restoringFeed(fz, ae, D) / fz).toBeCloseTo(back, 10);
    expect(meanChipThickness(fz, ae, D) / fz).toBeCloseTo(hm, 10);
  });

  it('is the exact mean, not the √(ae/Dc) approximation this page used', () => {
    // A full slot is (2/π) fz, the textbook result. The approximation gave fz,
    // 57% thick, and a Kienzle force that left slotting power ~11% short.
    const fz = mmToNm(0.1);
    expect(meanChipThickness(fz, mmToNm(10), mmToNm(10))).toBeCloseTo(
      (2 / Math.PI) * fz,
      6,
    );
    expect(fz * Math.sqrt(1)).toBeGreaterThan(
      meanChipThickness(fz, mmToNm(10), mmToNm(10)),
    );
  });

  it('agrees with the mean of fz × sin φ over the arc the tooth cuts', () => {
    // The definition, by the midpoint rule, with no reference to either source.
    for (const x of [0.03, 0.1, 0.4, 0.6, 0.9, 1]) {
      const arc = Math.acos(1 - 2 * x);
      const steps = 20_000;
      let sum = 0;
      for (let i = 0; i < steps; i++) sum += Math.sin(((i + 0.5) * arc) / steps);
      const mean = sum / steps;
      expect(
        meanChipThickness(nm(1_000_000), x * 1_000_000, 1_000_000) / 1_000_000,
      ).toBeCloseTo(mean, 8);
    }
  });

  it('refuses a width of cut wider than the diameter', () => {
    expect(() => meanChipThickness(mmToNm(0.1), mmToNm(10.001), mmToNm(10))).toThrow(
      /cannot be more than the cutter diameter/,
    );
    expect(() => maxChipThickness(mmToNm(0.1), mmToNm(11), mmToNm(10))).toThrow(
      /two passes/,
    );
  });
});

describe('chip thickness and the entering angle', () => {
  // Per unit feed at κr 45°: [ae/D, hex/fz, restore/fz, hm/fz].
  it.each([
    [0.05, 0.3082207001, 3.2444284226, 0.1567771056],
    [0.1, 0.4242640687, 2.357022604, 0.2197686287],
    [0.2, 0.5656854249, 1.767766953, 0.3050190565],
    [0.25, 0.6123724357, 1.6329931619, 0.3376186186],
    [0.5, 0.7071067812, 1.4142135624, 0.4501581581],
    [0.75, 0.7071067812, 1.4142135624, 0.5064279278],
    [1, 0.7071067812, 1.4142135624, 0.4501581581],
  ])('at 45°, ae/D %f: hex %f, restore %f, hm %f', (x, hex, back, hm) => {
    const D = 1_000_000;
    const fz = nm(1_000_000);
    expect(maxChipThickness(fz, x * D, D, 45) / fz).toBeCloseTo(hex, 10);
    expect(restoringFeed(fz, x * D, D, 45) / fz).toBeCloseTo(back, 10);
    expect(meanChipThickness(fz, x * D, D, 45) / fz).toBeCloseTo(hm, 10);
  });

  // The spec's golden cuts. The CoroMill 345 is Sandvik's own 63 mm 45° cutter
  // (product 345-063C6-13M: DC 63.00, KAPR 45°, APMX 6.00).
  it.each([
    [
      'CoroMill 345',
      63,
      6,
      45,
      45,
      0.2,
      75,
      0.141421356237,
      0.282842712475,
      0.095762334298,
    ],
    ['side mill', 50, 3, 45, 10, 0.2, 56, 0.108326792058, 0.369253065102, 0.057883498375],
    [
      'high feed',
      32,
      1,
      10,
      20,
      1.0,
      43.342563639235,
      0.1731310264,
      5.775972226303,
      0.107295452319,
    ],
  ])(
    '%s: Dcap, hex, restore and hm',
    (_name, dc, ap, kr, ae, fz, dcap, hex, back, hm) => {
      const D = cuttingDiameterAtDepth(mmToNm(dc), mmToNm(ap), kr);
      expect(D / 1_000_000).toBeCloseTo(dcap, 9);
      expect(maxChipThickness(mmToNm(fz), mmToNm(ae), D, kr) / 1_000_000).toBeCloseTo(
        hex,
        11,
      );
      expect(restoringFeed(mmToNm(fz), mmToNm(ae), D, kr) / 1_000_000).toBeCloseTo(
        back,
        11,
      );
      expect(meanChipThickness(mmToNm(fz), mmToNm(ae), D, kr) / 1_000_000).toBeCloseTo(
        hm,
        11,
      );
    },
  );

  it('turns the CoroMill 345 at 1061 rev/min at Dcap, not 1263 at its tip', () => {
    // Vc 250 at 6 mm deep: worked at 63 mm the outer edge would run 19% fast.
    const D = cuttingDiameterAtDepth(mmToNm(63), mmToNm(6), 45);
    expect(spindleSpeed(250, D as ReturnType<typeof mmToNm>, 'metric')).toBeCloseTo(
      1061.032953946,
      8,
    );
    expect(spindleSpeed(250, mmToNm(63), 'metric')).toBeCloseTo(1263.1344689833, 8);
  });

  it('is Dc exactly at 90°, whatever the depth', () => {
    expect(cuttingDiameterAtDepth(mmToNm(10), mmToNm(30), 90)).toBe(mmToNm(10));
  });

  it('reads a 0° as the lead angle it almost certainly is', () => {
    // An American lead angle is measured from the axis: a square shoulder is
    // 0° lead and 90° entering. The app's refusal says the same.
    expect(() => cuttingDiameterAtDepth(mmToNm(10), mmToNm(2), 0)).toThrow(
      /lead angle of 0°/,
    );
  });

  it.each([-5, 90.0001, 135, Number.NaN, Infinity])(
    'refuses an entering angle of %f',
    (kr) => {
      expect(() => cuttingDiameterAtDepth(mmToNm(10), mmToNm(2), kr)).toThrow(
        /more than 0° and no more than 90°/,
      );
      expect(() => chipThinning(mmToNm(1), mmToNm(10), kr)).toThrow(/entering angle/);
    },
  );
});

describe('invariants across the whole domain', () => {
  const dc = fc.integer({ min: 500, max: 100_000 }).map((n) => nm(n));
  const fz = fc.integer({ min: 5, max: 1_000 }).map((n) => nm(n));
  const vc = fc.double({ min: 1, max: 1_000, noNaN: true, noDefaultInfinity: true });
  const teeth = fc.integer({ min: 1, max: 12 });

  it('rpm falls as the cutter gets bigger', () => {
    fc.assert(
      fc.property(vc, dc, fc.integer({ min: 100, max: 50_000 }), (v, d, extra) => {
        const bigger = nm(d + extra);
        expect(spindleSpeed(v, bigger, 'metric')).toBeLessThan(
          spindleSpeed(v, d, 'metric'),
        );
      }),
      { numRuns: 300 },
    );
  });

  it('table feed rises with tooth count', () => {
    fc.assert(
      fc.property(fz, teeth, vc, dc, (f, z, v, d) => {
        const rpm = spindleSpeed(v, d, 'metric');
        const one = tableFeed(feedPerRev(f, z), rpm);
        const two = tableFeed(feedPerRev(f, z + 1), rpm);
        expect(two).toBeGreaterThan(one);
      }),
      { numRuns: 300 },
    );
  });

  it('never emits NaN or a negative rate for valid input', () => {
    fc.assert(
      fc.property(vc, dc, fz, teeth, (v, d, f, z) => {
        const rpm = spindleSpeed(v, d, 'metric');
        const vf = tableFeed(feedPerRev(f, z), rpm);
        const q = millingMrr(nm(Math.max(1, Math.floor(d / 2))), nm(1_000_000), vf);
        for (const value of [rpm, vf, q]) {
          expect(Number.isFinite(value)).toBe(true);
          expect(value).toBeGreaterThan(0);
        }
      }),
      { numRuns: 400 },
    );
  });

  it('a mean chip is never thicker than the maximum, nor that than fz × sin κr', () => {
    // hm is the mean of the chip whose largest value is hex, over the arc the
    // tooth cuts, so 0 < hm ≤ hex ≤ fz × sin κr at any width up to the diameter.
    fc.assert(
      fc.property(
        fz,
        dc,
        fc.double({ min: 0.001, max: 1, noNaN: true }),
        fc.double({ min: 1, max: 90, noNaN: true }),
        (f, d, share, kr) => {
          const ae = share * d;
          const hm = meanChipThickness(f, ae, d, kr);
          const hex = maxChipThickness(f, ae, d, kr);
          expect(hm).toBeGreaterThan(0);
          expect(hm).toBeLessThanOrEqual(hex * (1 + 1e-12));
          expect(hex).toBeLessThanOrEqual(
            f * Math.sin((kr * Math.PI) / 180) * (1 + 1e-12),
          );
          // The restoring feed undoes the thinning exactly.
          expect(restoringFeed(f, ae, d, kr) * (hex / f)).toBeCloseTo(f, 6);
        },
      ),
      { numRuns: 400 },
    );
  });
});

/**
 * Drilling and boring — the two operations §3 requires and the page lacked.
 *
 * Independently computed from the ISO 3002-1 definitions, as the fixtures above
 * are. DRILLING Vc 80 m/min, Dc 10 mm, fn 0.2 mm/rev: n = 2546.4791, vf =
 * 509.2958, Q = 40. BORING Vc 150 m/min, 20 -> 24 mm, fn 0.15: ap = 2,
 * n = 1989.4368, Q = 45.
 */
describe('drilling', () => {
  it('matches the worked example', () => {
    const q = drillingMrr(80, mmToNm(10), mmToNm(0.2), 'metric');
    expect(roundHalfEven(q, 4)).toBeCloseTo(40, 3);
  });

  /**
   * The closed form must equal the geometry it came from. `Q = Dc x fn x Vc/4`
   * is an algebraic simplification of the swept cylinder; asserting them
   * against each other is what stops the shortcut becoming an approximation
   * nobody rechecks.
   */
  it('agrees with the swept cylinder it was derived from', () => {
    for (const dcMm of [3, 6.8, 10, 12.7, 25]) {
      for (const fnMm of [0.05, 0.2, 0.35]) {
        const vc = 80;
        const closed = drillingMrr(vc, mmToNm(dcMm), mmToNm(fnMm), 'metric');
        const rpm = spindleSpeed(vc, mmToNm(dcMm), 'metric');
        const vfMm = fnMm * rpm;
        const cylinder = ((Math.PI * dcMm * dcMm) / 4) * (vfMm / 1000);
        expect(closed).toBeCloseTo(cylinder, 9);
      }
    }
  });

  /**
   * D74, pinned. The page used to tell users drilling "reduces to the turning
   * arithmetic". It does — but only at ap = Dc/4, which nothing said. These are
   * the numbers a user following that advice would have got.
   */
  it('is only equal to turning at a depth of cut of Dc/4', () => {
    const vc = 80;
    const dcMm = 10;
    const fnMm = 0.2;
    const truth = drillingMrr(vc, mmToNm(dcMm), mmToNm(fnMm), 'metric');

    expect(turningMrr(vc, mmToNm(dcMm / 4), mmToNm(fnMm), 'metric')).toBeCloseTo(
      truth,
      9,
    );
    expect(turningMrr(vc, mmToNm(dcMm / 2), mmToNm(fnMm), 'metric')).toBeCloseTo(
      truth * 2,
      9,
    );
    expect(turningMrr(vc, mmToNm(dcMm), mmToNm(fnMm), 'metric')).toBeCloseTo(
      truth * 4,
      9,
    );
  });

  it('rejects a zero or negative input', () => {
    expect(() => drillingMrr(0, mmToNm(10), mmToNm(0.2), 'metric')).toThrow(RangeError);
    expect(() => drillingMrr(80, mmToNm(10), 0, 'metric')).toThrow(RangeError);
  });
});

describe('boring', () => {
  it('derives the depth of cut from the two diameters', () => {
    expect(boringDepthOfCut(mmToNm(20), mmToNm(24))).toBe(mmToNm(2));
  });

  it('matches the worked example, using the turning removal rate', () => {
    const ap = boringDepthOfCut(mmToNm(20), mmToNm(24));
    expect(roundHalfEven(turningMrr(150, ap, mmToNm(0.15), 'metric'), 4)).toBeCloseTo(
      45,
      3,
    );
  });

  /**
   * The trap the two-diameter input exists to close: 20 -> 24 mm is a 4 mm
   * diameter change and a 2 mm depth of cut. A user asked for "depth" who types
   * the diameter change doubles everything downstream.
   */
  it('is half the diameter change, not the diameter change', () => {
    const derived = boringDepthOfCut(mmToNm(20), mmToNm(24));
    const naive = mmToNm(4);
    expect(turningMrr(150, naive, mmToNm(0.15), 'metric')).toBeCloseTo(
      turningMrr(150, derived, mmToNm(0.15), 'metric') * 2,
      9,
    );
  });

  it('refuses a pass that does not enlarge the hole', () => {
    expect(() => boringDepthOfCut(mmToNm(24), mmToNm(24))).toThrow(RangeError);
    expect(() => boringDepthOfCut(mmToNm(24), mmToNm(20))).toThrow(RangeError);
  });
});

/**
 * D75: power must come from the removal rate the operation actually has.
 *
 * `renderPower` used to hand ae, ap and vf to `millingPower`, which recomputes
 * the MILLING removal rate from them. Turning passed Dc as ae, so its power was
 * computed from `Dc x ap x vf / 1000` instead of `Vc x ap x fn` — understating
 * it by exactly pi, on the figure a machinist checks against spindle rating.
 */
describe('cutting power comes from the removal rate, whatever produced it', () => {
  const kc = specificCuttingForce(1500, 0.25, mmToNm(0.25));
  const eta = 0.8;

  it('milling is unchanged: the shaped entry point agrees with the general one', () => {
    const q = millingMrr(mmToNm(5), mmToNm(2), mmToNm(1273.2395));
    expect(millingPower(mmToNm(5), mmToNm(2), mmToNm(1273.2395), kc, eta)).toBeCloseTo(
      machinePower(netCuttingPower(q, kc), eta),
      12,
    );
  });

  it('turning power is pi times what the milling form gave it', () => {
    const vc = 200;
    const dcNm = mmToNm(50);
    const apNm = mmToNm(2);
    const fnNm = mmToNm(0.25);
    const rpm = spindleSpeed(vc, dcNm, 'metric');
    const vfNm = tableFeed(fnNm, rpm);

    const correct = machinePower(
      netCuttingPower(turningMrr(vc, apNm, fnNm, 'metric'), kc),
      eta,
    );
    const oldWay = millingPower(dcNm, apNm, vfNm, kc, eta); // Dc passed as ae

    expect(correct / oldWay).toBeCloseTo(Math.PI, 6);
    expect(correct).toBeGreaterThan(oldWay);
  });

  it('rejects a zero or negative removal rate', () => {
    expect(() => machinePower(netCuttingPower(0, kc), eta)).toThrow(RangeError);
    expect(() => machinePower(netCuttingPower(10, kc), 1.2)).toThrow(RangeError);
  });
});

/**
 * Inch mode, which is where this module was wrong.
 *
 * The page displayed a removal rate 16.387064x too high for milling and
 * 53.7633x too high for turning, boring and drilling, for as long as inch mode
 * has existed. Two independent errors compounded:
 *
 *   1. Every MRR function normalises Nanometres to MILLIMETRES and returns
 *      cm3/min. The page chose an 'in3/min' LABEL for inch mode and printed the
 *      unconverted number beside it.
 *   2. turningMrr and drillingMrr take Vc in m/min. The page handed them the
 *      surface-feet-per-minute figure the user typed.
 *
 * Together: 25.4^2 / 12 = 53.7633. The first alone: 16.387064.
 *
 * Nothing caught it because the arithmetic was never wrong -- the CONVERSIONS
 * were, and they lived in the page rather than in a tested function. Which is
 * the same shape as D72, and the reason these now live here.
 *
 * Expected values are derived from the definitions, not from this module:
 *   1 in = 25.4 mm and 1 ft = 0.3048 m EXACTLY -- international yard and pound
 *   agreement, 1959. So 1 in3 = 25.4^3 mm3 = 16.387064 cm3, and one surface
 *   foot per minute is 0.3048 m/min.
 */
describe('inch units', () => {
  it('holds the two exact 1959 conversion constants', () => {
    expect(CM3_PER_IN3).toBe(16.387064);
    expect(CM3_PER_IN3).toBeCloseTo(2.54 ** 3, 12);
    expect(M_PER_MIN_PER_SFM).toBe(0.3048);
  });

  it('converts surface feet per minute to metres per minute, and leaves metric alone', () => {
    expect(cuttingSpeedToMetric(100, 'metric')).toBe(100);
    // 400 sfm x 0.3048 = 121.92 m/min.
    expect(cuttingSpeedToMetric(400, 'inch')).toBeCloseTo(121.92, 12);
  });

  it('never hands back a unit its value is not in', () => {
    const metric = removalRateFor(100, 'metric');
    expect(metric).toEqual({ value: 100, unit: 'cm³/min' });

    const inch = removalRateFor(100, 'inch');
    expect(inch.unit).toBe('in³/min');
    expect(inch.value).toBeCloseTo(100 / 16.387064, 12);
    // The defect stated as an assertion: an in3/min label beside an
    // unconverted cm3/min number.
    expect(inch.value).not.toBeCloseTo(100, 6);
  });

  /**
   * The three end-to-end values, each derived by hand in inch units.
   *
   * Turning:  Vc 400 sfm = 4800 in/min; Q = 4800 x 0.100 x 0.010 = 4.8 in3/min
   * Drilling: Vc 300 sfm = 3600 in/min; Q = 0.375 x 0.006 x 3600 / 4
   *                                        = 2.025 in3/min
   * Milling:  Q = ae x ap x vf = 0.25 x 0.100 x 24.4462 = 0.611155 in3/min
   */
  it('turning in inch units gives the inch answer, not 53.7633x it', () => {
    const cm3 = turningMrr(400, inchToNm(0.1), inchToNm(0.01), 'inch');
    const shown = removalRateFor(cm3, 'inch');
    expect(shown.value).toBeCloseTo(4.8, 9);
    expect(shown.unit).toBe('in³/min');
    // The old behaviour, named so a regression is unmistakable.
    expect(shown.value).not.toBeCloseTo(4.8 * (25.4 ** 2 / 12), 6);
  });

  it('drilling in inch units gives the inch answer', () => {
    const cm3 = drillingMrr(300, inchToNm(0.375), inchToNm(0.006), 'inch');
    expect(removalRateFor(cm3, 'inch').value).toBeCloseTo(2.025, 9);
  });

  it('milling in inch units gives the inch answer, not 16.387064x it', () => {
    // millingMrr takes no cutting speed, so only the display conversion was
    // ever wrong for milling -- which is why its factor is the smaller one.
    const cm3 = millingMrr(inchToNm(0.25), inchToNm(0.1), inchToNm(24.4462));
    const shown = removalRateFor(cm3, 'inch');
    expect(shown.value).toBeCloseTo(0.611155, 9);
    expect(cm3).toBeCloseTo(0.611155 * 16.387064, 9);
  });

  /**
   * The metric path must not have moved. Every expected value here predates the
   * change and is asserted elsewhere in this file too.
   */
  it('leaves every metric answer exactly where it was', () => {
    expect(turningMrr(200, mmToNm(2), mmToNm(0.25), 'metric')).toBeCloseTo(100, 9);
    expect(drillingMrr(80, mmToNm(10), mmToNm(0.2), 'metric')).toBeCloseTo(40, 9);
    expect(removalRateFor(40, 'metric').value).toBe(40);
  });

  /**
   * Turning and drilling agree with each other in inch mode exactly as they do
   * in metric: a drill IS turning at ap = Dc/4 (D74), and that identity must
   * not depend on which unit the user typed.
   */
  it('keeps the drilling-is-turning-at-Dc/4 identity in inch units', () => {
    const vc = 250;
    const dc = inchToNm(0.5);
    const fn = inchToNm(0.008);
    const drill = drillingMrr(vc, dc, fn, 'inch');
    const turn = turningMrr(vc, nm(Math.round(dc / 4)), fn, 'inch');
    expect(drill).toBeCloseTo(turn, 12);
  });
});

/**
 * Net cutting power and machine power are two quantities.
 *
 * calculations.md section 3 wrote `Pc = ... / (60 x 10^6 x eta)` under the
 * heading "Net cutting power", and the heading was wrong for the expression:
 * eta describes losses between the motor and the cut, so a term dividing by it
 * cannot belong to a quantity measured AT the tool. Sandvik Coromant computes
 * required machine power in two steps for exactly this reason -- net power at
 * the cutter, then the efficiency factor.
 *
 *   Pc = Q x kc / 60000      net, at the cutting edge
 *   Pm = Pc / eta            required at the machine
 *
 * Source: Sandvik Coromant milling formulas and definitions, which defines net
 * power Pc as the power at the cutter, and describes required machine power as
 * a second step through the machine efficiency factor.
 * https://www.sandvik.coromant.com/en-us/knowledge/machining-formulas-definitions/milling-formulas-definitions
 *
 * This mattered because the site showed Pm under the words "Net cutting power"
 * while the Kotlin app showed Pc under the same words -- 25% apart at eta 0.8.
 */
describe('net cutting power versus machine power', () => {
  // Q 12.7324 cm3/min, kc 2667.4191 N/mm2 -> Pc = 12.7324 x 2667.4191 / 60000
  const Q = METRIC.qCm3;
  const KC = 2667.4191;

  it('computes net power at the cutting edge, with no efficiency term', () => {
    expect(netCuttingPower(Q, KC)).toBeCloseTo((Q * KC) / 60_000, 12);
    // Independently: 12.7324 x 2667.4191 = 33962.06..., / 60000 = 0.566034...
    expect(roundHalfEven(netCuttingPower(Q, KC), 4)).toBeCloseTo(0.566, 3);
  });

  it('is unchanged by efficiency, because efficiency is not in it', () => {
    // The assertion that would have caught the mislabelling: nothing about the
    // machine may move the figure describing the cut.
    const a = netCuttingPower(Q, KC);
    const b = netCuttingPower(Q, KC);
    expect(a).toBe(b);
    expect(machinePower(a, 1)).toBeCloseTo(a, 12);
  });

  it('derives machine power as Pc / eta, and they differ by 25% at eta 0.8', () => {
    const pc = netCuttingPower(Q, KC);
    const pm = machinePower(pc, 0.8);
    expect(pm).toBeCloseTo(pc / 0.8, 12);
    expect(pm / pc).toBeCloseTo(1.25, 12);
    expect(pm).toBeGreaterThan(pc);
  });

  it('keeps millingPower as the machine figure it always was', () => {
    // The existing worked example: 0.7076 kW at eta 0.8. It must not have moved
    // -- this change splits a figure in two, it does not restate an old one.
    const viaSplit = machinePower(
      netCuttingPower(millingMrr(mmToNm(5), mmToNm(2), METRIC.vfMm * 1_000_000), KC),
      0.8,
    );
    expect(roundHalfEven(viaSplit, 4)).toBeCloseTo(0.7076, 3);
    expect(
      roundHalfEven(
        millingPower(mmToNm(5), mmToNm(2), METRIC.vfMm * 1_000_000, KC, 0.8),
        4,
      ),
    ).toBeCloseTo(0.7076, 3);
  });

  it('still refuses an impossible efficiency, now on the function that uses it', () => {
    expect(() => machinePower(1, 0)).toThrow(RangeError);
    expect(() => machinePower(1, 1.2)).toThrow(RangeError);
    expect(() => machinePower(1, -0.5)).toThrow(RangeError);
    expect(() => netCuttingPower(0, KC)).toThrow(RangeError);
  });
});

/**
 * Inch mode, which is where this module was wrong.
 *
 * The page displayed a removal rate 16.387064x too high for milling and
 * 53.7633x too high for turning, boring and drilling, for as long as inch mode
 * has existed. Two independent errors compounded:
 *
 *   1. Every MRR function normalises Nanometres to MILLIMETRES and returns
 *      cm3/min. The page chose an 'in3/min' LABEL for inch mode and printed the
 *      unconverted number beside it.
 *   2. turningMrr and drillingMrr take Vc in m/min. The page handed them the
 *      surface-feet-per-minute figure the user typed.
 *
 * Together: 25.4^2 / 12 = 53.7633. The first alone: 16.387064.
 *
 * Nothing caught it because the arithmetic was never wrong -- the CONVERSIONS
 * were, and they lived in the page rather than in a tested function. Which is
 * the same shape as D72, and the reason these now live here.
 *
 * Expected values are derived from the definitions, not from this module:
 *   1 in = 25.4 mm and 1 ft = 0.3048 m EXACTLY -- international yard and pound
 *   agreement, 1959. So 1 in3 = 25.4^3 mm3 = 16.387064 cm3, and one surface
 *   foot per minute is 0.3048 m/min.
 */
describe('inch units', () => {
  it('holds the two exact 1959 conversion constants', () => {
    expect(CM3_PER_IN3).toBe(16.387064);
    expect(CM3_PER_IN3).toBeCloseTo(2.54 ** 3, 12);
    expect(M_PER_MIN_PER_SFM).toBe(0.3048);
  });

  it('converts surface feet per minute to metres per minute, and leaves metric alone', () => {
    expect(cuttingSpeedToMetric(100, 'metric')).toBe(100);
    // 400 sfm x 0.3048 = 121.92 m/min.
    expect(cuttingSpeedToMetric(400, 'inch')).toBeCloseTo(121.92, 12);
  });

  it('never hands back a unit its value is not in', () => {
    const metric = removalRateFor(100, 'metric');
    expect(metric).toEqual({ value: 100, unit: 'cm³/min' });

    const inch = removalRateFor(100, 'inch');
    expect(inch.unit).toBe('in³/min');
    expect(inch.value).toBeCloseTo(100 / 16.387064, 12);
    // The defect stated as an assertion: an in3/min label beside an
    // unconverted cm3/min number.
    expect(inch.value).not.toBeCloseTo(100, 6);
  });

  /**
   * The three end-to-end values, each derived by hand in inch units.
   *
   * Turning:  Vc 400 sfm = 4800 in/min; Q = 4800 x 0.100 x 0.010 = 4.8 in3/min
   * Drilling: Vc 300 sfm = 3600 in/min; Q = 0.375 x 0.006 x 3600 / 4
   *                                        = 2.025 in3/min
   * Milling:  Q = ae x ap x vf = 0.25 x 0.100 x 24.4462 = 0.611155 in3/min
   */
  it('turning in inch units gives the inch answer, not 53.7633x it', () => {
    const cm3 = turningMrr(400, inchToNm(0.1), inchToNm(0.01), 'inch');
    const shown = removalRateFor(cm3, 'inch');
    expect(shown.value).toBeCloseTo(4.8, 9);
    expect(shown.unit).toBe('in³/min');
    // The old behaviour, named so a regression is unmistakable.
    expect(shown.value).not.toBeCloseTo(4.8 * (25.4 ** 2 / 12), 6);
  });

  it('drilling in inch units gives the inch answer', () => {
    const cm3 = drillingMrr(300, inchToNm(0.375), inchToNm(0.006), 'inch');
    expect(removalRateFor(cm3, 'inch').value).toBeCloseTo(2.025, 9);
  });

  it('milling in inch units gives the inch answer, not 16.387064x it', () => {
    // millingMrr takes no cutting speed, so only the display conversion was
    // ever wrong for milling -- which is why its factor is the smaller one.
    const cm3 = millingMrr(inchToNm(0.25), inchToNm(0.1), inchToNm(24.4462));
    const shown = removalRateFor(cm3, 'inch');
    expect(shown.value).toBeCloseTo(0.611155, 9);
    expect(cm3).toBeCloseTo(0.611155 * 16.387064, 9);
  });

  /**
   * The metric path must not have moved. Every expected value here predates the
   * change and is asserted elsewhere in this file too.
   */
  it('leaves every metric answer exactly where it was', () => {
    expect(turningMrr(200, mmToNm(2), mmToNm(0.25), 'metric')).toBeCloseTo(100, 9);
    expect(drillingMrr(80, mmToNm(10), mmToNm(0.2), 'metric')).toBeCloseTo(40, 9);
    expect(removalRateFor(40, 'metric').value).toBe(40);
  });

  /**
   * Turning and drilling agree with each other in inch mode exactly as they do
   * in metric: a drill IS turning at ap = Dc/4 (D74), and that identity must
   * not depend on which unit the user typed.
   */
  it('keeps the drilling-is-turning-at-Dc/4 identity in inch units', () => {
    const vc = 250;
    const dc = inchToNm(0.5);
    const fn = inchToNm(0.008);
    const drill = drillingMrr(vc, dc, fn, 'inch');
    const turn = turningMrr(vc, nm(Math.round(dc / 4)), fn, 'inch');
    expect(drill).toBeCloseTo(turn, 12);
  });
});

/**
 * Sandvik Coromant, "Entering angle and chip thickness in milling" (retrieved
 * 2026-10-06, https://www.sandvik.coromant.com/en-us/knowledge/milling/entering-angle-and-chip-thickness):
 * the feed per tooth for a maximum chip of 0.1, 0.15 and 0.2 mm at five
 * entering angles, printed to two places, with the modification factors
 * 1.0, 1.0, 1.1, 1.4 and 5.8. The rule-3 published check for the restoring
 * feed: fz = hex / sin κr gives every printed figure.
 */
describe("Sandvik's entering-angle table", () => {
  it.each([
    [90, 1.0, [0.1, 0.15, 0.2]],
    [75, 1.0, [0.1, 0.16, 0.21]],
    [65, 1.1, [0.11, 0.17, 0.22]],
    [45, 1.4, [0.14, 0.21, 0.28]],
    [10, 5.8, [0.58, 0.86, 1.15]],
  ] as const)('at %i°, factor %f: %o', (kr, factor, printed) => {
    [0.1, 0.15, 0.2].forEach((hex, i) => {
      // A full-width cut, so only the entering angle thins the chip, and the
      // data sheet's feed is read as the chip it means.
      const fz = restoringFeed(mmToNm(hex), mmToNm(10), mmToNm(10), kr) / 1_000_000;
      expect(roundHalfEven(fz, 2)).toBe(printed[i]);
    });
    expect(roundHalfEven(1 / chipThinning(mmToNm(10), mmToNm(10), kr), 1)).toBe(factor);
  });
});

describe('the thinning as an exact fraction, where one exists', () => {
  const ratio = (r: { num: bigint; den: bigint } | null) =>
    r === null ? null : [r.num, r.den];
  const same = (r: { num: bigint; den: bigint } | null, num: bigint, den: bigint) =>
    r !== null && r.num * den === num * r.den;

  it('is (2√(ae(D − ae))/D)² at a square shoulder: 0.36 at a tenth of the diameter', () => {
    expect(same(chipThinningSquared(1_000_000, 10_000_000, 90), 36n, 100n)).toBe(true);
  });

  it('carries sin² 45° = 1/2 and the exact Dcap: 16/81 for ae 10 on Dcap 90', () => {
    expect(same(chipThinningSquared(10_000_000, 90_000_000, 45), 16n, 81n)).toBe(true);
    // tan 45° is 1 exactly: 50 + 2 × 20 = 90 mm, not 90 plus float noise.
    expect(cuttingDiameterAtDepth(mmToNm(50), mmToNm(20), 45)).toBe(90_000_000);
  });

  it('makes Dcap at 45° a whole number of nanometres at every depth', () => {
    // Math.tan(π/4) is 0.9999999999999999: Dc 1, ap 1.1 would come to
    // 3 200 000.0000000005 nm, and a fractional Dcap loses the exact tie rule.
    for (let dc = 1; dc <= 60; dc++) {
      for (let ap10 = 1; ap10 <= 200; ap10++) {
        const D = cuttingDiameterAtDepth(mmToNm(dc), nm(ap10 * 100_000), 45);
        expect(D).toBe(dc * 1_000_000 + 2 * ap10 * 100_000);
      }
    }
  });

  it('is sin² κr alone at full width, wherever that is rational', () => {
    expect(same(chipThinningSquared(10_000_000, 13_464_101.6, 30), 1n, 4n)).toBe(true);
    expect(same(chipThinningSquared(10_000_000, 13_464_101.6, 60), 3n, 4n)).toBe(true);
  });

  it('is null where sin² κr or Dcap is irrational', () => {
    expect(ratio(chipThinningSquared(1_000_000, 10_000_000, 10))).toBeNull();
    expect(ratio(chipThinningSquared(1_000_000, 13_464_101.6, 30))).toBeNull();
    expect(ratio(chipThinningSquared(1_000_000, 10_000_000.5, 90))).toBeNull();
  });
});

/**
 * Tapping. Haas Automation, "G84 Tapping Canned Cycle (Group 09)", AP-602 X1,
 * April 2016 (retrieved 2026-10-06,
 * https://www.haascnc.com/content/dam/haascnc/videos/bonus-content/ep25-tap-programming/Haas_G84_Tapping.pdf):
 * two taps at S500 in both modes — 1/2-13 is F976.923 mm/min and F38.4615
 * in/min, M12 × 1.75 is F875.000 and F34.4488. The rule-3 published check.
 */
describe('tapping: the feed is the pitch', () => {
  const perMin = (r: { num: number; den: number }, nmPer: number) =>
    r.num / r.den / nmPer;

  it("matches Haas's worked examples at S500, in both modes", () => {
    const half13 = tappingFeed(500, { kind: 'tpi', tpi: 13 });
    expect(roundHalfEven(perMin(half13, 1e6), 3)).toBe(976.923);
    expect(roundHalfEven(perMin(half13, 25.4e6), 4)).toBe(38.4615);
    const m12 = tappingFeed(500, { kind: 'pitch', pitchNm: mmToNm(1.75) });
    expect(perMin(m12, 1e6)).toBe(875);
    expect(roundHalfEven(perMin(m12, 25.4e6), 4)).toBe(34.4488);
  });

  it("gives a 3/4-10 at S200 508 mm/min, 20 in/min (the spec's golden table)", () => {
    // calculations.md §3, worked in Python with decimal arithmetic; the spec
    // attributes "20." to Haas, whose figure this site did not find in the
    // guide's text, so it is cited to the spec here.
    const f = tappingFeed(200, { kind: 'tpi', tpi: 10 });
    expect(perMin(f, 1e6)).toBe(508);
    expect(perMin(f, 25.4e6)).toBe(20);
  });

  it("keeps an inch tap's count: 1/13 in stays 25 400 000 / 13 nm", () => {
    expect(tapPitch({ kind: 'tpi', tpi: 13 })).toEqual({ num: 25_400_000, den: 13 });
    // The pipe taps' 11.5 threads per inch, exactly.
    expect(tapPitch({ kind: 'tpi', tpi: 11.5 })).toEqual({ num: 254_000_000, den: 115 });
    expect(tapPitch({ kind: 'pitch', pitchNm: mmToNm(1.5) })).toEqual({
      num: 1_500_000,
      den: 1,
    });
  });

  it('is worked from the whole S, so F ÷ S is the pitch exactly', () => {
    const f = tappingFeed(318, { kind: 'pitch', pitchNm: mmToNm(1.5) });
    expect(f.num / f.den / 318).toBe(1_500_000);
  });

  it.each([
    [() => tapPitch({ kind: 'tpi', tpi: 0 }), /threads per inch as a number above zero/],
    [() => tapPitch({ kind: 'tpi', tpi: Number.NaN }), /threads per inch/],
    [() => tapPitch({ kind: 'tpi', tpi: 13.12345 }), /more than three decimals/],
    [() => tappingFeed(318.5, { kind: 'tpi', tpi: 20 }), /whole number of rev\/min/],
    [() => tappingFeed(0, { kind: 'tpi', tpi: 20 }), /whole number of rev\/min/],
  ])('refuses %#', (f, message) => {
    expect(f).toThrow(message);
  });
});
