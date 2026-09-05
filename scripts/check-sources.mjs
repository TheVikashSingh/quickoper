#!/usr/bin/env node
/**
 * Every external source link must actually resolve.
 *
 * ─── Why this exists ────────────────────────────────────────────────────────
 *
 * `check-links.mjs` verifies internal links. Nothing verified the OUTBOUND
 * ones — and the tap drill page shipped with three fabricated ISO and ASME
 * catalogue URLs, every one of them a 404, on a page whose entire argument is
 * that its figures are traceable. `sourceRef` validated them as well-formed
 * URLs, which they were. Well-formed and real are different properties.
 *
 * A citation that does not resolve is worse than no citation: it looks like
 * diligence and delivers nothing, and on this site it is a direct claim about
 * verifiability that turns out to be false.
 *
 * ─── Soft 404s ──────────────────────────────────────────────────────────────
 *
 * Status codes are not enough. `webstore.ansi.org/standards/asme/asmeb112019`
 * returns HTTP 200 with the title "ANSI Webstore Error"; ISO returns 200 for
 * its own not-found page too. So the body is checked for the markers those
 * pages use.
 *
 * ─── Bot walls ──────────────────────────────────────────────────────────────
 *
 * A third case, and the sneakiest: some hosts answer an automated request with
 * HTTP 200 and an anti-bot interstitial. `aaii.com` runs one — it returns 200
 * and a 6 KB "Pardon Our Interruption" page for the very URL that serves a
 * 35 KB PDF to a browser. That is neither a live citation nor a dead one, and
 * scoring it `ok` is a FALSE PASS: the link would go on passing after the
 * publisher deleted the page. It is reported like a 403 — the host will not
 * let us look, so a person has to.
 *
 * ─── Network policy ─────────────────────────────────────────────────────────
 *
 * A definite 404 or a soft-404 marker FAILS the build — that is a real,
 * reproducible defect in committed content. A network error (DNS, timeout,
 * connection refused) WARNS and does not fail, because a sandboxed or offline
 * CI runner must not be able to break a build over a link that is fine. Run
 * with --strict to fail on those too.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIST = 'dist';
const STRICT = process.argv.includes('--strict');
const TIMEOUT_MS = 15_000;

/** Markers that mean "this page exists but the thing you asked for does not". */
const SOFT_404 = [
  'this standard does not exist',
  'webstore error',
  'page not found',
  'sorry, the page you',
];

/**
 * Markers that mean "a bot check answered, not the publisher".
 *
 * Distinct from SOFT_404: those mean the resource is gone, these mean we were
 * not allowed to ask. Only phrases distinctive enough that they cannot occur in
 * an ordinary page's prose. The first was observed on aaii.com.
 */
const BOT_WALL = [
  'pardon our interruption',
  'attention required! | cloudflare',
  'checking your browser before accessing',
  'enable javascript and cookies to continue',
];

/**
 * Citations that are ALREADY broken, and are not this gate's job to invent a fix for.
 *
 * A ratchet, exactly like MAX_PENDING in the tap drill provenance test. These
 * three were found the moment this check first ran — they have been live on the
 * finance pages since launch. Guessing replacement URLs would repeat the error
 * that prompted writing this script, so each is recorded here until a person
 * finds the real destination.
 *
 * The list may only SHRINK. A broken link that is not on it fails the build, and
 * an entry that starts working again also fails, so the list cannot go stale.
 */
const KNOWN_BROKEN = new Map([
  [
    'https://www.financialplanningassociation.org/article/journal/JAN18-40-years-safe-withdrawal-rates',
    'Bengen (1994). FPA reorganised its journal archive; needs the current URL or a DOI.',
  ],
  [
    'https://www.consumerfinance.gov/ask-cfpb/what-is-a-minimum-payment-en-431/',
    'CFPB Ask-CFPB entry appears retired; needs the replacement page.',
  ],
]);

async function htmlFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await htmlFiles(full)));
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

