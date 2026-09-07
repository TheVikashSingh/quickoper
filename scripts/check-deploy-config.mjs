#!/usr/bin/env node
/**
 * The configuration Cloudflare reads that CI otherwise never sees.
 *
 * Two things live here, and they share one property: both are consumed at
 * DEPLOY time or by the CDN at request time, so neither can fail in a way any
 * other gate would notice. Both have already shipped broken.
 *
 *   1. public/_headers — parses, and every rule matches a real route (D45).
 *   2. wrangler.toml's html_handling agrees with astro.config.mjs's
 *      trailingSlash (D46).
 *
 * ── 1. _headers ──────────────────────────────────────────────────────────────
 *
 * Is public/_headers valid, and does every rule in it apply to a route that
 * actually exists?
 *
 * WHY THIS EXISTS. The first deployment this project ever attempted failed:
 *
 *     Invalid _headers configuration:
 *     Line 16: Invalid header format [code: 100324]
 *
 * Line 16 was `X-Frame-Options:` with an empty value, intended to unset the
 * header for an `/embed/*` rule. Two things were wrong with it, and the gates
 * caught neither, because every gate in this project reads `dist/` and nothing
 * had ever read `_headers` at all:
 *
 *   1. An empty value is not how a header is removed. Cloudflare rejects it.
 *   2. THERE IS NO /embed/ ROUTE. It had never been built. The rule cited
 *      "charter §14", a document that is not in this repository — the same
 *      phantom reference docs/DNS.md carried for §13.
 *
 * So the file had shipped broken since the first commit, and the only thing
 * that could ever have told us was a deploy. CI was green the whole time. That
 * is the gap this closes: `_headers` is configuration Cloudflare parses at
 * deploy time, which is *after* CI, so a syntax error here is a green pipeline
 * and a failed release.
 *
 * Eighth time a real defect has surfaced because a check was asked a question
 * it had not been asked before (D18, D26, D31, D41).
 *
 * WHAT IT CHECKS:
 *
 *   - Every header line parses as `Name: value` or as the unset form `! Name`.
 *     An empty value is the specific error that broke the deploy, so it gets
 *     its own message rather than a generic one.
 *   - Every path rule matches at least one thing the build actually produced.
 *     A rule for a route that does not exist is either a typo or a leftover,
 *     and both are worth failing on.
 *
 * WHAT IT DOES NOT CHECK: whether the header *values* are sensible. Whether
 * HSTS should be a year is a judgement call, not a fact derivable from dist/.
 *
 * ── 2. Trailing slashes ──────────────────────────────────────────────────────
 *
 * astro.config.mjs sets `trailingSlash: 'never'`. Every internal link, every
 * sitemap <loc> and every <link rel="canonical"> is therefore slash-less.
 *
 * Cloudflare's DEFAULT html_handling is "auto-trailing-slash", which ADDS a
 * slash and 307-redirects to it. On the first real deployment that made **every
 * content page on the site a redirect** — Google crawls /about from the
 * sitemap, receives a 307 to /about/, and arrives at a page whose canonical
 * says /about. A contradictory signal on every URL, plus a wasted round trip on
 * every internal click.
 *
 * Nothing could have caught it before a deploy: both files were individually
 * correct, and no tool reads both. That is the whole category this script is
 * for.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const DIST = 'dist';
const HEADERS = 'public/_headers';

async function walk(dir, found = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, found);
    else found.push(full);
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

if (!(await exists(HEADERS))) {
  console.log(`PASS: no ${HEADERS} to check.`);
  process.exit(0);
}

if (!(await exists(DIST))) {
  console.error(`FAIL: ${DIST}/ not found. Run \`npm run build\` first.`);
  process.exit(1);
}

// ── What the build actually serves ───────────────────────────────────────────

const files = await walk(DIST);

/**
 * Every path a request could resolve to: the file itself, and — for an
 * index.html — the directory route Astro serves it at, with and without the
 * trailing slash.
 */
const served = new Set();
for (const file of files) {
  const path = '/' + relative(DIST, file).split(sep).join('/');
  served.add(path);
  if (path.endsWith('/index.html')) {
    const route = path.slice(0, -'index.html'.length);
    served.add(route);
    if (route.length > 1) served.add(route.slice(0, -1));
  }
}

// ── Parse _headers ───────────────────────────────────────────────────────────

const source = await readFile(HEADERS, 'utf8');
const lines = source.split(/\r?\n/);

const problems = [];
const rules = [];
let current = null;

lines.forEach((raw, i) => {
  const lineNo = i + 1;
  const line = raw.trim();

  if (line === '' || line.startsWith('#')) return;

  // A rule opens with a path or an absolute URL, unindented.
  if (line.startsWith('/') || /^https?:\/\//i.test(line)) {
    current = { path: line, lineNo, headers: 0 };
    rules.push(current);
    return;
  }

  // Anything else is a header line and must belong to a rule.
  if (!current) {
    problems.push({
      lineNo,
      detail: `header "${line}" appears before any path rule`,
    });
    return;
  }

  current.headers++;

  // The unset form. Cloudflare removes the named header.
  if (/^!\s*[A-Za-z0-9-]+$/.test(line)) return;

  const match = line.match(/^([A-Za-z0-9-]+)\s*:(.*)$/);

  if (!match) {
    problems.push({
      lineNo,
      detail: `"${line}" is not "Name: value" or "! Name"`,
    });
    return;
  }

  if (match[2].trim() === '') {
    problems.push({
      lineNo,
      detail:
        `"${match[1]}:" has an empty value — this is the exact error that failed ` +
        `the first deploy (code 100324). To remove a header write "! ${match[1]}".`,
    });
  }
});

