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

import * as catalogue from '../src/lib/catalogue.ts';

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

// ── Every calculator is listed on its own vertical's hub ─────────────────────
//
// D41 made every page prove it is linked from somewhere. That is not enough.
//
// The mortgage calculator was linked from the hero row at the top of the
// homepage and absent from the section further down headed "Calculators" — so
// the orphan check above passed, the page linked to it, and a visitor who
// scrolled to the list of calculators was told there were two. The page
// contradicted itself, and the operator found it by reading the page (D50).
//
// WHAT THIS USED TO CHECK, AND WHY IT MOVED. It read a "Calculators" heading on
// the HOMEPAGE and required every calculator under it. That was right while the
// homepage listed calculators. It stopped being right when the root became a
// router (D91): the root now names the two verticals and nothing else, so
// asserting a flat list of six tools on it would force the exact page the
// restructure removed.
//
// The requirement did not weaken, it moved to where it is true. D50's real
// invariant is "the page a visitor lands on must not lie about what exists",
// and with a router that is TWO claims:
//
//   1. every vertical hub lists every calculator in that vertical, and
//   2. the homepage links to every vertical hub.
//
// Together they still guarantee what D50 protected — every calculator reachable
// from the root, with no page under-reporting its own contents — and they cover
// a third vertical for free.

const homepage = join(DIST, 'index.html');
const homeHtml = (await exists(homepage)) ? await readFile(homepage, 'utf8') : '';

if (homeHtml === '') {
  console.error('FAIL: dist/index.html not found — cannot check the hub links.');
  process.exit(1);
}

const listingProblems = [];

for (const vertical of catalogue.VERTICALS) {
  // 1. The homepage must route to this vertical.
  if (!new RegExp(`href="${vertical.hub}"`).test(homeHtml)) {
    listingProblems.push(
      `the homepage does not link to ${vertical.hub} — a vertical nobody can reach from the root`,
    );
  }

  // 2. The hub must list every calculator in its own vertical.
  const hubFile = join(DIST, vertical.hub.replace(/^\//, ''), 'index.html');
  if (!(await exists(hubFile))) {
    listingProblems.push(
      `${vertical.hub} is in the registry but the build produces no page for it`,
    );
    continue;
  }
  const hubHtml = await readFile(hubFile, 'utf8');
  for (const entry of catalogue.calculatorsIn(vertical.id)) {
    if (!hubHtml.includes(`href="${entry.href}"`)) {
      listingProblems.push(`${entry.href} is missing from its hub, ${vertical.hub}`);
    }
  }
}

if (listingProblems.length > 0) {
  console.error(`FAIL: ${listingProblems.length} listing problem(s):\n`);
  for (const problem of listingProblems) console.error(`    ${problem}`);
  console.error('');
  console.error('  Being linked from somewhere is not the same as being listed where a');
  console.error('  visitor looks for it. A hub that lists some of its tools and not');
  console.error('  others tells the visitor there are fewer than there are, and a root');
  console.error('  that omits a vertical hides half the site.');
  process.exit(1);
}

const listedCalculators = catalogue.calculators().length;

// ── Rule 8: every calculator ends with a real Related block ──────────────────
//
// Rule 8 requires "2-3 genuine internal links + the cluster hub". All three
// calculators had a Related block, all three were different, and none of them
// satisfied it. Measured against the built output before this check existed:
//
//   debt payoff            1 link, to "/" — no siblings, no derivations, no hub
//   coast fire             2 links, neither of them its own derivations
//   mortgage overpayment   3 links, one a *debt* derivation, still no hub
//
// Why it is worth a gate rather than a note. Internal links are how a site
// tells a search engine which of its own pages matter, and the measured
// distribution was backwards: /methodology 41 inbound, /contact 22, /about 19
// — against /coast-number 1, /withdrawal-rate 2, /credit-card-interest 3. The
// footer pages will never rank for anything worth having; the derivation pages
// are the entire long-tail surface. The site was spending its equity on /terms.
//
// "/" does not count. A link to the homepage is navigation, present on every
// page already, and using it to satisfy a *related content* requirement is how
// the debt payoff page ended up with a Related block containing nothing related.

// Same generalisation as the homepage-list check above: the registry decides
// what a calculator is, so rule 8's Related requirement reaches every vertical
// rather than only the one whose folder name was hardcoded here.
const calculatorRoutes = new Set(catalogue.calculators().map((entry) => entry.href));
const calculatorPages = pages.filter((page) => {
  const route = ('/' + relative(DIST, page).split(sep).join('/')).replace(
    /\/index\.html$/,
    '',
  );
  return calculatorRoutes.has(route);
});

const relatedProblems = [];

for (const page of calculatorPages) {
  const html = await readFile(page, 'utf8');
  const route =
    '/' +
    relative(DIST, page)
      .split(sep)
      .join('/')
      .replace(/index\.html$/, '')
      .replace(/\/$/, '');

  const block = html.match(/<nav[^>]*\sdata-related[^>]*>([\s\S]*?)<\/nav>/);

  if (!block) {
    relatedProblems.push(`${route} has no Related block (rule 8)`);
    continue;
  }

  const hrefs = [...(block[1] ?? '').matchAll(/href=["'](\/[^"'#?]*)["']/g)].map(
    ([, href]) => (href ?? '').replace(/\/$/, ''),
  );

  // The hub is the one belonging to THIS page's vertical. Asserting /finance
  // on every calculator would have demanded a machining page link into the
  // money hub, which is the opposite of what verticals are for.
  const entry = catalogue.CATALOGUE.find((item) => item.href === route);
  const hub = catalogue.VERTICALS.find((v) => v.id === entry?.vertical)?.hub;

  if (hub === undefined) {
    relatedProblems.push(`${route} is a calculator with no vertical in the registry`);
    continue;
  }

  if (!hrefs.includes(hub)) {
    relatedProblems.push(`${route} Related block omits its cluster hub ${hub}`);
  }

  const genuine = hrefs.filter((href) => href !== '' && href !== hub);
  if (genuine.length < 2) {
    relatedProblems.push(
      `${route} Related block has ${genuine.length} genuine link(s); rule 8 wants 2-3 plus the hub`,
    );
  }
}

if (relatedProblems.length > 0) {
  console.error(`FAIL: ${relatedProblems.length} Related block problem(s):\n`);
  for (const problem of relatedProblems) console.error(`    ${problem}`);
  console.error('');
  console.error('  Rule 8: 2-3 genuine internal links plus the cluster hub, on every');
  console.error('  calculator page. Use components/RelatedTools.astro — it renders the');
  console.error('  hub link itself, because that is the part every hand-written');
  console.error('  version forgot.');
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
console.log(
  `PASS: all ${listedCalculators} calculator(s) appear on their vertical's hub, ` +
    `and the homepage links to all ${catalogue.VERTICALS.length} hub(s).`,
);
