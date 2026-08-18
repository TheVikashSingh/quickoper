#!/usr/bin/env node
/**
 * Every slot a calculator island declares must actually reach the built page.
 *
 * The islands take their static prose from the .astro page as named slots
 * rather than holding it as JSX, because a string literal inside a Preact
 * component ships twice — once as HTML, once as the JavaScript able to
 * re-render it. That change bought back real bytes. It also opened a hole.
 *
 * WHY TYPESCRIPT CANNOT CLOSE IT: `astro check` types a framework component's
 * children as `children`, not as named props. Declaring the prose props
 * required therefore fails typecheck on a page that passes all six correctly:
 *
 *   Type '{ children: any[]; "client:load": true; }' is not assignable to
 *   'IntrinsicAttributes & Prose'. ... missing: privacy, strategies, method,
 *   rounding, and 2 more.
 *
 * So the props are optional, and a page that forgets one type-checks, builds,
 * and ships with a sentence missing. On a calculator page the missing sentence
 * is a rule 8 disclosure — the workings, the rounding note, the line promising
 * nothing is transmitted. Exactly the kind of defect that is invisible in the
 * source and invisible in review, which is where check-spacing.mjs already
 * lives (D24).
 *
 * So this checks the one place it is observable: the built HTML.
 *
 * HOW A SLOT APPEARS AFTER BUILD, both of which count as present:
 *   <astro-slot name="method">…</astro-slot>            rendered into the DOM
 *   <template data-astro-template="stalled">…</template> declared, not rendered
 *
 * Astro emits the second only for slots the island did not render this time —
 * a conditional branch like the never-clears warning. Hydration re-reads both,
 * so either proves the page supplied it.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const DIST = 'dist';
const ISLANDS = 'src/components/calculators';

const exists = async (p) => {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
};

/**
 * Which built page hosts which island. Kept explicit rather than inferred: a
 * wrong guess here would silently check nothing, and this file is small enough
 * that two lines of maintenance per calculator is cheaper than the machinery to
 * avoid them.
 */
const HOSTS = {
  'DebtPayoffCalculator.tsx': 'finance/debt-payoff-calculator/index.html',
  'CoastFireCalculator.tsx': 'finance/coast-fire-calculator/index.html',
  'MortgageCalculator.tsx': 'finance/mortgage-overpayment-calculator/index.html',
  'UkErcCalculator.tsx': 'finance/uk-early-repayment-charge-calculator/index.html',
  'QuickCost.tsx': 'index.html',
};

/** Slot names from the island's exported `Prose` interface. */
function declaredSlots(source) {
  const block = source.match(/export interface Prose \{([\s\S]*?)\n\}/);
  if (block === null) return null;
  return [...block[1].matchAll(/^\s*readonly (\w+)\??:/gm)].map(([, name]) => name);
}

if (!(await exists(DIST))) {
  console.error(`FAIL: ${DIST}/ not found. Run \`npm run build\` first.`);
  process.exit(1);
}

const files = (await readdir(ISLANDS)).filter((name) => name.endsWith('.tsx'));
const problems = [];
let checked = 0;

for (const file of files) {
  const source = await readFile(join(ISLANDS, file), 'utf8');
  const slots = declaredSlots(source);

  if (slots === null) continue; // island takes no prose slots

  const host = HOSTS[file];
  if (host === undefined) {
    problems.push(
      `${file} declares a Prose interface but no page is mapped to it in HOSTS`,
    );
    continue;
  }

  const page = join(DIST, host);
  if (!(await exists(page))) {
    problems.push(`${file} maps to ${host}, which the build did not produce`);
    continue;
  }

  if (slots.length === 0) {
    problems.push(`${file} exports an empty Prose interface`);
    continue;
  }

  const html = await readFile(page, 'utf8');

  for (const slot of slots) {
    const rendered = html.includes(`<astro-slot name="${slot}">`);
    const declared = html.includes(`data-astro-template="${slot}"`);
    checked += 1;
    if (!rendered && !declared) {
      problems.push(
        `/${host.replace(/index\.html$/, '')} is missing slot "${slot}" (declared in ${file})`,
      );
    }
  }

  // A slot name with a hyphen or underscore renders at build time and hydrates
  // to undefined: @astrojs/preact camel-cases slot names on the server pass and
  // does not on the client pass. The prose would vanish the moment the island
  // wakes up, which no static check of the HTML could see.
  for (const slot of slots) {
    if (/[-_]/.test(slot)) {
      problems.push(
        `${file} declares "${slot}" — slot names must be single words, or they hydrate to undefined`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error(`FAIL: ${problems.length} island slot problem(s):\n`);
  for (const problem of problems) console.error(`    ${problem}`);
  console.error('');
  console.error("  Each name in an island's Prose interface needs a matching");
  console.error('  <Fragment slot="name"> on the page that mounts it. A missing one');
  console.error('  removes a rule 8 disclosure without failing anything else.');
  process.exit(1);
}

console.log(
  `PASS: ${checked} island slot(s) across ${files.length} calculator(s) all reach the page.`,
);
