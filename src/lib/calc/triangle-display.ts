/**
 * What the triangle page SHOWS, as data rather than as DOM.
 *
 * The same split as the other shop pages (D72): the page maps this object
 * onto the DOM and does no arithmetic, and `tests/calc/triangle-display.test.ts`
 * checks the STRINGS.
 *
 * ─── Rounding, once ─────────────────────────────────────────────────────────
 *
 * Sides to 0.0001 mm or in from their brackets (`bracketSteps`), angles to
 * 0.0001° and areas to 0.0001 mm² or in², each half-even, once, from the
 * exact value where `triangle.ts` has one and from the floating-point value
 * otherwise. The working prints its figures rounded for the reader; nothing is
 * worked from a printed figure.
 *
 * Nothing the visitor typed reaches the result's markup: every figure is
 * printed from the parsed numbers.
 */

import { halfEvenBig, NM_PER, parseAngle, parseLength } from './convert';
import {
  formatSteps,
  roundHalfEvenWhole,
  type DisplayUnits,
} from './hole-pattern-display';
import { bracketSteps } from './true-position-display';
import {
  solveTriangle,
  type Angle,
  type Area,
  type Case,
  type Rational,
  type Side,
  type Solved,
} from './triangle';

export type TriangleMode = 'right' | 'any';

export interface TriangleInput {
  readonly mode: TriangleMode;
  readonly units: DisplayUnits;
  /** As typed; blank for unknown. In inches a side may be a fraction, 13/64. */
  readonly a: string;
  readonly b: string;
  readonly c: string;
  /** As typed, in degrees: 30, 30.25 or 30 15; blank for unknown. */
  readonly alpha: string;
  readonly beta: string;
  /** Ignored in a right triangle, where it is 90°. */
  readonly gamma: string;
}

export interface Row {
  readonly name: string;
  readonly value: string;
  /** Typed in, or the right angle; not worked out. */
  readonly given: boolean;
}

export interface TriangleFigure {
  /** The corners A, B, C in the display unit, A at the origin and c along x. */
  readonly points: readonly [
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
  ];
  /** Whether γ is a right angle, given or found. */
  readonly right: boolean;
}

export interface TriangleView {
  readonly rows: readonly Row[];
  readonly area: string;
  readonly figure: TriangleFigure;
}

export interface TriangleDisplay {
  readonly headline: string;
  readonly detail: string;
  readonly triangles: readonly TriangleView[];
  /** The ambiguous case says why there are two. */
  readonly note: string | null;
  readonly working: string;
}

const SIDE = ['a', 'b', 'c'] as const;
const ANGLE = ['α', 'β', 'γ'] as const;
const NM: Readonly<Record<DisplayUnits, number>> = { mm: NM_PER.mm, in: NM_PER.in };
/** One step of area, 0.0001 mm² or 0.0001 in², in nm². */
const AREA_STEP: Readonly<Record<DisplayUnits, bigint>> = {
  mm: 100_000_000n,
  in: 64_516_000_000n,
};

const CASE_TEXT: Readonly<Record<Case, string>> = {
  SSS: 'Three sides (SSS)',
  SAS: 'Two sides and the angle between them (SAS)',
  ASA: 'Two angles and the side between them (ASA)',
  AAS: 'Two angles and a side not between them (AAS)',
  SSA: 'Two sides and an angle not between them (SSA)',
};

// ─── Figures ─────────────────────────────────────────────────────────────────

function sideSteps(s: Side, units: DisplayUnits): number {
  return bracketSteps(s.bracket, units);
}

function angleSteps(a: Angle): number {
  return a.exact !== null
    ? Number(halfEvenBig(a.exact.num * 10_000n, a.exact.den))
    : roundHalfEvenWhole(a.approx * 10_000);
}

function areaSteps(a: Area, units: DisplayUnits): number {
  const step = AREA_STEP[units];
  return a.exact !== null
    ? Number(halfEvenBig(a.exact.num, a.exact.den * step))
    : roundHalfEvenWhole(a.approx / Number(step));
}

const sideText = (s: Side, u: DisplayUnits): string =>
  `${formatSteps(sideSteps(s, u))} ${u}`;
const angleText = (a: Angle): string => `${formatSteps(angleSteps(a))}°`;
const areaText = (a: Area, u: DisplayUnits): string =>
  `${formatSteps(areaSteps(a, u))} ${u}²`;
/** For the working: four places with the trailing zeros dropped, as typed. */
const short = (steps: number): string => formatSteps(steps).replace(/\.?0+$/, '');
const sideShort = (s: Side, u: DisplayUnits): string => short(sideSteps(s, u));
const angleShort = (a: Angle): string => `${short(angleSteps(a))}°`;

// ─── Input ───────────────────────────────────────────────────────────────────

function side(text: string, units: DisplayUnits, name: string): number | null {
  if (text.trim() === '') return null;
  let nm: number;
  try {
    nm = parseLength(text, units).nm;
  } catch (err) {
    throw new RangeError(
      `Side ${name}: ${err instanceof Error ? err.message : 'not a length.'}`,
    );
  }
  if (nm === 0) throw new RangeError(`Side ${name} has to be more than zero.`);
  return nm;
}