// ── Does each rule apply to anything? ────────────────────────────────────────

for (const rule of rules) {
  if (rule.headers === 0) {
    problems.push({
      lineNo: rule.lineNo,
      detail: `rule "${rule.path}" sets no headers`,
    });
  }

  if (/^https?:\/\//i.test(rule.path)) continue; // absolute URL, not ours to resolve

  const star = rule.path.indexOf('*');
  const matches =
    star === -1
      ? served.has(rule.path)
      : [...served].some((path) => path.startsWith(rule.path.slice(0, star)));

  if (!matches) {
    problems.push({
      lineNo: rule.lineNo,
      detail:
        `rule "${rule.path}" matches nothing the build produced — the route does ` +
        `not exist, so this is a typo or a leftover`,
    });
  }
}

if (problems.length > 0) {
  console.error(`FAIL: ${HEADERS} has ${problems.length} problem(s):\n`);
  for (const problem of problems.sort((a, b) => a.lineNo - b.lineNo)) {
    console.error(`    line ${String(problem.lineNo).padStart(3)}   ${problem.detail}`);
  }
  console.error('');
  console.error('  Cloudflare parses this file at deploy time, which is after CI.');
  console.error('  An error here is a green pipeline and a failed release.');
  process.exit(1);
}

// ── Trailing slashes: astro.config.mjs vs wrangler.toml ──────────────────────

const ASTRO_CONFIG = 'astro.config.mjs';
const WRANGLER = 'wrangler.toml';

/** What Cloudflare must be told, for each thing Astro can be set to. */
const REQUIRED = {
  never: 'drop-trailing-slash',
  always: 'force-trailing-slash',
};

const astroSource = await readFile(ASTRO_CONFIG, 'utf8');
const wranglerSource = await readFile(WRANGLER, 'utf8');

const astroMatch = astroSource.match(/trailingSlash\s*:\s*['"](\w+)['"]/);
const wranglerMatch = wranglerSource.match(/^\s*html_handling\s*=\s*['"]([\w-]+)['"]/m);

const trailingSlash = astroMatch?.[1];
const htmlHandling = wranglerMatch?.[1];

if (!trailingSlash) {
  console.error(`FAIL: no trailingSlash found in ${ASTRO_CONFIG}.`);
  console.error('  This check cannot verify the pair. Update the pattern here.');
  process.exit(1);
}

// 'ignore' means Astro is not asserting a form, so any CDN behaviour is
// defensible and there is nothing to agree with.
const required = REQUIRED[trailingSlash];

if (required && htmlHandling !== required) {
  console.error(`FAIL: ${WRANGLER} and ${ASTRO_CONFIG} disagree on trailing slashes.\n`);
  console.error(`    ${ASTRO_CONFIG}   trailingSlash: '${trailingSlash}'`);
  console.error(`    ${WRANGLER}      html_handling = ${htmlHandling ?? '(unset)'}`);
  console.error(`    required           html_handling = "${required}"`);
  console.error('');
  if (!htmlHandling) {
    console.error('  Unset means Cloudflare uses "auto-trailing-slash", which ADDS a');
    console.error('  slash and 307-redirects. Astro builds slash-less URLs, so every');
    console.error('  page becomes a redirect whose canonical points back at the URL');
    console.error('  the crawler was just sent away from.');
  } else {
    console.error('  Every content page becomes a redirect, and the canonical tag');
    console.error('  contradicts the URL actually being served.');
  }
  process.exit(1);
}

// ── public/_redirects: two rule classes, checked differently ─────────────────
//
// AFFILIATE (`/go/<slug>`, 302). Two files have to say the same thing:
// src/lib/affiliates.ts is what the site renders links from, public/_redirects
// is what Cloudflare actually serves. A partner in one and not the other is
// either a dead /go/ link on a live page, or a redirect pointing somewhere
// nothing links to.
//
// This is D46's shape exactly — configuration split across two files that no
// single tool reads, where each file is individually valid and the defect
// exists only in the relationship. That one shipped every page as a 307.
//
// MIGRATION (any other path, 301). A URL that used to exist here and now lives
// somewhere else. Three properties, and the first is the one that bites:
//
//   1. THE SOURCE MUST BE ABSENT FROM dist/. Cloudflare serves a real static
//      asset in preference to a redirect rule, so a redirect whose source is
//      still built is *silently dead*: green CI, green deploy, and the old URL
//      still serving a 200. Nothing downstream would notice, because every
//      other gate in this project reads dist/ and would find the page present
//      and correct. This is the check that makes a `git mv` provably complete.
//   2. The destination must be present in dist/, or the redirect lands on a 404
//      carrying this site's name.
//   3. 301, not 302. A migration is permanent — that is the whole claim being
//      made to a crawler. (Affiliate destinations are the opposite case, which
//      is why the two classes disagree about the status code.)
//
// Wildcards are rejected outright. `/* /finance/:splat 301` reads as a tidy
// one-liner and swallows /about, /apps and every asset on the site; because its
// source is not a literal path, check 1 could never catch it.

const REDIRECTS = 'public/_redirects';

if (await exists(REDIRECTS)) {
  const { AFFILIATES } = await import('../src/lib/affiliates.ts');

  const declared = new Map(AFFILIATES.map((partner) => [partner.slug, partner.url]));
  const routed = new Map();
  const redirectProblems = [];
  let migrations = 0;

  const redirectLines = (await readFile(REDIRECTS, 'utf8')).split(/\r?\n/);

  redirectLines.forEach((raw, i) => {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) return;

    const [from, to, code] = line.split(/\s+/);

    if (!from?.startsWith('/')) {
      redirectProblems.push(
        `line ${i + 1}: "${from}" is not a path — every rule must start with "/"`,
      );
      return;
    }
    if (!to) {
      redirectProblems.push(`line ${i + 1}: "${from}" has no destination`);
      return;
    }

    // ── Affiliate class ──────────────────────────────────────────────────────
    if (from.startsWith('/go/')) {
      // 301 is cached by browsers indefinitely, and affiliate destinations are
      // the least permanent URLs there are.
      if (code !== '302') {
        redirectProblems.push(
          `line ${i + 1}: "${from}" uses ${code ?? '(no status)'} — affiliate redirects must be 302`,
        );
      }
      routed.set(from.replace(/^\/go\//, ''), to);
      return;
    }

    // ── Migration class ──────────────────────────────────────────────────────
    migrations += 1;

    if (from.includes('*') || to.includes(':splat') || to.includes('*')) {
      redirectProblems.push(
        `line ${i + 1}: "${from} ${to}" uses a wildcard — migration rules must name\n` +
          `                   one literal path each, so that every source can be checked\n` +
          `                   against dist/. A splat rule swallows routes it was never\n` +
          `                   meant to touch and no gate can see which.`,
      );
      return;
    }

    if (code !== '301') {
      redirectProblems.push(
        `line ${i + 1}: "${from}" uses ${code ?? '(no status)'} — a migration is permanent, so 301`,
      );
    }

    if (served.has(from)) {
      redirectProblems.push(
        `line ${i + 1}: "${from}" is STILL BUILT — dist/ serves it, so this rule is dead.\n` +
          `                   Cloudflare prefers a real asset over a redirect. The old URL\n` +
          `                   would keep returning 200 and CI would stay green. Move or\n` +
          `                   delete the page, or drop the rule.`,
      );
    }

    if (!served.has(to)) {
      redirectProblems.push(
        `line ${i + 1}: "${from}" points at "${to}", which the build does not produce —\n` +
          `                   the redirect would land on a 404.`,
      );
    }
  });

  for (const [slug, url] of declared) {
    if (!routed.has(slug)) {
      redirectProblems.push(
        `"${slug}" is in affiliates.ts but has no line in ${REDIRECTS}`,
      );
    } else if (routed.get(slug) !== url) {
      redirectProblems.push(
        `"${slug}" points at a different URL in each file:\n` +
          `                   affiliates.ts: ${url}\n` +
          `                   _redirects:    ${routed.get(slug)}`,
      );
    }
  }

  for (const slug of routed.keys()) {
    if (!declared.has(slug)) {
      redirectProblems.push(`"${slug}" is in ${REDIRECTS} but not in affiliates.ts`);
    }
  }

  if (redirectProblems.length > 0) {
    console.error(`FAIL: ${REDIRECTS} does not describe what this build serves:\n`);
    for (const problem of redirectProblems) console.error(`    ${problem}`);
    console.error('');
    console.error(
      '  Affiliate rules (/go/, 302): a partner in one file and not the other',
    );
    console.error(
      '  is a dead /go/ link on a live page, or a redirect nothing points at.',
    );
    console.error('  Both files, always.');
    console.error('');
    console.error(
      '  Migration rules (any other path, 301): the source must be gone from',
    );
    console.error(
      '  dist/ and the destination must be in it. A redirect whose source is',
    );
    console.error('  still built never runs, and nothing else in CI can tell you that.');
    process.exit(1);
  }

  console.log(
    `PASS: ${REDIRECTS} — ${declared.size} affiliate rule(s) agree with the registry, ` +
      `${migrations} migration rule(s) resolve against the build.`,
  );
}

// ── Report ───────────────────────────────────────────────────────────────────

const total = rules.reduce((sum, rule) => sum + rule.headers, 0);
console.log(
  `PASS: ${HEADERS} — ${rules.length} rule(s), ${total} header(s), ` +
    `every rule matches a route the build produces.`,
);
console.log(
  `PASS: trailingSlash '${trailingSlash}' agrees with html_handling ` +
    `"${htmlHandling ?? '(not required)'}".`,
);
