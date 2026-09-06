/**
 * `docs/DECISIONS.md` numbering must be complete and unique.
 *
 * ─── Why this exists ────────────────────────────────────────────────────────
 *
 * D77 and D78 were written, reviewed, merged — and then silently deleted from
 * main by the two pull requests that merged after them.
 *
 * The mechanism is worth understanding, because it will happen again. Every
 * branch appends its entry at the same place, just above D28. Three PRs were
 * open at once, each branched before the others landed. They were squash-merged
 * in sequence, and each conflict resolution took its own branch's version of the
 * file wholesale — which did not contain the entry the previous merge had just
 * added. The code survived, because each PR's code lived in different files.
 * The decisions did not, because they all live in one.
 *
 * Nothing failed. Tests passed, every other gate passed, and two of the most
 * substantive findings in the project ended up as code with no recorded reason.
 * That is precisely the failure `docs/DECISIONS.md` exists to prevent: "a
 * decision that took an afternoon to reach is not undone in five minutes by
 * someone who only sees the rule."
 *
 * ─── What is asserted ───────────────────────────────────────────────────────
 *
 * The numbers run 1..N with no gaps and no duplicates. That is a stronger claim
 * than it looks: an entry cannot vanish without leaving a hole, and two branches
 * cannot both claim the next number without colliding. Both are exactly the
 * failures that happen when several PRs are open at once.
 *
 * Deliberately NOT asserted: that entries appear in ascending order in the file.
 * They do not — the file groups by theme, and the numbers are chronological
 * within groups. Requiring sorted order would fail on a structure that is
 * intentional.
 *
 * This gate is offline and deterministic, so unlike `check-sources.mjs` it runs
 * in CI.
 */

import { readFile } from 'node:fs/promises';

const FILE = 'docs/DECISIONS.md';
const HEADING = /^### D(\d+) — /gm;

const text = await readFile(FILE, 'utf8');

const numbers = [...text.matchAll(HEADING)].map((m) => Number(m[1]));

if (numbers.length === 0) {
  console.error(`FAIL: no decision headings found in ${FILE}.`);
  console.error('  Expected headings of the form "### D12 — Title".');
  process.exit(1);
}

const seen = new Map();
const duplicates = [];
for (const n of numbers) {
  const count = (seen.get(n) ?? 0) + 1;
  seen.set(n, count);
  if (count === 2) duplicates.push(n);
}

const highest = Math.max(...numbers);
const missing = [];
for (let n = 1; n <= highest; n++) if (!seen.has(n)) missing.push(n);

const problems = [];
if (missing.length > 0) {
  problems.push(
    `${missing.length} missing: ${missing.map((n) => `D${n}`).join(', ')}\n` +
      '      An entry that was merged and then vanished is the squash-merge\n' +
      '      collision described at the top of this script. Recover it from the\n' +
      '      branch that added it:  git show <sha>:docs/DECISIONS.md',
  );
}
if (duplicates.length > 0) {
  problems.push(
    `${duplicates.length} duplicated: ${duplicates.map((n) => `D${n}`).join(', ')}\n` +
      '      Two branches claimed the same number. Renumber the later one.',
  );
}

if (problems.length > 0) {
  console.error(`FAIL: ${FILE} numbering is broken.\n`);
  for (const p of problems) console.error(`    ${p}\n`);
  process.exit(1);
}

console.log(
  `PASS: ${FILE} — ${numbers.length} decisions, D1 to D${highest}, none missing or duplicated.`,
);