function angle(text: string, name: string): Rational | null {
  if (text.trim() === '') return null;
  let a;
  try {
    a = parseAngle(text, 'deg');
  } catch (err) {
    throw new RangeError(
      `Angle ${name}: ${err instanceof Error ? err.message : 'not an angle.'}`,
    );
  }
  if (a.kind !== 'degrees' || a.num <= 0n || a.num >= 180n * a.den) {
    throw new RangeError(`Angle ${name} has to be more than 0° and less than 180°.`);
  }
  return { num: a.num, den: a.den };
}

// ─── The working ─────────────────────────────────────────────────────────────

function working(
  kase: Case,
  triangles: readonly Solved[],
  isGiven: readonly boolean[],
  sine: number | undefined,
  u: DisplayUnits,
): string {
  const t0 = triangles[0] as Solved;
  const S = (t: Solved, i: number): string => sideShort(t.sides[i] as Side, u);
  const A = (t: Solved, i: number): string => angleShort(t.angles[i] as Angle);
  const knownAngles = [0, 1, 2].filter((i) => isGiven[3 + i]);
  const knownSides = [0, 1, 2].filter((i) => isGiven[i]);
  const lines: string[] = [`${CASE_TEXT[kase]}.`];
  const cosine = (t: Solved, i: number): string[] => {
    const [p, q] = i === 0 ? [1, 2] : i === 1 ? [0, 2] : [0, 1];
    return [
      `${ANGLE[i]} = acos((${SIDE[p]}² + ${SIDE[q]}² − ${SIDE[i]}²) ÷ (2${SIDE[p]}${SIDE[q]}))`,
      `  = acos((${S(t, p)}² + ${S(t, q)}² − ${S(t, i)}²) ÷ (2 × ${S(t, p)} × ${S(t, q)}))`,
      `  = ${A(t, i)}`,
    ];
  };
  const rest = (i: number, x: number, y: number): string =>
    `${ANGLE[i]} = 180° − ${ANGLE[x]} − ${ANGLE[y]} = ${A(t0, i)}`;

  if (kase === 'SSS') {
    lines.push(
      'Each angle by the law of cosines.',
      '',
      ...cosine(t0, 0),
      ...cosine(t0, 1),
      rest(2, 0, 1),
    );
  } else if (kase === 'SAS') {
    const g = knownAngles[0] as number;
    const [p, q] = knownSides as [number, number];
    const small = (t0.sides[p] as Side).approx <= (t0.sides[q] as Side).approx ? p : q;
    const large = small === p ? q : p;
    lines.push(
      'The third side by the law of cosines.',
      '',
      `${SIDE[g]}² = ${SIDE[p]}² + ${SIDE[q]}² − 2${SIDE[p]}${SIDE[q]} × cos ${ANGLE[g]}`,
      `   = ${S(t0, p)}² + ${S(t0, q)}² − 2 × ${S(t0, p)} × ${S(t0, q)} × cos ${A(t0, g)}`,
      `${SIDE[g]}  = ${sideText(t0.sides[g] as Side, u)}`,
      '',
      ...cosine(t0, small),
      rest(large, g, small),
    );
  } else if (kase === 'ASA' || kase === 'AAS') {
    const k = [0, 1, 2].find((i) => !isGiven[3 + i]) as number;
    const [x, y] = knownAngles as [number, number];
    const i = knownSides[0] as number;
    lines.push(
      'The third angle from 180°, the sides by the law of sines.',
      '',
      rest(k, x, y),
    );
    for (const j of [0, 1, 2].filter((n) => n !== i)) {
      lines.push(
        `${SIDE[j]} = ${SIDE[i]} × sin ${ANGLE[j]} ÷ sin ${ANGLE[i]} = ${S(t0, i)} × sin ${A(t0, j)} ÷ sin ${A(t0, i)} = ${sideText(t0.sides[j] as Side, u)}`,
      );
    }
  } else {
    const g = knownAngles[0] as number;
    const t = knownSides.find((n) => n !== g) as number;
    const uIdx = [0, 1, 2].find((n) => n !== g && n !== t) as number;
    lines.push(
      'The law of sines, for the angle opposite the other known side first.',
      '',
      `sin ${ANGLE[t]} = ${SIDE[t]} × sin ${ANGLE[g]} ÷ ${SIDE[g]} = ${S(t0, t)} × sin ${A(t0, g)} ÷ ${S(t0, g)} = ${(sine ?? 0).toFixed(8)}`,
    );
    const first = A(t0, t);
    if (sine === 1) {
      lines.push(
        `sin ${ANGLE[t]} is exactly 1, so ${ANGLE[t]} = 90°: one triangle, right-angled.`,
      );
    } else if (triangles.length === 2) {
      lines.push(
        `${ANGLE[t]} = ${first}, or 180° − ${first} = ${A(triangles[1] as Solved, t)}: both fit, so two triangles.`,
      );
    } else {
      lines.push(
        `${ANGLE[t]} = ${first}. Its other value, 180° − ${first}, leaves no room for ${ANGLE[uIdx]}: one triangle.`,
      );
    }
    triangles.forEach((tri, n) => {
      const label = triangles.length === 2 ? `Triangle ${n + 1}: ` : '';
      lines.push(
        '',
        `${label}${ANGLE[uIdx]} = 180° − ${ANGLE[g]} − ${ANGLE[t]} = ${A(tri, uIdx)}`,
        `${' '.repeat(label.length)}${SIDE[uIdx]} = ${SIDE[g]} × sin ${ANGLE[uIdx]} ÷ sin ${ANGLE[g]} = ${sideText(tri.sides[uIdx] as Side, u)}`,
      );
    });
  }

  lines.push('');
  triangles.forEach((tri, n) => {
    const label = triangles.length === 2 ? ` (triangle ${n + 1})` : '';
    lines.push(
      `Area${label} = ½ × a × b × sin γ = ½ × ${S(tri, 0)} × ${S(tri, 1)} × sin ${A(tri, 2)} = ${areaText(tri.area, u)}`,
    );
  });
  lines.push(
    '',
    'Figures in the working are printed to four places. Every answer is',
    'worked from the full values and rounded once, half to even.',
  );
  return lines.join('\n');
}

