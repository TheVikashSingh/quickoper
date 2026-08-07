#!/usr/bin/env node
/**
 * Internal link checker.
 *
 * Six links in the site-wide navigation and footer — /about, /contact,
 * /finance, /methodology, /privacy, /terms — were 404s on EVERY page for three
 * pull requests before anyone noticed. Nothing failed, because nothing was
 * checking.
 *
 * A dead link in a footer is not cosmetic here. "Clear navigation, every page
 * reachable within two clicks" and "no placeholder pages" are explicit AdSense
 * approval criteria, and a site whose own links do not work undercuts the one
 * claim it is making about carefulness.
 *
 * So: every internal href in the built output must resolve to a real file.
 * External links, mailto and fragments are out of scope — we cannot verify
 * those offline and a network check in CI would be flaky.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const DIST = 'dist';

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

/**
 * Does this internal path resolve to something in the build?
 *
 * Astro's directory build format writes /about to dist/about/index.html, so
 * both shapes are accepted, plus bare files like /sitemap-index.xml.
 */
async function resolves(pathname) {
  const clean = pathname.replace(/^\//, '').replace(/\/$/, '');
  if (clean === '') return exists(join(DIST, 'index.html'));

  const candidates = [
    join(DIST, clean, 'index.html'),
    join(DIST, `${clean}.html`),
    join(DIST, clean),
  ];
  for (const candidate of candidates) if (await exists(candidate)) return true;
  return false;
}

const HREF = /(?:href|src)=["'](\/[^"']*)["']/g;

if (!(await exists(DIST))) {
  console.error(`FAIL: ${DIST}/ not found. Run \`npm run build\` first.`);
  process.exit(1);
}

const pages = await walk(DIST, (name) => name.endsWith('.html'));
const broken = [];
const checked = new Set();
let total = 0;

for (const page of pages) {
  const html = await readFile(page, 'utf8');
  const from =
    '/' +
    relative(DIST, page)
      .split(sep)
      .join('/')
      .replace(/index\.html$/, '');

  for (const [, raw] of html.matchAll(HREF)) {
    // Drop fragments and queries; neither changes which file is served.
    const pathname = (raw.split('#')[0] ?? '').split('?')[0] ?? '';
    if (pathname === '') continue;

    total += 1;
    const key = pathname;
    if (checked.has(key)) continue;
    checked.add(key);

    if (!(await resolves(pathname))) broken.push({ from, pathname });
  }
}

// ── Indexability ─────────────────────────────────────────────────────────────
//
// The homepage shipped with `noindex` for six pull requests. It was set in PR #5
// when the site had two pages, and nothing ever removed it — so at launch the
// single most important page would have been silently invisible to Google.
//
// The invariant: a page is either in the sitemap and indexable, or noindex and
// out of it. Anything else is a contradictory signal, and the failure mode is
// silence rather than an error.

const sitemapPath = join(DIST, 'sitemap-0.xml');
const sitemapXml = (await exists(sitemapPath)) ? await readFile(sitemapPath, 'utf8') : '';
const submitted = new Set(
  [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) =>
    (url ?? '').replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, ''),
  ),
);

const contradictions = [];

for (const page of pages) {
  const html = await readFile(page, 'utf8');
  const route = ('/' + relative(DIST, page).split(sep).join('/'))
    .replace(/index\.html$/, '')
    .replace(/\/$/, '');

  const isNoindex = /name=["']robots["'][^>]*noindex/.test(html);
  const inSitemap = submitted.has(route);

  if (isNoindex && inSitemap) {
    contradictions.push(`${route || '/'} is noindex but IS in the sitemap`);
  }
  // 404 is correctly noindex and correctly absent. Anything else that is
  // noindex and absent is a page nobody will ever find.
  if (
    isNoindex &&
    !inSitemap &&
    !page.endsWith('404.html') &&
    !route.startsWith('/dev')
  ) {
    contradictions.push(`${route || '/'} is noindex — it will never be indexed`);
  }
}

if (contradictions.length > 0) {
  console.error(`FAIL: ${contradictions.length} indexability problem(s):\n`);
  for (const c of contradictions) console.error(`    ${c}`);
  console.error('');
  console.error('  A page is either in the sitemap and indexable, or noindex and out.');
  process.exit(1);
}

if (broken.length > 0) {
  console.error(`FAIL: ${broken.length} internal link(s) point at nothing:\n`);
  for (const link of broken)
    console.error(`    ${link.pathname}   (first seen on ${link.from})`);
  console.error('');
  console.error('  Every internal link must resolve. A 404 in the site navigation is an');
  console.error('  AdSense rejection reason, not a cosmetic problem.');
  process.exit(1);
}

console.log(
  `PASS: ${total} internal link(s) across ${pages.length} page(s), ` +
    `${checked.size} distinct, all resolve.`,
);
