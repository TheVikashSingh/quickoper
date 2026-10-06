import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FRACTIONAL_DRILLS } from '../../src/lib/calc/drill-series';
import {
  LETTER_DRILLS,
  NUMBER_DRILLS,
  NUMBER_LETTER_SOURCES,
  parseNumberLetterTable,
} from '../../src/lib/calc/number-letter-drills';

/**
 * The number and letter drill table: the first transcribed reference data the
 * site ships, so the tests that guard it are about provenance first.
 *
 * Every expected diameter below is a figure printed by all three of Guhring
 * ("Decimal Equivalents", p. 285), Pan American Tool ("Decimal Equivalents",
 * p. 2) and Dormer (catalogue p. 515), read and compared on 2026-09-27 —
 * except J and M, where two of the three agree and the third is the note.
 * Each is written as a whole count of ten-thousandths of an inch, because one
 * ten-thousandth is exactly 2 540 nm and the expected nanometres are then
 * exact integers, with no float conversion in the test to hide an error in
 * the module's own.
 */

const CSV_PATH = fileURLToPath(
  new URL('../../src/data/number-letter-drills.csv', import.meta.url),
);
const TABLE = readFileSync(CSV_PATH, 'utf8');

/**
 * SHA-256 of `src/data/number-letter-drills.csv`, with LF line endings.
 *
 * The same bytes as `machinist-calc-app/fixtures/number-letter-drills.csv` at
 * commit bd13018, the table checked against the three makers. If this fails,
 * the table changed. Re-check the change against the makers' charts in the app
 * first, copy the file across, and only then update this hash. Updating the
 * hash alone is the one change to this file that should never pass review.
 */
const TABLE_SHA256 = 'a5d353d592354a3eacc6f795d607b269caf24187b9ac98f6e5fa2581ba5e45af';

const NM_PER_TEN_THOUSANDTH = 2_540;

const all = [...NUMBER_DRILLS, ...LETTER_DRILLS];
const drill = (label: string) => {
  const found = all.find((d) => d.label === label);
  if (found === undefined) throw new Error(`no drill labelled ${label}`);
  return found;
};

describe('the table is the one that was checked', () => {
  it('matches the checked table byte for byte', () => {
    const lf = TABLE.replace(/\r\n/g, '\n');
    expect(createHash('sha256').update(lf).digest('hex')).toBe(TABLE_SHA256);
  });

  it('cites the three makers it was checked against', () => {
    expect(NUMBER_LETTER_SOURCES.map((s) => s.label.split(' ')[0])).toEqual([
      'Guhring',
      'Pan',
      'Dormer',
    ]);
    for (const s of NUMBER_LETTER_SOURCES) {
      expect(s.url.startsWith('https://')).toBe(true);
      expect(s.retrieved).toBe('2026-09-27');
    }
  });
});

describe('number drills', () => {
  it('runs #80 to #1, smallest first, each once', () => {
    expect(NUMBER_DRILLS.map((d) => d.label)).toEqual(
      Array.from({ length: 80 }, (_, i) => `#${80 - i}`),
    );
    expect(NUMBER_DRILLS.every((d) => d.series === 'number')).toBe(true);
  });

  // The ends of the series, and the five number drills the golden tap drill
  // fixture names (#4-40 → #43, #6-32 → #36, #8-32 → #29, #10-24 → #25,
  // 1/4-20 → #7). All three makers print each of these figures.
  it.each([
    ['#80', 135],
    ['#79', 145],
    ['#43', 890],
    ['#36', 1065],
    ['#29', 1360],
    ['#25', 1495],
    ['#13', 1850],
    ['#12', 1890],
    ['#7', 2010],
    ['#1', 2280],
  ])('%s is %i ten-thousandths of an inch, exactly', (label, tenThousandths) => {
    expect(drill(label).nm).toBe(tenThousandths * NM_PER_TEN_THOUSANDTH);
  });
});

describe('letter drills', () => {
  it('runs A to Z, smallest first, each once', () => {
    expect(LETTER_DRILLS.map((d) => d.label).join('')).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    expect(LETTER_DRILLS.every((d) => d.series === 'letter')).toBe(true);
  });

  // F is 5/16-18's published drill. J and M are the two letters the makers
  // split on: 0.2770 and 0.2950 are what Pan American Tool and Dormer print.
  it.each([
    ['A', 2340],
    ['E', 2500],
    ['F', 2570],
    ['J', 2770],
    ['M', 2950],
    ['Z', 4130],
  ])('%s is %i ten-thousandths of an inch, exactly', (label, tenThousandths) => {
    expect(drill(label).nm).toBe(tenThousandths * NM_PER_TEN_THOUSANDTH);
  });

  it('starts above the largest number drill', () => {
    // #1 is 0.2280 in and A is 0.2340 in: the letter series continues the
    // number series rather than overlapping it.
    expect(LETTER_DRILLS[0]!.nm).toBeGreaterThan(NUMBER_DRILLS.at(-1)!.nm);
  });

  it('puts E on exactly the same hole as a quarter inch', () => {
    // 0.2500 in, by every maker; 1/4" is 16/64 of 25 400 000 nm.
    const quarter = FRACTIONAL_DRILLS.find((d) => d.label === '1/4"');
    expect(drill('E').nm).toBe(6_350_000);
    expect(quarter?.nm).toBe(6_350_000);
  });
});