// ─── The display ─────────────────────────────────────────────────────────────

function view(t: Solved, isGiven: readonly boolean[], u: DisplayUnits): TriangleView {
  const rows: Row[] = [
    ...[0, 1, 2].map((i) => ({
      name: SIDE[i] as string,
      value: sideText(t.sides[i] as Side, u),
      given: isGiven[i] === true,
    })),
    ...[0, 1, 2].map((i) => ({
      name: ANGLE[i] as string,
      value: angleText(t.angles[i] as Angle),
      given: isGiven[3 + i] === true,
    })),
  ];
  const per = NM[u];
  const [, b, c] = t.sides;
  const alpha = t.angles[0].approx * (Math.PI / 180);
  const gamma = t.angles[2];
  return {
    rows,
    area: areaText(t.area, u),
    figure: {
      points: [
        [0, 0],
        [c.approx / per, 0],
        [(b.approx * Math.cos(alpha)) / per, (b.approx * Math.sin(alpha)) / per],
      ],
      right: gamma.exact !== null ? gamma.exact.num === 90n * gamma.exact.den : false,
    },
  };
}

/** A triangle from three of its six parts, or a right one from two. */
export function triangleDisplay(input: TriangleInput): TriangleDisplay {
  const u = input.units;
  const sides = [
    side(input.a, u, 'a'),
    side(input.b, u, 'b'),
    side(input.c, u, 'c'),
  ] as const;
  const alpha = angle(input.alpha, 'α');
  const beta = angle(input.beta, 'β');
  let gamma: Rational | null;

  if (input.mode === 'right') {
    const count = [...sides, alpha, beta].filter((v) => v !== null).length;
    if (count !== 2 || sides.every((s) => s === null)) {
      throw new RangeError('Enter two of a, b, c, α and β, at least one of them a side.');
    }
    for (const a of [alpha, beta]) {
      if (a !== null && a.num >= 90n * a.den) {
        throw new RangeError('In a right triangle α and β are each less than 90°.');
      }
    }
    const [a, b, c] = sides;
    if (c !== null && ((a !== null && a >= c) || (b !== null && b >= c))) {
      throw new RangeError(
        'The hypotenuse c is the longest side: it has to be longer than a and b.',
      );
    }
    gamma = { num: 90n, den: 1n };
  } else {
    gamma = angle(input.gamma, 'γ');
  }

  const solution = solveTriangle({ sides, angles: [alpha, beta, gamma] });
  const isGiven = [
    ...sides.map((s) => s !== null),
    alpha !== null,
    beta !== null,
    gamma !== null,
  ];
  const triangles = solution.triangles.map((t) => view(t, isGiven, u));
  const two = solution.triangles.length === 2;

  let headline: string;
  if (two) {
    headline = 'Two triangles fit';
  } else {
    const rows = triangles[0]?.rows ?? [];
    const first =
      rows.find((r) => !r.given && 'abc'.includes(r.name)) ?? rows.find((r) => !r.given);
    headline = first === undefined ? '' : `${first.name} = ${first.value}`;
  }
  const detail =
    input.mode === 'right'
      ? `A right triangle, γ = 90°. ${CASE_TEXT[solution.case]}.`
      : `${CASE_TEXT[solution.case]}.`;

  return {
    headline,
    detail,
    triangles,
    note: two
      ? 'Two sides and an angle not between them can close two ways: the angle opposite the longer side may be acute or obtuse. Both are shown, because picking one would be a guess; the part or the drawing says which.'
      : null,
    working: working(solution.case, solution.triangles, isGiven, solution.sine, u),
  };
}
