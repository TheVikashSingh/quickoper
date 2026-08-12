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

    // /go/* is an affiliate redirect served from public/_redirects at the
    // edge (rule 12, D52). There is no file behind it and there is not meant
    // to be, so resolving it against dist/ would report every affiliate link
    // as broken. That it points at a REAL partner is checked further down,
    // against the registry — a stronger question than "does a file exist".
    if (pathname.startsWith('/go/')) continue;

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

// ── Orphans ──────────────────────────────────────────────────────────────────
//
// The mortgage overpayment calculator shipped linked from NOTHING. It was in
// the sitemap and reachable by typing the URL, and that was all: not on the
// homepage, not on the /finance hub, not in the navigation. The operator
// counted the tools on the landing page, got two, and asked where the third
// was. He was right.
//
// Nothing failed, because this file only asked "does every link resolve" —
// never "is every page linked". Those are different questions and only the
// second one catches a page nobody can find.
//
// It matters three ways: a visitor cannot reach it, it accumulates almost no
// internal link equity so it will not rank, and "every page reachable within
// two clicks" is an explicit AdSense criterion.
//
// /404 is exempt — it is reached by failing, not by linking.

const linkedTo = new Set();
for (const page of pages) {
  const html = await readFile(page, 'utf8');
  for (const [, raw] of html.matchAll(HREF)) {
    const pathname = (raw.split('#')[0] ?? '').split('?')[0] ?? '';
    if (pathname !== '') linkedTo.add(pathname.replace(/\/$/, '') || '/');
  }
}

const orphans = [];
for (const page of pages) {
  const route = ('/' + relative(DIST, page).split(sep).join('/'))
    .replace(/index\.html$/, '')
    .replace(/\/$/, '');
  if (route === '' || page.endsWith('404.html')) continue;
  if (!linkedTo.has(route)) orphans.push(route);
}

if (orphans.length > 0) {
  console.error(
    `FAIL: ${orphans.length} page(s) are in the build but linked from nowhere:\n`,
  );
  for (const route of orphans) console.error(`    ${route}`);
  console.error('');
  console.error('  A page nobody links to cannot be found, earns no internal link');
  console.error('  equity, and breaks "every page reachable within two clicks".');
  process.exit(1);
}

// ── The homepage's own list of calculators ───────────────────────────────────
//
// D41 made every page prove it is linked from somewhere. That is not enough.
//
// The mortgage calculator was linked from the hero row at the top of the
// homepage and absent from the section further down headed "Calculators" — so
// the orphan check above passed, the page linked to it, and a visitor who
// scrolled to the list of calculators was told there were two. The page
// contradicted itself, and the operator found it by reading the page.
//
// Second time this exact tool has gone missing from a listing (D41, D50). Twice
// is a pattern, so it gets a check.
//
// Anchored on the heading text rather than a class or position, and a missing
// heading is a FAILURE rather than a silent pass — otherwise renaming the
// section quietly retires the check, which is how check-js-budget once reported
// an island page at 1.09 KB.

const homepage = join(DIST, 'index.html');
const homeHtml = (await exists(homepage)) ? await readFile(homepage, 'utf8') : '';

const calculators = pages
  .map((page) =>
    ('/' + relative(DIST, page).split(sep).join('/')).replace(/index\.html$/, ''),
  )
  .filter((route) => /^\/finance\/[^/]+-calculator\/$/.test(route))
  .map((route) => route.replace(/\/$/, ''));

// Everything after the "Calculators" heading, up to the next heading of the
// same or higher level. That is the list a reader sees under that word.
const section = homeHtml.match(/<h2[^>]*>\s*Calculators\s*<\/h2>([\s\S]*?)<h[123][\s>]/i);

if (homeHtml === '') {
  console.error('FAIL: dist/index.html not found — cannot check the calculator list.');
  process.exit(1);
}

