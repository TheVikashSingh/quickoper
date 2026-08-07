#!/usr/bin/env node
/**
 * Missing-space detector for rendered prose.
 *
 * Prettier's Astro formatter is whitespace-sensitive: when an inline element is
 * placed on its own line, it removes the surrounding whitespace rather than
 * risk adding some. The source looks correct and the output reads
 * "we keep anyway:if verifying" or "is100.49999999999999".
 *
 * This shipped on live pages and was found by a human reading the site, which
 * is the worst way to find it. The defect is invisible in the source, invisible
 * in review, and only exists in the built HTML — so that is where it is caught.
 *
 * The rule: a word character must not sit directly against an inline tag
 * boundary. `<sup>` and `<sub>` are exempt, because `1.05<sup>30</sup>` is
 * correct and adding a space there would be the bug.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const DIST = 'dist';

/** Inline elements that carry prose. Adjacency to a word is a missing space. */
const INLINE = 'strong|em|code|a|span|b|i|abbr|small|mark';

/**
 * `<sup>` and `<sub>` are exempt by omission — `1.05<sup>30</sup>` is correct
 * and a space there would be the bug.
 *
 * For anything else that is deliberately tight, mark it `data-tight`:
 * `Quick<span class="text-brand" data-tight>Oper</span>` is one word rendered
 * in two colours, not a missing space. Explicit beats a growing allowlist.
 */
const CHECKS = [
  {
    // word immediately before an opening inline tag:  anyway:<strong>
    pattern: new RegExp(
      `([\\w.,:;!?])<(?:${INLINE})\\b(?![^>]*\\bdata-tight\\b)[^>]*>(\\w)`,
      'g',
    ),
    describe: 'text runs straight into an inline element',
  },
  {
    // closing inline tag immediately before a word:  </code>and
    // Captures the whole element so `data-tight` on its opening tag exempts it.
    pattern: new RegExp(`<(${INLINE})\\b([^>]*)>[^<]*</\\1>(\\w)`, 'g'),
    describe: 'inline element runs straight into text',
    skip: (m) => /\bdata-tight\b/.test(m[2] ?? ''),
  },
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

/** Strip tags so a human-readable excerpt can be shown alongside the match. */
const excerpt = (html, index) =>
  html
    .slice(Math.max(0, index - 55), index + 55)
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

if (!(await exists(DIST))) {
  console.error(`FAIL: ${DIST}/ not found. Run \`npm run build\` first.`);
  process.exit(1);
}

const pages = await walk(DIST, (name) => name.endsWith('.html'));
const problems = [];

for (const page of pages) {
  const html = await readFile(page, 'utf8');

  // Only prose. Structured data and head markup are not read by anyone.
  const body = html.slice(html.indexOf('<body'));

  for (const { pattern, describe, skip } of CHECKS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(body)) !== null) {
      if (skip?.(match)) continue;
      problems.push({
        url:
          '/' +
          relative(DIST, page)
            .split(sep)
            .join('/')
            .replace(/index\.html$/, ''),
        describe,
        text: excerpt(body, match.index),
      });
    }
  }
}

if (problems.length > 0) {
  console.error(`FAIL: ${problems.length} missing space(s) in rendered prose:\n`);
  for (const p of problems) {
    console.error(`    ${p.url}`);
    console.error(`      ${p.describe}`);
    console.error(`      …${p.text}…\n`);
  }
  console.error(
    "  Keep the text and the inline element on ONE source line, or use {' '}.",
  );
  console.error('  Prettier removes the newline between them and the space vanishes.');
  process.exit(1);
}

console.log(`PASS: no missing spaces across ${pages.length} page(s).`);
