#!/usr/bin/env node
/**
 * Client JavaScript byte budget, measured PER PAGE (CLAUDE.md rule 9).
 *
 * This is the HARD gate, not Lighthouse. Lighthouse is non-deterministic in CI
 * and will collapse once ad scripts load regardless; a byte count is neither.
 *
 * Budget: 15KB gzipped per page. Achievable with Preact (~5KB core). NOT
 * achievable with React, whose runtime is ~45KB gzipped before a line of our
 * code â€” which is why the framework choice is not a preference.
 *
 * WHY THE MODULE GRAPH AND NOT `du dist/**\/*.js`:
 * Astro emits the Preact renderer chunks whenever the integration is
 * registered, whether or not a given page hydrates anything. Summing every
 * emitted file charges an article page ~10KB it never downloads. The number
 * that matters is what a browser actually fetches for one URL, so we start at
 * each HTML file's real entry points and follow static imports transitively.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { dirname, join, relative, resolve, sep } from 'node:path';

const DIST = 'dist';
const BUDGET_BYTES = 15 * 1024;

/**
 * Entry points a browser fetches.
 *
 * The last two matter more than they look. Astro does NOT reference a hydrated
 * island with a `<script src>` — it emits `<astro-island component-url="…"
 * renderer-url="…">` and fetches those at hydration time. A budget check that
 * only looks at script tags therefore reports an island-bearing page as costing
 * the same as a static one, which is worse than having no check at all: it
 * reports a comfortable pass while the real payload goes unmeasured.
 */
const ENTRY_PATTERNS = [
  /<script[^>]+type=["']module["'][^>]+src=["']([^"']+)["']/g,
  /<link[^>]+rel=["']modulepreload["'][^>]+href=["']([^"']+)["']/g,
  /<astro-island[^>]+component-url=["']([^"']+)["']/g,
  /<astro-island[^>]+renderer-url=["']([^"']+)["']/g,
];

/** Static imports inside bundled ESM: `from"./x.js"`, `import"./x.js"`. */
const IMPORT_PATTERN = /(?:\bfrom|\bimport)\s*\(?\s*["']([^"']+\.js)["']/g;

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

/** Resolve a URL or relative specifier to a path inside dist. */
function resolveAsset(spec, importerDir) {
  if (/^https?:\/\//.test(spec)) return null; // external, not our budget
  if (spec.startsWith('/')) return join(DIST, spec.slice(1));
  return resolve(importerDir, spec);
}

/** Transitive closure of static imports from a set of entry points. */
async function moduleGraph(entries) {
  const seen = new Set();
  const queue = [...entries];

  while (queue.length > 0) {
    const file = queue.pop();
    if (file === null || seen.has(file) || !(await exists(file))) continue;
    seen.add(file);

    const code = await readFile(file, 'utf8');
    for (const [, spec] of code.matchAll(IMPORT_PATTERN)) {
      const next = resolveAsset(spec, dirname(file));
      if (next !== null && !seen.has(next)) queue.push(next);
    }
  }
  return seen;
}

// â”€â”€ main â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

if (!(await exists(DIST))) {
  console.error(`âœ— ${DIST}/ not found. Run \`npm run build\` first.`);
  process.exit(1);
}

const pages = await walk(DIST, (name) => name.endsWith('.html'));

if (pages.length === 0) {
  console.error('âœ— No HTML found in dist/. The build produced nothing to measure.');
  process.exit(1);
}

const gzipCache = new Map();
const gzipSize = async (file) => {
  if (!gzipCache.has(file)) gzipCache.set(file, gzipSync(await readFile(file)).length);
  return gzipCache.get(file);
};

const results = [];

for (const page of pages) {
  const html = await readFile(page, 'utf8');
  const pageDir = dirname(page);

  const entries = [];
  for (const pattern of ENTRY_PATTERNS) {
    for (const [, src] of html.matchAll(pattern))
      entries.push(resolveAsset(src, pageDir));
  }

  const graph = await moduleGraph(entries.filter((e) => e !== null));

  let bytes = 0;
  for (const file of graph) bytes += await gzipSize(file);

  results.push({
    url:
      '/' +
      relative(DIST, page)
        .split(sep)
        .join('/')
        .replace(/index\.html$/, ''),
    bytes,
    modules: graph.size,
  });
}

results.sort((a, b) => b.bytes - a.bytes);

const kb = (n) => `${(n / 1024).toFixed(2)} KB`;
const pad = Math.max(6, ...results.map((r) => r.url.length));

console.log(`Client JavaScript per page, gzipped (budget ${kb(BUDGET_BYTES)}):\n`);
for (const r of results) {
  const flag = r.bytes > BUDGET_BYTES ? 'âœ—' : ' ';
  const mods =
    r.modules === 0 ? 'no JS' : `${r.modules} module${r.modules === 1 ? '' : 's'}`;
  console.log(`${flag} ${r.url.padEnd(pad)}  ${kb(r.bytes).padStart(9)}   ${mods}`);
}

const over = results.filter((r) => r.bytes > BUDGET_BYTES);

if (over.length > 0) {
  console.error(`\nâœ— ${over.length} page(s) over the ${kb(BUDGET_BYTES)} budget.`);
  console.error('');
  console.error('  CLAUDE.md rule 9: if a change breaks this, it is the wrong change.');
  console.error('  Do not raise the budget. Find what got added and remove it.');
  process.exit(1);
}

const worst = results[0];
console.log(
  `\nâœ“ All ${results.length} page(s) within budget. ` +
    `Worst: ${worst.url} at ${kb(worst.bytes)} â€” ${kb(BUDGET_BYTES - worst.bytes)} headroom.`,
);
