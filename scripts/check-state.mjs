#!/usr/bin/env node
/**
 * Does docs/STATE.md still describe the site the build actually produces?
 *
 * STATE.md claimed **11 pages for two pull requests**. The build has produced
 * ten since PR #5. The figure was not stale — `git log -S` puts its
 * introduction at PR #11, and the tree at that commit already had exactly the
 * ten route files it has now. It was wrong on the day it was typed.
 *
 * The reason it survived is the part worth fixing. Every other number in that
 * Status table is printed by a gate — the test count by Vitest, the byte
 * figures by check-js-budget — and each of those was correct. The page count
 * was typed by hand, and it was the only wrong one. A number nothing checks is
 * a number that drifts, and STATE.md is the file a new session trusts before it
 * has any way to know better. Stale handoff notes are worse than none, because
 * they are believed.
 *
 * WHAT THIS CHECKS: the counts, everywhere they appear — the Status table, the
 * AdSense readiness table, and the prose in Next. The same number stated three
 * times in three formats is three chances to update two of them.
 *
 * WHAT IT DOES NOT CHECK, deliberately:
 *
 *   - The JS byte figures. They are derivable, but only by importing
 *     check-js-budget's module-graph measurement, and destabilising the
 *     project's most safety-critical gate to police a doc is a bad trade.
 *
 *     This gap has since cost something: D10 and the budget gate's own header
 *     both quoted 0.18KB of headroom for two pull requests while the measured
 *     figure was 0.08KB. Corrected in the pull request that added D28. Worth
 *     closing properly — the cheap version is to assert STATE.md's row from
 *     inside check-js-budget.mjs, where the number already exists.
 *   - The test count, which needs an actual test run rather than a look at
 *     dist/.
 *   - "Live?" and "CI gates", which are prose, not counts.
 *
 * A NOTE ON THE MISSING-CLAIM FAILURE: if a pattern below matches nothing, that
 * is a failure too, not a pass. Otherwise rewording a sentence silently retires
 * the check on it, and the gate reports success over a claim it stopped reading
 * — which is exactly how the byte budget once reported an island page at
 * 1.09 KB.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const DIST = 'dist';
const STATE = 'docs/STATE.md';

/** The AdSense threshold STATE.md measures itself against. */
const SUBSTANTIVE_TARGET = 15;

const NUMBER_WORDS = [
  'none',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
];

async function walk(dir, predicate, found = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, predicate, found);
    else if (predicate(entry.name)) found.push(full);
  }
  return found;
}

const exists = async (p) => {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
};

// ── What the build actually produced ─────────────────────────────────────────

if (!(await exists(DIST))) {
  console.error(`FAIL: ${DIST}/ not found. Run \`npm run build\` first.`);
  process.exit(1);
}

const pageFiles = await walk(DIST, (name) => name.endsWith('.html'));

if (pageFiles.length === 0) {
  console.error('FAIL: no HTML in dist/. The build produced nothing to describe.');
  process.exit(1);
}

const routes = pageFiles.map(
  (file) =>
    '/' +
    relative(DIST, file)
      .split(sep)
      .join('/')
      .replace(/index\.html$/, ''),
);

const built = routes.length;

/**
 * `/404` is excluded from the substantive count (D27). It is an error page, it
 * is correctly absent from the sitemap under D26, and counting it toward
 * "15+ substantive pages" would claim credit for a page nobody reaches on
 * purpose.
 */
const substantive = routes.filter((route) => route !== '/404.html').length;

const calculators = routes.filter((route) =>
  /^\/finance\/[^/]+-calculator\/$/.test(route),
).length;

const gap = SUBSTANTIVE_TARGET - substantive;
const gapWord = NUMBER_WORDS[gap] ?? String(gap);

// ── What STATE.md says ───────────────────────────────────────────────────────

if (!(await exists(STATE))) {
  console.error(`FAIL: ${STATE} not found.`);
  process.exit(1);
}

const md = await readFile(STATE, 'utf8');

/**
 * Each claim is a sentence in STATE.md that asserts a number this script can
 * derive. Capture groups are compared positionally against `expect`, as
 * strings, case-insensitively — "Six more needed" opens a sentence.
 */
const claims = [
  {
    where: 'Status table — pages built and substantive',
    re: /\| Pages built \| (\d+) \((\d+) substantive/,
    expect: [String(built), String(substantive)],
  },
  {
    where: 'Status table — working calculators',
    re: /\| Working calculators \| (\d+) \|/,
    expect: [String(calculators)],
  },
  {
    where: 'AdSense table — substantive pages and the gap',
    re: /\| 15\+ substantive pages \| \*\*(\d+)\*\* — (\w+) to go \|/,
    expect: [String(substantive), gapWord],
  },
  {
    where: 'Next — how many more content pages are needed',
    re: /for AdSense\. (\w+) more needed/,
    expect: [gapWord],
  },
  {
    where: 'Next — pages the build produces',
    re: /the build produces (\d+) pages/,
    expect: [String(built)],
  },
  {
    where: 'Next — how many of those are substantive',
    re: /of which (\d+) are substantive/,
    expect: [String(substantive)],
  },
];

const problems = [];

for (const claim of claims) {
  const matches = [...md.matchAll(new RegExp(claim.re, 'g'))];

  if (matches.length === 0) {
    problems.push({
      where: claim.where,
      detail:
        'claim not found — it was reworded or removed, so this check stopped ' +
        'reading it. Update the pattern in scripts/check-state.mjs.',
    });
    continue;
  }

  for (const match of matches) {
    claim.expect.forEach((want, i) => {
      const got = match[i + 1] ?? '';
      if (got.toLowerCase() !== want.toLowerCase()) {
        problems.push({
          where: claim.where,
          detail: `says "${got}", build says "${want}"`,
        });
      }
    });
  }
}

// ── Report ───────────────────────────────────────────────────────────────────

if (problems.length > 0) {
  console.error(
    `FAIL: ${STATE} disagrees with the build in ${problems.length} place(s):\n`,
  );
  const width = Math.max(...problems.map((p) => p.where.length));
  for (const problem of problems) {
    console.error(`    ${problem.where.padEnd(width)}   ${problem.detail}`);
  }
  console.error('\n  The build produced:\n');
  console.error(`    ${built} pages, ${substantive} substantive (/404 is not)`);
  console.error(`    ${calculators} working calculator(s)`);
  console.error(
    `    ${gap} more substantive page(s) to reach ${SUBSTANTIVE_TARGET} — "${gapWord} to go"`,
  );
  console.error('');
  console.error('  Fix STATE.md, not this script. It is the file a new session believes');
  console.error('  before it has any way to know better.');
  process.exit(1);
}

console.log(
  `PASS: ${STATE} matches the build — ${built} page(s), ${substantive} substantive, ` +
    `${calculators} calculator(s), ${gapWord} to go.`,
);
