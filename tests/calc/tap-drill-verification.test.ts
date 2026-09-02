import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ENGAGEMENT_K,
  engagementPercentExact,
  MINOR_DIA_K,
  inchToNm,
  mmToNm,
  roundHalfEven,
  tpiToPitchNm,
} from '../../src/lib/calc/tap-drill';

/**
 * The provenance gate.
 *
 * ─── What problem this solves ───────────────────────────────────────────────
 *
 * The arithmetic in `tap-drill.ts` is checkable: it either satisfies its own
 * inverse or it does not. The REFERENCE DATA is not. A tap drill diameter is a
 * fact about the world, and no amount of testing proves that 6.8 mm is the
 * published drill for M8 — it only proves that whoever typed 6.8 was consistent
 * with themselves.
 *
 * That is the single largest correctness risk in this tool. A wrong drill size
 * scraps a part, and the person it hurts is a machinist who trusted us.
 *
 * ─── How the gate works ─────────────────────────────────────────────────────
 *
 * Every row of `tests/fixtures/golden-tap-drill.csv` carries two columns that
 * no code can fill in:
 *
 *   claimed_source    where the value is BELIEVED to come from
 *   verified_against  the catalogue a HUMAN opened, or the literal PENDING
 *   verified_on       ISO date of that check
 *
 * `PENDING` means: plausible, internally consistent, and NOT YET CHECKED
 * against a primary source by a person. Rows in that state must never reach a
 * shipped page.
 *
 * The count of PENDING rows is capped by `MAX_PENDING` below, and that number
 * may only ever be REDUCED. It is a ratchet: verification can progress, and
 * cannot silently regress. When it reaches zero the constant goes with it and
 * the gate becomes absolute.
 *
 * ─── Why the count starts at the full table ─────────────────────────────────
 *
 * Honesty. These values were generated from a model's recollection of the
 * standard tap drill tables. They are almost certainly right — M4 → 3.3 and
 * M8 → 6.8 are about as settled as machining data gets — but "almost certainly
 * right" is exactly the state this project exists to refuse. Verifying 18 rows
 * against two free manufacturer catalogue PDFs is well under an hour of one
 * person's time, once, and after that the numbers belong to us.
 */

const CSV_PATH = fileURLToPath(
  new URL('../fixtures/golden-tap-drill.csv', import.meta.url),
);

/**
 * Rows still awaiting a human check against a primary source.
 *
 * MAY ONLY BE REDUCED. Raising it is the one change to this file that should
 * never pass review — it would mean unverified data was added, which is the
 * exact failure the gate exists to prevent.
 */
const MAX_PENDING = 18;

interface GoldenRow {
  thread: string;
  system: 'metric' | 'unified_inch';
  major: number;
  pitchOrTpi: number;
  tapDrill: number;
  drillLabel: string;
  engagementPct: number;
  claimedSource: string;
  verifiedAgainst: string;
  verifiedOn: string;
}

function loadGolden(): GoldenRow[] {
  const [, ...lines] = readFileSync(CSV_PATH, 'utf8').trim().split('\n');
  return lines.map((line) => {
    const c = line.split(',');
    const at = (i: number): string => c[i] ?? '';
    return {
      thread: at(0),
      system: at(1) as GoldenRow['system'],
      major: Number(at(2)),
      pitchOrTpi: Number(at(3)),
      tapDrill: Number(at(4)),
      drillLabel: at(5),
      engagementPct: Number(at(6)),
      claimedSource: at(7),
      verifiedAgainst: at(8),
      verifiedOn: at(9),
    };
  });
}

/** A row is shippable only once a person has checked it against a source. */
export function isVerified(row: GoldenRow): boolean {
  return row.verifiedAgainst.trim() !== '' && row.verifiedAgainst.trim() !== 'PENDING';
}

const GOLDEN = loadGolden();

