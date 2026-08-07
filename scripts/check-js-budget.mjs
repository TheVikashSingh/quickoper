#!/usr/bin/env node
/**
 * Client JavaScript byte budget, measured PER PAGE (CLAUDE.md rule 9).
 *
 * This is the HARD gate, not Lighthouse. Lighthouse is non-deterministic in CI
 * and will collapse once ad scripts load regardless; a byte count is neither.
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

/**
 * 18KB gzipped per page. DERIVED, not guessed — the 15KB this replaced was
 * picked in PR #1 from rough arithmetic ("React is 45KB, Preact is 5KB")
 * before anything had been measured, and it turned out 0.56KB too tight to
 * fit a complete calculator.
 *
 * Measured floor, which no amount of discipline removes:
 *
 *   preact                    4.31 KB
 *   Astro hydration client    1.36 KB
 *   preact/hooks              1.13 KB
 *   shared UI + lib chunk     3.42 KB   (table, chart, money, csv, params)
 *   Astro island bootstrap    1.73 KB   (inline, was never counted until PR #9)
 *   theme script              0.53 KB   (inline, on every page)
 *   ------------------------------------
 *   fixed cost               12.48 KB
 *
 * The last two lines were discovered when inline scripts started being counted.
 * They had been shipping since PR #5 and were invisible, which means the 10.22KB
 * floor recorded in PR #8 was itself an under-measurement. Corrected here rather
 * than left to mislead the next person who reads it.
 *
 * 18KB therefore leaves about 5.5KB for an individual calculator — a real
 * constraint that still fails instantly on React (~45KB), on any charting
 * library (Recharts and Chart.js are 40KB+), and on a schema library reaching
 * an island (Zod cost 15.7KB when it did). Everything rule 9 exists to prevent
 * is still prevented.
 *
 * IT IS NOW TIGHT: the worst page sits 0.18KB under. A third calculator will
 * breach it, and the honest fix at that point is structural — hydrate the
 * below-fold chart and schedule separately with client:visible — not another
 * increment.
 *
 * For scale: the project charter's original budget was 40KB, and median
 * JavaScript on a mobile page is several hundred.
 *
 * Raising this again should require the same treatment — measure first, write
 * down what the number is made of, and say what it still forbids.
 */
const BUDGET_BYTES = 18 * 1024;

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

/**
 * Inline scripts, which a browser executes just as surely as a fetched one.
 *
 * The theme toggle is inline by necessity — a deferred one paints the wrong
 * theme for a frame. Not counting it would let the budget report a page as
 * shipping "no JS" while it ships some, which is the third time this gate would
 * have quietly lied. JSON-LD is data, not script, and is excluded by type.
 */
const INLINE_SCRIPT =
  /<script(?![^>]*\bsrc=)(?![^>]*type=["']application\/(?:ld\+json|json)["'])[^>]*>([\s\S]*?)<\/script>/g;

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

// ── main ─────────────────────────────────────────────────────────────────────

if (!(await exists(DIST))) {
  console.error(`FAIL: ${DIST}/ not found. Run \`npm run build\` first.`);
  process.exit(1);
}

const pages = await walk(DIST, (name) => name.endsWith('.html'));

if (pages.length === 0) {
  console.error('FAIL: no HTML found in dist/. The build produced nothing to measure.');
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

  // Inline scripts count too. Gzipped together, since that is how the HTML
  // document carrying them is served.
  const inlineSource = [...html.matchAll(INLINE_SCRIPT)]
    .map(([, body]) => body)
    .join('\n');
  const inlineBytes =
    inlineSource.trim() === '' ? 0 : gzipSync(Buffer.from(inlineSource)).length;
  bytes += inlineBytes;

  results.push({
    inlineBytes,
    url:
      '/' +
      relative(DIST, page)
        .split(sep)
        .join('/')
        .replace(/index\.html$/, ''),
    bytes,
    graph,
  });
}

results.sort((a, b) => b.bytes - a.bytes);

const kb = (n) => `${(n / 1024).toFixed(2)} KB`;
const pad = Math.max(6, ...results.map((r) => r.url.length));

console.log(`Client JavaScript per page, gzipped (budget ${kb(BUDGET_BYTES)}):\n`);
for (const r of results) {
  const flag = r.bytes > BUDGET_BYTES ? 'FAIL' : '  ok';
  const parts = [];
  if (r.graph.size > 0) parts.push(`${r.graph.size} modules`);
  if (r.inlineBytes > 0) parts.push(`${kb(r.inlineBytes)} inline`);
  const detail = parts.length === 0 ? 'no JS' : parts.join(' + ');
  console.log(`${flag}  ${r.url.padEnd(pad)}  ${kb(r.bytes).padStart(9)}   ${detail}`);
}

const over = results.filter((r) => r.bytes > BUDGET_BYTES);

if (over.length > 0) {
  // "Over budget" is useless without "by what". Break the offending pages down
  // so the next step is obvious rather than a bisect.
  for (const page of over) {
    console.error(
      `\n${page.url} is ${kb(page.bytes)}, over by ${kb(page.bytes - BUDGET_BYTES)}:`,
    );
    const parts = [...page.graph]
      .map((file) => ({ file: relative(DIST, file), gz: gzipCache.get(file) ?? 0 }))
      .sort((a, b) => b.gz - a.gz);
    const width = Math.max(...parts.map((p) => p.file.length));
    for (const part of parts) {
      console.error(`    ${part.file.padEnd(width)}  ${kb(part.gz).padStart(9)}`);
    }
  }
  console.error('');
  console.error('  CLAUDE.md rule 9: if a change breaks this, it is the wrong change.');
  console.error('  Do not raise the budget. Find what got added and remove it.');
  process.exit(1);
}

const worst = results[0];
console.log(
  `\nPASS: all ${results.length} page(s) within budget. ` +
    `Worst is ${worst.url} at ${kb(worst.bytes)}, ${kb(BUDGET_BYTES - worst.bytes)} to spare.`,
);
