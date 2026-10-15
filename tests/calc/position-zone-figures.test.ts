import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { positionZoneFigures } from '../../src/lib/calc/position-zone-figures';

/**
 * The figures on /machining/position-tolerance-zone.
 *
 *   PRINTED — a figure a source published, read 2026-10-15:
 *     - GD&T Basics, "True Position": 57%, and the hole .003 in off in X and
 *       .002 in in Y, worked to ".007" against a .008 tolerance, within.
 *     - Xometry, "True Position Tolerance" (published 2026-08-13): "57% more
 *       usable tolerance area".
 *
 *   DERIVED — worked by a separate 50-digit Python `decimal` run (the
 *   session's scratch script, not shipped), rounded once, half-even.
 */

const F = positionZoneFigures();

describe('the zones (DERIVED; 57% PRINTED by GD&T Basics and Xometry)', () => {
  it('the circle through the square’s corners is 57.08% bigger', () => {
    expect(F.moreArea).toBe('57.08');
    // Both sources print it to the whole percent.
    expect(Math.round(Number(F.moreArea))).toBe(57);
  });

  it('the square leaves out 36.34% of that circle, not 57%', () => {
    expect(F.squareLeavesOut).toBe('36.34');
  });

  it('reaches 41.42% further along X or Y; the inscribed circle is 78.54% of the square', () => {
    expect(F.axisReach).toBe('41.42');
    expect(F.inscribedShare).toBe('78.54');
  });

  it('the factors: √2, 2√2 and 1/(2√2)', () => {
    expect([F.root2, F.twoRoot2, F.inscribedPlusMinus]).toEqual([
      '1.4142',
      '2.8284',
      '0.3536',
    ]);
  });
});

describe('±.005 in as a diameter (DERIVED)', () => {
  it('is 2√2 × .005 = .014142, between the four-place .0141 and .0142', () => {
    expect(F.drawing).toEqual({
      plusMinus: '.005',
      exact: '.014142',
      above: '.0142',
      below: '.0141',
      inscribed: '.010',
      backToSquare: '.003536',
    });
    expect(Number(F.drawing.below)).toBeLessThan(Number(F.drawing.exact));
    expect(Number(F.drawing.above)).toBeGreaterThan(Number(F.drawing.exact));
  });

  it('judges four holes against each zone with the engine', () => {
    expect(
      F.parts.map((p) => [
        p.dx,
        p.dy,
        p.position,
        p.square,
        p.above,
        p.below,
        p.inscribed,
      ]),
    ).toEqual([
      ['.003', '.002', '.0072', true, true, true, true],
      ['.005', '.005', '.0141', true, true, false, false],
      ['.007', '.000', '.0140', false, true, true, false],
      ['.0045', '.0045', '.0127', true, true, true, false],
    ]);
  });

  it('the corner hole prints as .0141 and still fails Ø.0141: it is .014142', () => {
    const corner = F.parts[1];
    expect(corner?.position).toBe(F.drawing.below);
    expect(corner?.below).toBe(false);
  });

  it('every hole the square accepts, the circle above accepts', () => {
    for (const p of F.parts) if (p.square) expect(p.above, p.name).toBe(true);
  });
});

describe('GD&T Basics’ worked hole (PRINTED)', () => {
  it('.003 and .002 off is Ø.0072, .007 to three places, within .008', () => {
    expect(F.gdtBasics).toEqual({
      position: '.0072',
      threePlaces: '.007',
      tolerance: '.008',
      within: true,
    });
  });
});

describe('llms.txt', () => {
  const llms = readFileSync(
    fileURLToPath(new URL('../../public/llms.txt', import.meta.url)),
    'utf8',
  );
  const start = llms.indexOf('### Position tolerance zone');
  const entry = llms.slice(start, llms.indexOf('## Verification', start));

  it.each([
    F.moreArea,
    F.squareLeavesOut,
    F.axisReach,
    F.inscribedShare,
    F.drawing.exact,
    F.drawing.below,
    F.drawing.above,
    F.gdtBasics.position,
  ])('names %s as the page computes it', (figure) => {
    expect(start).toBeGreaterThan(-1);
    expect(entry).toContain(figure);
  });
});