if (!section) {
  console.error('FAIL: no "Calculators" section found on the homepage.\n');
  console.error('  This check reads the list under that heading. If the section was');
  console.error('  renamed, update the pattern in scripts/check-links.mjs — do not');
  console.error('  delete the check, or the list can silently go stale again.');
  process.exit(1);
}

const missingFromList = calculators.filter(
  (route) => !(section[1] ?? '').includes(route),
);

if (missingFromList.length > 0) {
  console.error(
    `FAIL: ${missingFromList.length} calculator(s) missing from the homepage list:\n`,
  );
  for (const route of missingFromList) console.error(`    ${route}`);
  console.error('');
  console.error('  Being linked from the hero is not the same as being listed under');
  console.error('  "Calculators". A page that lists some of them and not others tells');
  console.error('  the visitor there are fewer tools than there are.');
  process.exit(1);
}

// ── Rule 12: affiliate links ─────────────────────────────────────────────────
//
// Three things must hold for every affiliate link, and all three are invisible
// in review because a wrong one looks exactly like a right one:
//
//   1. It points at /go/<slug> for a slug that is really in the registry.
//      A /go/ path with no redirect behind it is a dead link that looks fine.
//   2. It carries rel="sponsored nofollow". Undisclosed paid links are the
//      fastest available way to lose the trust this site is built on.
//   3. The page carries a disclosure, and the disclosure appears ABOVE the
//      link. Below it, the reader is informed after the click it was meant to
//      inform, which is not a disclosure.
//
// Checked against the built HTML because that is the only place the answer
// exists — the same reasoning as check-spacing (D24) and check-slots (D28).
//
// This runs today against zero affiliate links and will keep passing until the
// first one is added. That is the point: the convention exists before the link
// does, so nothing has to be retrofitted across a grown site.

const { AFFILIATES } = await import('../src/lib/affiliates.ts');
const knownSlugs = new Set(AFFILIATES.map((partner) => partner.slug));

const affiliateProblems = [];

for (const page of pages) {
  const html = await readFile(page, 'utf8');
  const route =
    '/' +
    relative(DIST, page)
      .split(sep)
      .join('/')
      .replace(/index\.html$/, '');

  const disclosureAt = html.indexOf('data-affiliate-disclosure');

  for (const match of html.matchAll(/<a\b[^>]*href=["'](\/go\/[^"']*)["'][^>]*>/g)) {
    const [tag, href] = match;
    const slug = (href ?? '').replace(/^\/go\//, '').replace(/\/$/, '');

    if (!knownSlugs.has(slug)) {
      affiliateProblems.push(
        `${route} links to ${href} — "${slug}" is not in src/lib/affiliates.ts`,
      );
    }

    const rel = tag.match(/rel=["']([^"']*)["']/)?.[1] ?? '';
    for (const required of ['sponsored', 'nofollow']) {
      if (!rel.split(/\s+/).includes(required)) {
        affiliateProblems.push(`${route} links to ${href} without rel="${required}"`);
      }
    }

    if (disclosureAt === -1) {
      affiliateProblems.push(`${route} has an affiliate link and no disclosure`);
    } else if (disclosureAt > (match.index ?? 0)) {
      affiliateProblems.push(
        `${route} discloses BELOW the ${href} link — it must appear above it`,
      );
    }
  }
}

if (affiliateProblems.length > 0) {
  console.error(`FAIL: ${affiliateProblems.length} affiliate link problem(s):\n`);
  for (const problem of affiliateProblems) console.error(`    ${problem}`);
  console.error('');
  console.error('  Rule 12: affiliate links go through /go/<partner>, carry');
  console.error('  rel="sponsored nofollow", and are disclosed above the link.');
  console.error('  Use src/components/affiliate/AffiliateLink.astro rather than');
  console.error('  writing the anchor by hand.');
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
console.log(`PASS: all ${calculators.length} calculator(s) appear in the homepage list.`);
