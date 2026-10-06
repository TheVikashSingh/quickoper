/**
 * Number drills (#80–#1) and letter drills (A–Z): the two TRANSCRIBED series.
 *
 * ─── Why these arrive as data, and what makes them safe to ship ─────────────
 *
 * Metric and fractional drills are generated from their own definitions in
 * `drill-series.ts`. These two have no generating rule: #29 is 0.1360 in
 * because the table says so, and the next size up is not arithmetic from it. A
 * mistyped digit is a drill a tenth of a millimetre from the right one, and a
 * thread that strips.
 *
 * So no figure is typed here. They are read from
 * `src/data/number-letter-drills.csv`, which records, for every size, the
 * figure each of three makers prints in its own decimal-equivalents chart:
 *
 *   guhring  Guhring, "Decimal Equivalents - drill sizes and popular tap
 *            drill sizes", catalogue p. 285
 *   panam    Pan American Tool, "Decimal Equivalents", p. 2
 *   dormer   Dormer catalogue, "Technical Section - General: Decimal
 *            Equivalents", p. 515 (a distributor's copy)
 *
 * Read and compared by Claude on 2026-09-27, the named-checker arrangement D96
 * set out for the tap drill rows. 104 of the 106 sizes: all three makers print
 * the same figure. J and M: two of three agree, the shipped figure is theirs,
 * and the third is carried as a note wherever that drill appears. Nothing is
 * averaged.
 *
 * The file is a byte-for-byte copy of the table the Android app ships
 * (`machinist-calc-app/fixtures/number-letter-drills.csv`, commit bd13018).
 * `tests/calc/number-letter-drills.test.ts` pins its SHA-256, so it cannot be
 * edited here without a test going red. This module shares the DATA with the
 * app and none of the code: the parsing and the guards below are written
 * against the table, not ported from the Kotlin, so the two implementations
 * still check each other (Gate 7).
 *
 * ─── The guards: they fail the build, never a visitor ──────────────────────
 *
 * The table is parsed when this module loads, and parsing THROWS unless:
 *
 *   - every size from #80 to #1 and from A to Z appears exactly once, in order;
 *   - each series is strictly ascending in diameter;
 *   - the shipped figure is printed by at least two of the three makers;
 *   - a row carries a note exactly when the makers disagree.
 *
 * The pages import this at build time and the tests import it on every run, so
 * a malformed edit fails both before anything is deployed.
 *
 * ─── Units ──────────────────────────────────────────────────────────────────
 *
 * Every figure is a whole number of ten-thousandths of an inch, and one
 * ten-thousandth is exactly 2 540 nm (25 400 000 / 10 000). So every diameter
 * is a whole number of nanometres and nothing is rounded. The decimal is read
 * as an integer count of ten-thousandths, never through a float multiply:
 * `0.1360 * 25_400_000` is 3 454 400.0000000005 in IEEE-754, which `nm()`
 * would rightly refuse as a fractional nanometre.
 */

import table from '../../data/number-letter-drills.csv?raw';
import { type Drill, nm } from './tap-drill';

/** One ten-thousandth of an inch in nanometres: 25 400 000 / 10 000, exactly. */
const NM_PER_TEN_THOUSANDTH = 2_540;

/** The header the table must carry, in this order. */
const HEADER = [
  'series',
  'size',
  'decimal_in',
  'guhring_printed',
  'panam_printed',
  'dormer_printed',
  'note',
] as const;

/** When the three charts were read and compared. */
export const NUMBER_LETTER_CHECKED_ON = '2026-09-27';

/**
 * The three documents every figure was read from, as the pages cite them.
 *
 * Plain strings: the pages validate these through `sourceRef` at build time.
 * Zod is never imported here, because this module reaches the tap drill
 * island (see `schema.ts`).
 */
export const NUMBER_LETTER_SOURCES = [
  {
    label:
      'Guhring — Decimal Equivalents: drill sizes and popular tap drill sizes (catalogue p. 285)',
    url: 'https://guhring.com/media/support/Decimal-Equivalents-drill-sizes-and-popular-tap-drill-sizes.pdf',
    retrieved: NUMBER_LETTER_CHECKED_ON,
  },
  {
    label: 'Pan American Tool — Decimal Equivalents (p. 2)',
    url: 'https://www.panamericantool.com/pdf_catalogs/catalogs/decimal_equivalent_chart.pdf',
    retrieved: NUMBER_LETTER_CHECKED_ON,
  },
  {
    label:
      "Dormer catalogue — Technical Section, Decimal Equivalents (p. 515; a distributor's copy, a 20 MB PDF)",
    url: 'https://cdn.grovesindustrial.com/pdf/sds/Dormer_0626481_Catalog.pdf',
    retrieved: NUMBER_LETTER_CHECKED_ON,
  },
] as const;

