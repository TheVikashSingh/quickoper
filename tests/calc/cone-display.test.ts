import { describe, expect, it } from 'vitest';
import { coneDisplay, type ConeInput } from '../../src/lib/calc/cone-display';

/**
 * What the countersink and chamfer page prints, checked as strings.
 *
 * Expected values come from:
 *
 *   - Severance Tool Industries, "Countersink Angle Guide" (retrieved
 *     2026-10-12, https://severancetools.com/resources/countersink-angle-guide.html):
 *     82° to Ø0.500 in over a 0.201 in pilot hole, "Depth: 0.1720".
 *   - The research spec's golden values (`machinist-calc-research`
 *     03-spec/calculations.md, "Cones"): Ø12 at 90° is 6.0000 deep, 2.8000
 *     into a 6.4 mm hole; 3 mm deep with a 0.2 mm tip flat is Ø6.2000; a
 *     10 mm drill at 118° has a 3.0043 mm point.
 *   - The 60-digit reference in `tests/fixtures/cone-reference.py`, for
 *     everything else: tan 41° = 0.86928673…, so the sharp tool depth at
 *     Ø0.5 in is 0.2876; tan 59° = 1.66427948…, so 20 mm plus the 10 mm
 *     drill's point is 23.0043.
 */

const show = (over: Partial<ConeInput>) =>
  coneDisplay({
    mode: 'depth',
    units: 'mm',
    angle: 90,
    diameter: 12,
    tipFlat: null,
    hole: 6.4,
    depth: null,
    fullDepth: null,
    ...over,
  });

describe('depth from a diameter', () => {
  it("the page's opening example: Ø12 at 90° over a 6.4 mm hole", () => {
    const d = show({});
    expect(d.headline).toBe('6.0000 mm deep');
    expect(d.summary).toEqual([
      { label: 'Tool depth', value: '6.0000 mm' },
      { label: 'Into the hole', value: '2.8000 mm' },
      { label: 'Each side', value: '45°' },
    ]);
    expect(d.detail).toBe(
      "From the surface to the tool's tip, for Ø12 mm at 90° included (45° each side).",
    );
    expect(d.working).toBe(
      [
        'θ = 90° included, 45° each side',
        'tan(θ/2) = tan 45° = 1',
        '',
        "Tool depth, from the surface to the tool's tip:",
        'Z = (D − f) ÷ (2 × tan(θ/2))',
        '  = (12 − 0) ÷ (2 × 1)',
        '  = 6.0000 mm',
        '',
        "f, the flat on the tool's tip: 0 (a sharp point)",
        '',
        "Where the cone meets the hole's wall, below the surface:",
        '(D − d) ÷ (2 × tan(θ/2))',
        '  = (12 − 6.4) ÷ (2 × 1)',
        '  = 2.8000 mm',
        '',
        'The rule: Severance Tool Industries, countersink angle guide,',
        'depth = (D − d) / (2 × tan(angle / 2)) and D = d + 2 × depth × tan(angle / 2).',
      ].join('\n'),
    );
    expect(d.caution).toBeNull();
    expect(d.figure).toEqual({
      kind: 'countersink',
      answer: 'depth',
      angle: 90,
      surfaceR: 6,
      tipR: 0,
      depth: 6,
      holeR: 3.2,
      holeDepth: 2.8,
      fullDepth: null,
    });
  });

  it("Severance's example in inches: 0.1720 into the 0.201 hole", () => {
    const d = show({ units: 'in', angle: 82, diameter: 0.5, hole: 0.201 });
    expect(d.summary).toEqual([
      { label: 'Tool depth', value: '0.2876 in' },
      { label: 'Into the hole', value: '0.1720 in' },
      { label: 'Each side', value: '41°' },
    ]);
    expect(d.working).toContain('tan(θ/2) = tan 41° = 0.8692867');
    expect(d.working).toContain('  = (0.5 − 0.201) ÷ (2 × 0.8692867)\n  = 0.1720 in');
  });

  it('a tip flat is taken off the diameter', () => {
    const d = show({ tipFlat: 0.5, hole: null });
    expect(d.headline).toBe('5.7500 mm deep');
    expect(d.working).toContain('  = (12 − 0.5) ÷ (2 × 1)\n  = 5.7500 mm');
    expect(d.working).toContain("f, the flat on the tool's tip: 0.5");
    expect(d.summary.map((f) => f.label)).toEqual(['Tool depth', 'Each side']);
  });

  it('a half angle that is not whole prints as it is', () => {
    expect(show({ angle: 82.5, hole: null }).working).toMatch(
      /^θ = 82\.5° included, 41\.25° each side\n/,
    );
  });
});

