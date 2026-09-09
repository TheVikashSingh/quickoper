#!/usr/bin/env node
/**
 * Every tool and derivation page must appear in /llms.txt.
 *
 * WHY THIS EXISTS. `/biweekly-mortgage-payments` shipped in D58 and was absent
 * from llms.txt for two pull requests — so the page most likely to be quoted for
 * a fortnightly-payments question was invisible to the file that exists to serve
 * exactly that. D61 recorded it as a known gap and explicitly declined to build
 * the gate at the time. This is that gate.
 *
 * It is the fourth time a page has existed without appearing where something
 * looks for it: D41 (orphaned from the navigation), D50 (absent from the
 * homepage's own calculator list), D61 (absent from llms.txt). Three of those
 * were found by a human noticing. Twice is a pattern; four times is a gate.
 *
 * WHY IT MATTERS MORE THAN IT LOOKS. CLAUDE.md treats AI assistants as a
 * first-class traffic channel, on the reasoning that retrieval systems weight
 * structure and specificity far above backlink profile — the one axis where a
 * new domain is not automatically last. llms.txt is the whole of that surface.
 * A page missing from it is not merely untidy; it is absent from the channel
 * this site is best positioned to win.
 *
 * ─── The check fails SAFE ───────────────────────────────────────────────────
 *
 * Requirement is the default. Every URL the sitemap carries must have a
 * `URL:` line in llms.txt unless it is explicitly exempted below. Add a page and
 * forget, and this fails loudly naming it; the alternative — an allow-list of
 * pages to check — would silently check nothing for anything newly added, which
 * is precisely how the original defect survived.
 *
 * WHAT IS EXEMPT, and why each one. Navigation and trust pages carry no computed
 * figures for a retrieval system to quote. `/methodology`, `/about` and
 * `/contact` are already linked from llms.txt as prose rather than catalogued as
 * tools, which is the right shape for them.
 */

import { readFile, stat } from 'node:fs/promises';

import { SITE_LEVEL, VERTICAL_TRUST, VERTICALS } from '../src/lib/catalogue.ts';

const SITEMAP = 'dist/sitemap-0.xml';
const LLMS = 'public/llms.txt';

/**
 * Paths that need no catalogue entry: the site-level pages, plus every
 * vertical's hub. Both come from the registry.
 *
 * This was a hand-written list that named `/finance` and nothing else. It was
 * written when finance was the only vertical, so `/machining` was never
 * exempted — the machining hub was *required* to have an entry while the
 * finance hub was forbidden from needing one, for no reason anybody chose.
 * `/apps` was missing from it too. Neither showed as a failure, because both
 * pages happen to carry entries; the list was simply wrong in a direction that
 * did not bite yet.
 *
 * A hub needs no entry because every tool under it is catalogued individually,
 * and that reasoning is a property of being a hub — not of being `/finance`.
 */
const EXEMPT = new Set([
  ...SITE_LEVEL.map((path) => (path === '/' ? '' : path)),
  ...VERTICALS.map((v) => v.hub),
  ...VERTICAL_TRUST,
]);

const exists = async (p) => {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
};

if (!(await exists(SITEMAP))) {
  console.error(`FAIL: ${SITEMAP} not found. Run \`npm run build\` first.`);
  process.exit(1);
}

const sitemap = await readFile(SITEMAP, 'utf8');
const llms = await readFile(LLMS, 'utf8');

const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => url);

if (urls.length === 0) {
  console.error(
    `FAIL: ${SITEMAP} listed no URLs. That is a build problem, not a docs one.`,
  );
  process.exit(1);
}

/** Catalogue entries, exactly as llms.txt writes them. */
const listed = new Set(
  [...llms.matchAll(/^URL:\s*(\S+)\s*$/gm)].map(([, url]) => url.replace(/\/$/, '')),
);

const missing = [];
const checked = [];

for (const url of urls) {
  const path = new URL(url).pathname.replace(/\/$/, '');
  if (EXEMPT.has(path)) continue;
  checked.push(path);
  if (!listed.has(url.replace(/\/$/, ''))) missing.push(path);
}

/**
 * The reverse direction too: an entry pointing at a page the build no longer
 * produces is a dead citation, and a retrieval system following it gets a 404
 * with this site's name on it.
 */
const built = new Set(urls.map((u) => u.replace(/\/$/, '')));
const stale = [...listed].filter((u) => !built.has(u));

if (missing.length > 0 || stale.length > 0) {
  console.error(`FAIL: ${missing.length + stale.length} llms.txt problem(s):\n`);
  for (const path of missing) {
    console.error(`    ${path} is in the sitemap but has no URL: entry in llms.txt`);
  }
  for (const url of stale) {
    console.error(`    ${url} is listed in llms.txt but the build no longer produces it`);
  }
  console.error('');
  console.error('  Every tool and derivation page needs a catalogue entry: what it');
  console.error('  computes, its inputs, its jurisdiction, and the key figures. A page');
  console.error('  missing from llms.txt is absent from the AI retrieval channel.');
  console.error(
    '  If a page genuinely needs no entry, add its path to EXEMPT and say why.',
  );
  process.exit(1);
}

console.log(
  `PASS: llms.txt catalogues all ${checked.length} tool and derivation page(s); no stale entries.`,
);