/**
 * "0.0135" or ".0135" as a whole count of ten-thousandths: 135.
 *
 * Exactly four decimals or it throws. Dormer prints without the leading zero,
 * the other two with it; both are the same figure.
 */
function tenThousandths(field: string, where: string): number {
  const match = /^(\d*)\.(\d{4})$/.exec(field);
  if (match === null) {
    throw new Error(`${where}: "${field}" is not an inch figure to four decimals`);
  }
  return Number(match[1] === '' ? '0' : match[1]) * 10_000 + Number(match[2]);
}

export interface Parsed {
  readonly number: Drill[];
  readonly letter: Drill[];
}

/** The sizes each series must hold, smallest drill first. */
const NUMBER_ORDER = Array.from({ length: 80 }, (_, i) => `#${80 - i}`);
const LETTER_ORDER = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));

/**
 * The table as drills, or a thrown Error naming the row that broke a guard.
 *
 * Exported so the tests can feed it a corrupted copy and watch each guard
 * fire. The shipped table goes through it once, below, when this module loads.
 */
export function parseNumberLetterTable(text: string): Parsed {
  if (text.includes('"')) {
    // The table has no quoted fields, and this parser does not handle them.
    // Refusing is safer than splitting a quoted comma into a wrong column.
    throw new Error('number-letter-drills.csv: quoted fields are not supported');
  }
  const [head, ...lines] = text.replace(/\r\n/g, '\n').trimEnd().split('\n');
  if (head !== HEADER.join(',')) {
    throw new Error(`number-letter-drills.csv: unexpected header "${head ?? ''}"`);
  }

  const out: Parsed = { number: [], letter: [] };
  for (const line of lines) {
    const cells = line.split(',');
    if (cells.length !== HEADER.length) {
      throw new Error(`number-letter-drills.csv: "${line}" has ${cells.length} fields`);
    }
    const [series, size, shippedField, ...rest] = cells as [
      string,
      string,
      string,
      ...string[],
    ];
    const printedFields = rest.slice(0, 3);
    const note = rest[3] ?? '';
    const where = `number-letter-drills.csv ${size}`;

    const shipped = tenThousandths(shippedField, where);
    const printed = printedFields.map((p) => tenThousandths(p, where));
    const agreeing = printed.filter((p) => p === shipped).length;
    if (agreeing < 2) {
      throw new Error(`${where}: only ${agreeing} of 3 makers print ${shippedField}`);
    }
    if ((agreeing === 3) === (note !== '')) {
      throw new Error(
        agreeing === 3
          ? `${where}: all three makers agree, so the row must carry no note`
          : `${where}: the makers disagree, so the row must say so in its note`,
      );
    }

    const drill: Drill = {
      nm: nm(shipped * NM_PER_TEN_THOUSANDTH),
      label: size,
      series: series === 'NUMBER' ? 'number' : 'letter',
      ...(note === '' ? {} : { note }),
    };
    if (series === 'NUMBER') out.number.push(drill);
    else if (series === 'LETTER') out.letter.push(drill);
    else throw new Error(`${where}: unknown series "${series}"`);
  }

  requireSeries(out.number, NUMBER_ORDER, 'number drills');
  requireSeries(out.letter, LETTER_ORDER, 'letter drills');
  return out;
}

/** Exactly these sizes, in this order, each strictly larger than the last. */
function requireSeries(
  drills: readonly Drill[],
  order: readonly string[],
  name: string,
): void {
  const labels = drills.map((d) => d.label).join(' ');
  if (labels !== order.join(' ')) {
    throw new Error(`${name}: expected ${order.join(' ')}, got ${labels}`);
  }
  for (let i = 1; i < drills.length; i++) {
    const smaller = drills[i - 1];
    const larger = drills[i];
    if (smaller === undefined || larger === undefined || larger.nm <= smaller.nm) {
      throw new Error(`${name}: not strictly ascending at ${larger?.label ?? i}`);
    }
  }
}

const PARSED = parseNumberLetterTable(table);

/** #80 (0.0135 in) to #1 (0.2280 in), smallest first. */
export const NUMBER_DRILLS: readonly Drill[] = PARSED.number;

/** A (0.2340 in) to Z (0.4130 in), smallest first. J and M carry a note. */
export const LETTER_DRILLS: readonly Drill[] = PARSED.letter;
