import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  chipThinningFigures,
  roundedFactor,
} from '../../src/lib/calc/chip-thinning-figures';
import { mmToNm } from '../../src/lib/calc/tap-drill';

/**
 * The figures on /machining/chip-thinning.
 *
 * Every expected value is one of two kinds, and each block says which:
 *
 *   PRINTED — a figure a maker published:
 *     - M.A. Ford, TuffCut GP "General Purpose End Mill Recommended Cutting
 *       Data - Profile Milling", catalogue p. 360, read 2026-10-15 from the
 *       text layer and the page image, which agree: "Multiply fz by this
 *       Factor based on ae", 2.3 / 1.8 / 1.2 / 1.1 / 1 at 5 / 10 / 20 / 30 /
 *       50 %.
 *     - Sandvik Coromant, "Entering angle and chip thickness in milling",
 *       read 2026-10-06: the feed for a 0.1 mm chip and the factor at 90°,
 *       75°, 65°, 45° and 10°.
 *
 *   DERIVED — worked by a separate 60-digit Python `decimal` run (the
 *   session's scratch script, not shipped), rounded once, half-even.
 */

const F = chipThinningFigures();

describe('radial engagement on a 10 mm end mill (DERIVED)', () => {
  it('works hex / fz, the restoring factor and hm / fz at each width', () => {
    expect(F.diameter).toBe('10');
    expect(F.rows.map((r) => [r.percent, r.ae, r.thinning, r.factor, r.mean])).toEqual([
      [5, '0.5', '0.4359', '2.2942', '0.2217'],
      [10, '1.0', '0.6000', '1.6667', '0.3108'],
      [20, '2.0', '0.8000', '1.2500', '0.4314'],
      [30, '3.0', '0.9165', '1.0911', '0.5176'],
      [50, '5.0', '1.0000', '1.0000', '0.6366'],
    ]);
  });

  it('a data sheet’s 0.05 mm at 10 % cuts 0.03 mm, and 0.0833 mm restores it', () => {
    expect(F.sheet).toEqual({ fz: '0.0500', hex: '0.0300', restore: '0.0833' });
  });
});

describe('M.A. Ford’s factors (PRINTED) against the geometry', () => {
  it('rounds the geometry to Ford’s one decimal, half-even from the exact square', () => {
    expect(F.rows.map((r) => [r.percent, r.factorOne, r.maFord])).toEqual([
      [5, '2.3', '2.3'],
      [10, '1.7', '1.8'],
      [20, '1.2', '1.2'],
      [30, '1.1', '1.1'],
      [50, '1', '1'],
    ]);
  });

  it('agrees on four of five, and differs only at 10 %', () => {
    const differ = F.rows.filter((r) => r.factorOne !== r.maFord).map((r) => r.percent);
    expect(differ).toEqual([10]);
  });

  it('at 20 % the factor is exactly 1.25, a tie, which half-even makes 1.2', () => {
    // (hex / fz)² = 4 × 2 × 8 / 100 = 16/25, so the factor is 5/4 exactly.
    expect(roundedFactor(mmToNm(2), mmToNm(10), 90, 2)).toBe('1.25');
    expect(roundedFactor(mmToNm(2), mmToNm(10), 90, 1)).toBe('1.2');
    // 10 %: 5/3 = 1.666…, no tie.
    expect(roundedFactor(mmToNm(1), mmToNm(10), 90, 4)).toBe('1.6667');
    // At half the diameter and beyond the chip is fz: the factor is 1 exactly.
    expect(roundedFactor(mmToNm(5), mmToNm(10), 90, 0)).toBe('1');
  });

  it('has no exact square where the entering angle makes it irrational', () => {
    expect(roundedFactor(mmToNm(1), mmToNm(10), 75, 1)).toBeNull();
  });
});

describe('the full slot and the √(ae/D) approximation (DERIVED)', () => {
  it('hm is 2/π of fz; taking it as fz is 57.1 % thick and power 10.7 % short at mc 0.25', () => {
    expect(F.slot).toEqual({
      mean: '0.6366',
      approxOver: '57.1',
      powerShort: '10.7',
      mc: '0.25',
    });
  });
});

describe('Sandvik’s entering-angle table (PRINTED)', () => {
  it('every feed and factor is the engine’s, rounded as Sandvik prints it', () => {
    expect(F.kappa.map((k) => [k.kappa, k.ours, k.oursFactor])).toEqual([
      [90, '0.1000', '1.0000'],
      [75, '0.1035', '1.0353'],
      [65, '0.1103', '1.1034'],
      [45, '0.1414', '1.4142'],
      [10, '0.5759', '5.7588'],
    ]);
    for (const k of F.kappa) {
      expect(Number(k.ours).toFixed(2), `${k.kappa}°`).toBe(k.feed);
      expect(Number(k.oursFactor).toFixed(1), `${k.kappa}°`).toBe(k.factor);
    }
  });

  it('the CoroMill 345, 63 mm at 45° and 6 mm deep, cuts at 75 mm', () => {
    expect(F.coromill).toEqual({ dc: '63', ap: '6', dcap: '75.0000' });
  });
});

describe('llms.txt', () => {
  // It is static text, so its figures are typed. Each must be one this module
  // computes, or the entry has drifted from the page.
  const llms = readFileSync(
    fileURLToPath(new URL('../../public/llms.txt', import.meta.url)),
    'utf8',
  );
  const start = llms.indexOf('### Chip thinning');
  const entry = llms.slice(start, llms.indexOf('## Verification', start));
  const row = (p: number) => F.rows.find((r) => r.percent === p);

  it.each([
    row(10)?.thinning,
    row(10)?.factor,
    row(5)?.factor,
    row(20)?.factor,
    row(10)?.maFord,
    F.slot.mean,
    F.slot.approxOver,
    F.slot.powerShort,
    F.kappa.find((k) => k.kappa === 45)?.oursFactor,
    F.kappa.find((k) => k.kappa === 10)?.oursFactor,
  ])('names %s as the page computes it', (figure) => {
    expect(start).toBeGreaterThan(-1);
    expect(figure).toBeDefined();
    expect(entry).toContain(String(figure));
  });
});
