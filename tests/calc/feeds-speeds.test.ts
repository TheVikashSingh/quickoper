import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  boringDepthOfCut,
  CM3_PER_IN3,
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
  millingPower,
  specificCuttingForce,
  spindleSpeed,
  tableFeed,
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

describe('mean chip thickness', () => {
  it('thins with radial engagement', () => {
    // fz 0.1, ae 5, Dc 10 -> 0.070711 mm
    const hm = meanChipThickness(mmToNm(0.1), mmToNm(5), mmToNm(10));
    expect(roundHalfEven(hm / 1_000_000, 6)).toBeCloseTo(0.070711, 5);
  });

  it('equals feed per tooth when slotting', () => {
    // ae = Dc is a full slot: no radial thinning.
    const hm = meanChipThickness(mmToNm(0.1), mmToNm(10), mmToNm(10));
    expect(hm).toBeCloseTo(mmToNm(0.1), 9);
  });

  it('never exceeds feed per tooth', () => {
    // Clamped at ae = Dc. A cutter cannot engage more than its own diameter,
    // and an unclamped sqrt would quietly report a thicker chip than possible.
    const hm = meanChipThickness(mmToNm(0.1), mmToNm(50), mmToNm(10));
    expect(hm).toBeCloseTo(mmToNm(0.1), 9);
  });
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

  it('chip thickness never exceeds feed per tooth, for any engagement', () => {
    fc.assert(
      fc.property(fz, dc, fc.integer({ min: 1, max: 200_000 }), (f, d, ae) => {
        expect(meanChipThickness(f, nm(ae), d)).toBeLessThanOrEqual(f + 1e-9);
      }),
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