async function collect() {
  const found = new Map(); // url -> Set<page>
  for (const file of await htmlFiles(DIST)) {
    const html = await readFile(file, 'utf8');
    const page = file.replace(/^dist/, '').replace(/index\.html$/, '') || '/';
    for (const m of html.matchAll(/href="(https?:\/\/[^"]+)"/g)) {
      const url = m[1];
      if (url.includes('quickoper.com')) continue; // internal, covered elsewhere
      if (!found.has(url)) found.set(url, new Set());
      found.get(url).add(page);
    }
  }
  return found;
}

async function check(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        // A browser UA, because what matters is whether a READER can open the
        // link. ISO returns 403 to anything that announces itself as a bot and
        // 200 to a browser; reporting that as a dead link would be wrong.
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml,*/*',
      },
    });
    if (!res.ok) {
      // 403/429 mean "we do not like automated traffic", not "this is gone".
      // Failing a build over a rate limit would make the gate unreliable, and an
      // unreliable gate gets disabled.
      if (res.status === 403 || res.status === 429) {
        return {
          state: 'warn',
          detail: `HTTP ${res.status} — host blocks automated checks`,
        };
      }
      return { state: 'fail', detail: `HTTP ${res.status}` };
    }
    const body = (await res.text()).slice(0, 40_000).toLowerCase();

    // Ask this BEFORE the soft-404 test: an interstitial is not evidence either
    // way, and calling it `ok` would be the false pass this gate exists to stop.
    const wall = BOT_WALL.find((m) => body.includes(m));
    if (wall !== undefined) {
      return {
        state: 'warn',
        detail: `HTTP 200 but an anti-bot interstitial answered ("${wall}") — not checkable from here`,
      };
    }

    const marker = SOFT_404.find((m) => body.includes(m));
    if (marker !== undefined) {
      return { state: 'fail', detail: `HTTP 200 but the page says "${marker}"` };
    }
    return { state: 'ok', detail: `HTTP ${res.status}` };
  } catch (err) {
    return { state: 'warn', detail: `${err.name}: ${err.message}` };
  } finally {
    clearTimeout(timer);
  }
}

const links = await collect();
if (links.size === 0) {
  console.log('PASS: no external links in the build.');
  process.exit(0);
}

const failures = [];
const warnings = [];

// Sequential on purpose. A dozen links is not worth hammering anyone's server.
const stale = [];
for (const [url, pages] of links) {
  const { state, detail } = await check(url);
  const known = KNOWN_BROKEN.has(url);
  if (state === 'fail' && known) {
    warnings.push({ url, pages, detail: `${detail} — known: ${KNOWN_BROKEN.get(url)}` });
  } else if (state === 'fail') {
    failures.push({ url, pages, detail });
  } else if (state === 'ok' && known) {
    stale.push({
      url,
      pages,
      detail: 'is on KNOWN_BROKEN but resolves — remove the entry',
    });
  } else if (state === 'warn') {
    warnings.push({ url, pages, detail });
  }
}
failures.push(...stale);

for (const w of warnings) {
  console.log(`  warn  ${w.url}\n        ${w.detail}`);
}

if (failures.length > 0) {
  console.error(`\nFAIL: ${failures.length} external link(s) do not resolve:\n`);
  for (const f of failures) {
    console.error(`    ${f.url}`);
    console.error(`      ${f.detail}`);
    console.error(`      cited on: ${[...f.pages].join(', ')}\n`);
  }
  console.error(
    '  A citation that does not resolve is worse than no citation. Fix the URL,\n' +
      '  or cite the source by designation and link somewhere that exists.',
  );
  process.exit(1);
}

if (STRICT && warnings.length > 0) {
  console.error(`\nFAIL (--strict): ${warnings.length} link(s) could not be reached.`);
  process.exit(1);
}

console.log(
  `PASS: ${links.size} external link(s) across the build all resolve` +
    (warnings.length > 0
      ? `, ${warnings.length} unreachable (warned, not failed).`
      : '.'),
);