describe('golden fixture integrity', () => {
  it('loads every row', () => {
    expect(GOLDEN.length).toBe(18);
  });

  it('gives every row a claimed source', () => {
    for (const row of GOLDEN) {
      expect(row.claimedSource.trim(), `${row.thread} has no claimed_source`).not.toBe(
        '',
      );
    }
  });

  it('marks every row either verified or explicitly PENDING', () => {
    // A blank verified_against is ambiguous — it could mean "not checked" or
    // "someone deleted the note". Force the ambiguity to be written down.
    for (const row of GOLDEN) {
      const v = row.verifiedAgainst.trim();
      expect(v, `${row.thread} has a blank verified_against`).not.toBe('');
    }
  });

  it('dates every verified row', () => {
    for (const row of GOLDEN.filter(isVerified)) {
      expect(row.verifiedOn, `${row.thread} is verified but undated`).toMatch(
        /^\d{4}-\d{2}-\d{2}$/,
      );
    }
  });
});

describe('the provenance ratchet', () => {
  it('has no more unverified rows than the committed ceiling', () => {
    const pending = GOLDEN.filter((r) => !isVerified(r));
    const names = pending.map((r) => r.thread).join(', ');
    expect(
      pending.length,
      `${pending.length} rows await verification against a primary source: ${names}. ` +
        'Check them against a manufacturer tap catalogue (Emuge, Guhring, OSG), ' +
        'write the catalogue name into verified_against and the date into ' +
        'verified_on, then LOWER MAX_PENDING to match.',
    ).toBeLessThanOrEqual(MAX_PENDING);
  });

  it('never lets the ceiling drift above the table size', () => {
    // Guards against MAX_PENDING being raised to silence the gate.
    expect(MAX_PENDING).toBeLessThanOrEqual(GOLDEN.length);
  });
});

describe('the arithmetic agrees with the fixture', () => {
  // This is the half that CAN be proven. It checks our implementation against
  // the recorded engagement column — it does NOT check that the drill sizes
  // themselves are right. Only a human with a catalogue does that.
  it.each(GOLDEN)('$thread on $drillLabel gives $engagementPct %', (row) => {
    // The ROUNDING conversions on purpose — these are the ones the page calls.
    // At micrometres they moved the published second decimal on the inch rows
    // (#8-32 read 69.03 against a true 68.97). In nanometres an inch diameter
    // is exact and this passes through the shipped path. See D72.
    const majorNm = row.system === 'metric' ? mmToNm(row.major) : inchToNm(row.major);
    const pitchNm =
      row.system === 'metric' ? mmToNm(row.pitchOrTpi) : tpiToPitchNm(row.pitchOrTpi);
    const drillNm =
      row.system === 'metric' ? mmToNm(row.tapDrill) : inchToNm(row.tapDrill);
    const actual = engagementPercentExact(majorNm, pitchNm, drillNm);
    expect(roundHalfEven(actual, 2)).toBeCloseTo(row.engagementPct, 2);
  });

  it('uses the documented engagement constant', () => {
    // If someone tunes K to make a fixture pass, this fails first and loudly.
    // K is 3√3/4, derived from ISO 68-1's H = (√3/2)P. NOT the trade's rounded
    // 1.299, which moves the published second decimal on three of these rows.
    expect(ENGAGEMENT_K).toBeCloseTo(1.2990381056766578, 12);
    expect(ENGAGEMENT_K).not.toBe(1.299);
  });

  it('derives both constants from one H, so D₁ is exactly 83⅓ % engagement', () => {
    // The ratio is (5/8)/(3/4) = 5/6 with H cancelling — pure geometry, true
    // for any H. It holds only while BOTH constants come from the SAME H;
    // mixing two roundings drifts it to 83.331 %, which is the specific
    // mistake the truncated 1.299/1.0825 pair used to justify itself.
    expect((100 * MINOR_DIA_K) / ENGAGEMENT_K).toBeCloseTo(100 * (5 / 6), 10);
  });
});
