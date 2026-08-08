#!/usr/bin/env node
/**
 * The structured data CLAUDE.md requires must actually be on the page.
 *
 * It was not. `Organization + Person (author, with sameAs) site-wide` has been
 * in the contract since the first commit; `Person` was emitted on **zero of ten
 * pages** for seventeen pull requests, and `Organization` carried no `sameAs`
 * either. Nothing failed, because nothing was looking — the same shape as the
 * six 404s in the navigation, the homepage `noindex`, and the page count.
 *
 * WHY THIS ONE IS EXPENSIVE RATHER THAN UNTIDY: this is a Your-Money-Your-Life
 * site on a domain with no history. A search engine cannot attach credibility
 * to an author it cannot resolve to an entity, and "who wrote this, and can
 * that be checked" is the first question asked of financial content from an
 * unknown name. The missing node is precisely the one carrying the answer.
 *
 * The failure mode is also silent and slow: no error, no warning, just content
 * that never earns the trust signals it was supposed to. By the time it is
 * visible in a traffic graph, months have gone.
 *
 * WHAT IS CHECKED
 *   - every JSON-LD block parses (a malformed one is ignored wholesale)
 *   - the site-wide entities appear on every page
 *   - Person carries sameAs with at least one resolvable-looking URL, because
 *     a Person node with no external reference asserts an identity without
 *     offering any way to confirm it
 *   - tool pages carry WebApplication, and every page but the root and 404
 *     carries BreadcrumbList
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const DIST = 'dist';

/** Required on every page, without exception. */
const SITE_WIDE = ['Organization', 'Person', 'WebSite'];

const LD = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;

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
    else if (entry.name.endsWith('.html')) found.push(full);
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

if (!(await exists(DIST))) {
  console.error(`FAIL: ${DIST}/ not found. Run \`npm run build\` first.`);
  process.exit(1);
}

const pages = await walk(DIST);
const problems = [];
let nodesSeen = 0;

for (const page of pages) {
  const html = await readFile(page, 'utf8');
  const route =
    '/' +
    relative(DIST, page)
      .split(sep)
      .join('/')
      .replace(/index\.html$/, '');

  const nodes = [];
  for (const [, raw] of html.matchAll(LD)) {
    try {
      nodes.push(JSON.parse(raw));
    } catch {
      problems.push(`${route} has a JSON-LD block that does not parse`);
    }
  }
  nodesSeen += nodes.length;

  const types = nodes.map((n) => n['@type']);

  for (const required of SITE_WIDE) {
    if (!types.includes(required)) problems.push(`${route} is missing ${required}`);
  }

  const person = nodes.find((n) => n['@type'] === 'Person');
  if (person !== undefined) {
    const sameAs = Array.isArray(person.sameAs) ? person.sameAs : [];
    if (!sameAs.some((url) => typeof url === 'string' && url.startsWith('http'))) {
      problems.push(
        `${route}: Person has no sameAs — an identity asserted with no way to confirm it`,
      );
    }
    if (typeof person.name !== 'string' || person.name.trim() === '') {
      problems.push(`${route}: Person has no name`);
    }
  }

  // A calculator is a WebApplication. Anything under /finance/ that is not the
  // hub is a tool page.
  const isTool = /^\/finance\/.+\/$/.test(route);
  if (isTool && !types.includes('WebApplication')) {
    problems.push(`${route} is a tool page without WebApplication`);
  }

  // BreadcrumbList everywhere except the root (which has no trail) and 404.
  const needsCrumbs = route !== '/' && !route.endsWith('404.html');
  if (needsCrumbs && !types.includes('BreadcrumbList')) {
    problems.push(`${route} is missing BreadcrumbList`);
  }
}

if (problems.length > 0) {
  console.error(`FAIL: ${problems.length} structured-data problem(s):\n`);
  for (const problem of problems) console.error(`    ${problem}`);
  console.error('');
  console.error('  CLAUDE.md requires Organization + Person (with sameAs) site-wide,');
  console.error('  WebApplication on tool pages and BreadcrumbList everywhere. On a');
  console.error('  YMYL site these are the trust signals, and their failure is silent.');
  process.exit(1);
}

console.log(
  `PASS: ${nodesSeen} JSON-LD node(s) across ${pages.length} page(s); ` +
    `${SITE_WIDE.join(' + ')} present on every one.`,
);