describe('diameter from a depth', () => {
  it('3 mm deep with a 0.2 mm tip flat at 90° is Ø6.2000', () => {
    const d = show({
      mode: 'diameter',
      depth: 3,
      tipFlat: 0.2,
      diameter: null,
      hole: null,
    });
    expect(d.headline).toBe('Ø6.2000 mm');
    expect(d.summary[0]).toEqual({
      label: 'Diameter at the surface',
      value: 'Ø6.2000 mm',
    });
    expect(d.working).toContain(
      'D = f + 2 × Z × tan(θ/2)\n  = 0.2 + 2 × 3 × 1\n  = 6.2000 mm',
    );
  });

  it("Severance's example back again: 0.172 in deep over the 0.201 hole is Ø0.5000", () => {
    // Severance takes the pilot hole as d; on this page that is where the cone
    // stops, the same place as a tip flat of that width.
    const d = show({
      mode: 'diameter',
      units: 'in',
      angle: 82,
      depth: 0.172,
      tipFlat: 0.201,
    });
    expect(d.headline).toBe('Ø0.5000 in');
  });
});

describe("a drill's point", () => {
  it('a 10 mm drill at 118°, drilled for a full diameter 20 mm deep', () => {
    const d = show({
      mode: 'point',
      angle: 118,
      diameter: 10,
      hole: null,
      fullDepth: 20,
    });
    expect(d.headline).toBe('3.0043 mm');
    expect(d.summary).toEqual([
      { label: 'Point length', value: '3.0043 mm' },
      { label: 'Drill to', value: '23.0043 mm' },
    ]);
    expect(d.working).toContain('H + L = 20 + 3.0043\n      = 23.0043 mm');
    expect(d.caution).toMatch(/chisel edge/);
    expect(d.figure.fullDepth).toBe(20);
  });

  it('without a depth asked for, only the point length', () => {
    const d = show({ mode: 'point', angle: 118, diameter: 10, hole: null });
    expect(d.summary).toEqual([{ label: 'Point length', value: '3.0043 mm' }]);
  });
});

describe('the working says when its figures are rounded', () => {
  it('an input with more decimals than the page shows', () => {
    // Ø12.00001 at 90° is 6.000005 mm deep: shown 6.0000.
    const d = show({ diameter: 12.00001, hole: null });
    expect(d.headline).toBe('6.0000 mm deep');
    expect(d.working).toContain('An input has more decimal places than are shown here.');
  });

  it('and does not when every input is shown as typed', () => {
    expect(show({}).working).not.toContain('more decimal places');
  });
});

describe('what it refuses, in words', () => {
  it.each([
    [{ angle: Number.NaN }, 'Enter the included angle of the tool, in degrees.'],
    [{ angle: 180 }, 'A 45° chamfer is cut with a 90° tool.'],
    [{ angle: 0 }, 'more than 0° and less than 180°'],
    [{ diameter: null }, 'Enter the diameter at the surface.'],
    [{ diameter: 0 }, 'has to be more than zero'],
    [{ diameter: -12 }, 'A length is zero or more.'],
    [{ diameter: 10_001_000 }, 'A length over 10 m is a slip in the inputs.'],
    [{ tipFlat: 12, hole: null }, 'The tip flat has to be smaller'],
    [{ hole: 12 }, 'or the cone never meets it'],
    [{ hole: 0 }, 'A hole has to be more than zero across'],
    [{ tipFlat: 7, hole: 6.4 }, "wider than the tool's tip flat"],
    [
      { mode: 'diameter', depth: null } as Partial<ConeInput>,
      "Enter the depth from the surface to the tool's tip.",
    ],
    [
      { mode: 'point', diameter: null } as Partial<ConeInput>,
      "Enter the drill's diameter.",
    ],
  ])('%j', (over, words) => {
    expect(() => show(over)).toThrow(words);
  });
});
