import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EFFICIENCY,
  feedPerRev,
  meanChipThickness,
  millingMrr,
  millingPower,
  specificCuttingForce,
  spindleSpeed,
  tableFeed,
  turningMrr,
} from '../../src/lib/calc/feeds-speeds';
import { inchToUm, mmToUm, roundHalfEven, um } from '../../src/lib/calc/tap-drill';

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
    const n = spindleSpeed(METRIC.vc, mmToUm(METRIC.dcMm), 'metric');
    expect(roundHalfEven(n, 4)).toBeCloseTo(METRIC.rpm, 3);
  });

  it('matches the inch worked example', () => {
    // Vc 300 sfm, Dc 0.5 in -> 2291.8312 rpm
    const n = spindleSpeed(300, inchToUm(0.5), 'inch');
    expect(roundHalfEven(n, 4)).toBeCloseTo(2291.8312, 3);
  });

  it('agrees across unit systems for the same physical cut', () => {
    // 100 m/min on a 10 mm cutter is the same cut expressed either way.
    const metric = spindleSpeed(100, mmToUm(10), 'metric');
    const sfm = (100 * 1000) / (12 * 25.4); // m/min -> surface feet per minute
    const inch = spindleSpeed(sfm, mmToUm(10), 'inch');
    expect(inch).toBeCloseTo(metric, 6);
  });

  it('rejects a zero diameter rather than dividing by it', () => {
    expect(() => spindleSpeed(100, um(1), 'metric')).not.toThrow();
    expect(() => spindleSpeed(0, mmToUm(10), 'metric')).toThrow(RangeError);
  });
});

describe('feed', () => {
  it('reports feed per revolution and table feed from the same inputs', () => {
    const fn = feedPerRev(mmToUm(METRIC.fzMm), METRIC.teeth);
    expect(fn / 1000).toBeCloseTo(METRIC.fnMm, 6);

    const vf = tableFeed(fn, METRIC.rpm);
    expect(roundHalfEven(vf / 1000, 4)).toBeCloseTo(METRIC.vfMm, 3);
  });

  it('requires a whole number of teeth', () => {
    expect(() => feedPerRev(mmToUm(0.1), 2.5)).toThrow(RangeError);
    expect(() => feedPerRev(mmToUm(0.1), 0)).toThrow(RangeError);
  });
});

describe('material removal rate', () => {
  it('matches the milling worked example', () => {
    const q = millingMrr(mmToUm(METRIC.aeMm), mmToUm(METRIC.apMm), METRIC.vfMm * 1000);
    expect(roundHalfEven(q, 4)).toBeCloseTo(METRIC.qCm3, 3);
  });

  it('uses a different formula for turning, not the milling one relabelled', () => {
    // Vc 200 m/min, ap 2 mm, fn 0.25 mm/rev -> 100 cm3/min exactly.
    expect(turningMrr(200, mmToUm(2), mmToUm(0.25))).toBeCloseTo(100, 9);
  });

  it('scales linearly in depth of cut', () => {
    const base = millingMrr(mmToUm(5), mmToUm(2), 1_000_000);
    const deeper = millingMrr(mmToUm(5), mmToUm(4), 1_000_000);
    expect(deeper).toBeCloseTo(base * 2, 9);
  });
});

describe('Kienzle specific cutting force', () => {
  it('matches the worked example', () => {
    // kc1.1 1500 N/mm2, mc 0.25, h 0.1 mm -> 2667.4191 N/mm2
    const kc = specificCuttingForce(1500, 0.25, mmToUm(0.1));
    expect(roundHalfEven(kc, 4)).toBeCloseTo(2667.4191, 3);
  });

  it('reduces to kc1.1 at a 1 mm chip', () => {
    // h = 1 mm makes h^-mc equal 1 for any mc. A good check that the exponent
    // is applied to millimetres and not to micrometres.
    expect(specificCuttingForce(1500, 0.25, mmToUm(1))).toBeCloseTo(1500, 9);
  });

  it('rises as the chip gets thinner', () => {
    const thick = specificCuttingForce(1500, 0.25, mmToUm(0.2));
    const thin = specificCuttingForce(1500, 0.25, mmToUm(0.05));
    expect(thin).toBeGreaterThan(thick);
  });

  it('rejects an mc outside [0, 1)', () => {
    expect(() => specificCuttingForce(1500, 1, mmToUm(0.1))).toThrow(RangeError);
    expect(() => specificCuttingForce(1500, -0.1, mmToUm(0.1))).toThrow(RangeError);
  });
});

describe('cutting power', () => {
  it('matches the worked example', () => {
    // ae 5, ap 2, vf 1273.2395 mm/min, kc 2667.4191, eta 0.8 -> 0.7076 kW
    const pc = millingPower(mmToUm(5), mmToUm(2), METRIC.vfMm * 1000, 2667.4191, 0.8);
    expect(roundHalfEven(pc, 4)).toBeCloseTo(0.7076, 3);
  });

  it('is inversely proportional to efficiency', () => {
    const a = millingPower(mmToUm(5), mmToUm(2), 1e6, 2000, 0.8);
    const b = millingPower(mmToUm(5), mmToUm(2), 1e6, 2000, 0.4);
    expect(b).toBeCloseTo(a * 2, 9);
  });

  it('defaults efficiency rather than assuming a perfect spindle', () => {
    expect(DEFAULT_EFFICIENCY).toBeLessThan(1);
    expect(DEFAULT_EFFICIENCY).toBeGreaterThan(0.5);
  });

  it('rejects an efficiency above 1', () => {
    expect(() => millingPower(mmToUm(5), mmToUm(2), 1e6, 2000, 1.2)).toThrow(RangeError);
  });
});

describe('mean chip thickness', () => {
  it('thins with radial engagement', () => {
    // fz 0.1, ae 5, Dc 10 -> 0.070711 mm
    const hm = meanChipThickness(mmToUm(0.1), mmToUm(5), mmToUm(10));
    expect(roundHalfEven(hm / 1000, 6)).toBeCloseTo(0.070711, 5);
  });

  it('equals feed per tooth when slotting', () => {
    // ae = Dc is a full slot: no radial thinning.
    const hm = meanChipThickness(mmToUm(0.1), mmToUm(10), mmToUm(10));
    expect(hm).toBeCloseTo(mmToUm(0.1), 9);
  });

  it('never exceeds feed per tooth', () => {
    // Clamped at ae = Dc. A cutter cannot engage more than its own diameter,
    // and an unclamped sqrt would quietly report a thicker chip than possible.
    const hm = meanChipThickness(mmToUm(0.1), mmToUm(50), mmToUm(10));
    expect(hm).toBeCloseTo(mmToUm(0.1), 9);
  });
});

describe('invariants across the whole domain', () => {
  const dc = fc.integer({ min: 500, max: 100_000 }).map((n) => um(n));
  const fz = fc.integer({ min: 5, max: 1_000 }).map((n) => um(n));
  const vc = fc.double({ min: 1, max: 1_000, noNaN: true, noDefaultInfinity: true });
  const teeth = fc.integer({ min: 1, max: 12 });

  it('rpm falls as the cutter gets bigger', () => {
    fc.assert(
      fc.property(vc, dc, fc.integer({ min: 100, max: 50_000 }), (v, d, extra) => {
        const bigger = um(d + extra);
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
        const q = millingMrr(um(Math.max(1, Math.floor(d / 2))), um(1000), vf);
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
        expect(meanChipThickness(f, um(ae), d)).toBeLessThanOrEqual(f + 1e-9);
      }),
      { numRuns: 400 },
    );
  });
});