describe('the maker disagreements travel with the drill', () => {
  it('notes J and M, and no other drill', () => {
    expect(all.filter((d) => d.note !== undefined).map((d) => d.label)).toEqual([
      'J',
      'M',
    ]);
  });

  it.each([
    ['J', '0.2772', '0.2770'],
    ['M', '0.2949', '0.2950'],
  ])(
    "%s's note gives Guhring's %s and the other two makers' %s",
    (label, odd, shipped) => {
      const note = drill(label).note ?? '';
      expect(note).toContain(`Guhring prints ${odd} in`);
      expect(note).toContain(`Pan American Tool and Dormer print ${shipped} in`);
    },
  );
});

describe('every diameter is exact', () => {
  it('is a whole number of ten-thousandths of an inch', () => {
    for (const d of all) {
      expect(d.nm % NM_PER_TEN_THOUSANDTH, d.label).toBe(0);
    }
  });
});

/**
 * Each guard, made to fire.
 *
 * A guard that has never failed is not a guard. Each case corrupts one thing in
 * a copy of the real table and expects the parser to refuse it, naming why.
 * `corrupt` checks its search text is really in the table, so a case cannot
 * pass by quietly changing nothing.
 */
describe('the table refuses to load when a guard fails', () => {
  const corrupt = (from: string, to: string): string => {
    expect(TABLE.includes(from), `"${from}" is not in the table`).toBe(true);
    return TABLE.replace(from, to);
  };

  it('parses the real table to exactly the exported drills', () => {
    const parsed = parseNumberLetterTable(TABLE);
    expect(parsed.number).toEqual(NUMBER_DRILLS);
    expect(parsed.letter).toEqual(LETTER_DRILLS);
  });

  it('reads Windows line endings the same way', () => {
    const parsed = parseNumberLetterTable(TABLE.replace(/\n/g, '\r\n'));
    expect(parsed.number).toEqual(NUMBER_DRILLS);
  });

  it.each([
    [
      'a figure only one maker prints',
      [
        'NUMBER,#29,0.1360,0.1360,0.1360,.1360,',
        'NUMBER,#29,0.1365,0.1365,0.1360,.1360,',
      ],
      /only 1 of 3 makers print 0\.1365/,
    ],
    [
      'a disagreement with its note removed',
      [
        'LETTER,J,0.2770,0.2772,0.2770,.2770,Guhring prints 0.2772 in; Pan American Tool and Dormer print 0.2770 in.',
        'LETTER,J,0.2770,0.2772,0.2770,.2770,',
      ],
      /makers disagree, so the row must say so/,
    ],
    [
      'a note on a row where all three agree',
      [
        'LETTER,K,0.2810,0.2810,0.2810,.2810,',
        'LETTER,K,0.2810,0.2810,0.2810,.2810,checked',
      ],
      /must carry no note/,
    ],
    [
      'a missing size',
      ['NUMBER,#40,0.0980,0.0980,0.0980,.0980,\n', ''],
      /number drills: expected/,
    ],
    [
      'a size larger than the next one up',
      [
        'NUMBER,#29,0.1360,0.1360,0.1360,.1360,',
        'NUMBER,#29,0.1440,0.1440,0.1440,.1440,',
      ],
      /not strictly ascending at #28/,
    ],
    [
      'a figure to three decimals',
      ['NUMBER,#29,0.1360,', 'NUMBER,#29,0.136,'],
      /not an inch figure to four decimals/,
    ],
    [
      'a quoted field',
      ['LETTER,K,0.2810,0.2810,0.2810,.2810,', 'LETTER,K,0.2810,0.2810,0.2810,.2810,"x"'],
      /quoted fields are not supported/,
    ],
    ['an unknown series', ['LETTER,K,', 'METRIC,K,'], /unknown series "METRIC"/],
    [
      'a changed header',
      ['series,size,decimal_in,', 'series,size,inch,'],
      /unexpected header/,
    ],
  ] as const)('refuses %s', (_name, [from, to], message) => {
    expect(() => parseNumberLetterTable(corrupt(from, to))).toThrow(message);
  });

  it('refuses two sizes swapped', () => {
    const a = 'NUMBER,#30,0.1285,0.1285,0.1285,.1285,';
    const b = 'NUMBER,#29,0.1360,0.1360,0.1360,.1360,';
    expect(TABLE.includes(`${a}\n${b}`)).toBe(true);
    expect(() =>
      parseNumberLetterTable(TABLE.replace(`${a}\n${b}`, `${b}\n${a}`)),
    ).toThrow(/number drills: expected/);
  });
});
