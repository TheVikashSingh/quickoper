# QuickOper — Agent Contract

Read this file before every task. If a request conflicts with it, say so and stop.

## Start here

Three files carry everything a new session needs. Read them in order:

1. **`CLAUDE.md`** (this file) — the rules. What you must and must not do.
2. **`docs/DECISIONS.md`** — why the rules are what they are, what was measured,
   and what was already tried and rejected. Read this before proposing a change
   to anything in here; several obvious-looking improvements have already been
   attempted and are recorded as superseded.
3. **`docs/STATE.md`** — what exists today, what is next, what is blocked on the
   operator.
4. **`docs/VERIFICATION.md`** — how to check every published figure against Excel,
   Google Sheets and the SEC's own calculator. Point anyone worried about an
   AI-written codebase at this rather than reassuring them.

These are the handoff. A session that has read them needs no other context, and
the git history plus pull request bodies carry the detail if a specific decision
needs re-examining.

**Keep them current.** A pull request that changes what exists updates
`docs/STATE.md`; one that makes a non-obvious call adds an entry to
`docs/DECISIONS.md`. Stale handoff notes are worse than none, because they are
believed.

## What this is

Static personal-finance calculators at `quickoper.com/finance/<tool>`.
Astro 7 + Preact islands + TypeScript (strict) + Tailwind v4.
Deployed to Cloudflare Workers static assets.

Subfolders, never subdomains. One repository, one Astro project, one deployment.

## The two rules that govern everything else

**A. Compute, never advise.** The operator has no financial credential and no budget for a
reviewer. This site does arithmetic and shows its working. It does not tell anyone what to
do with their money.

- Allowed: "Adding $200/month removes 4 years 7 months and $31,402 of interest from this
  schedule. Here is the month-by-month table."
- Forbidden: "You should pay off your debt before investing."
- Forbidden: any page whose title or H1 is a recommendation — "Should you…", "The best way
  to…", "5 tips for…".

Advice-shaped content from an uncredentialed author in a YMYL category is the fastest route
to a helpful-content demotion. Computation is defensible; opinion is not.

**B. Build only what can be proved from first principles.** If verifying the output requires
domain expertise the operator does not have, the tool is out of scope — no matter how
attractive the traffic.

Permanently excluded: tax withholding, payroll, capital gains, equity compensation
(RSU/ISO/NSO/ESPP), retirement contribution rules, anything requiring a tax table or
statutory cap.

The test: can someone with high-school mathematics check our output against a published,
citable third-party result? If not, don't build it.

## Version reality check — read before writing any config

Your training data skews toward Astro 4/5, React and Tailwind v3. All wrong here.

| You may recall | Correct here |
|---|---|
| `@astrojs/tailwind` integration | `@tailwindcss/vite` plugin under `vite.plugins` |
| `tailwind.config.ts` theme object | `@theme { }` block in `src/styles/global.css` |
| Fontsource npm packages | Astro's built-in Fonts API |
| React + `@astrojs/react` | Preact + `@astrojs/preact` (`compat: true`) |
| `astro:content` v1 collection API | Content Layer API with `loader:` |

If unsure of an API shape, **read the installed package's types or the docs — do not write
config from memory.** Dependencies are pinned to exact versions. Never use `^` or `~`.

## Hard rules

1. **`src/lib/calc/**` contains pure functions only.** No DOM, no Preact, no imports from
   `components/`. Every exported function needs a Vitest fixture test, with the source of
   each expected value cited in a comment above the fixture.

2. **Money uses integer minor units** via the helpers in `calc/money.ts`. Raw float
   arithmetic on currency is a bug, not a style preference.

3. **Rounding is specified behaviour, not an implementation detail.** Each calc module
   states, in code and in a comment:
   - where rounding happens (per period, never only at the end),
   - which direction (half-up on the minor unit unless a cited source says otherwise),
   - how the final period reconciles (a short or balloon payment absorbs the drift).

   At least one fixture per module must match a **real published third-party schedule**, not
   a formula we derived. That single test is the difference between "verified" and "tested".

4. **No new npm dependency** without stating in the PR body what it does and why a
   hand-rolled version is worse. The default answer is no.

5. **Charts use `components/chart/LineChart.tsx`** — a Preact component, because it must
   re-render when calculator inputs change. Never an `.astro` component; those render at
   build time. Do not install Recharts, Chart.js, D3, or any charting library.

6. **Content frontmatter must satisfy `src/lib/schema.ts`**, including `lastVerified`,
   `sources[]` and `author`. An undated calculator page must fail the build.

7. **Files in `src/data/` are generated** and schema-validated at build time. Never
   hand-edit them. No data pipeline exists until a tool actually needs jurisdiction data —
   do not build one speculatively.

8. **Every calculator page needs all of:** the working tool, a "how this was calculated"
   disclosure showing intermediate values, the full schedule, 800+ words of original
   derivation and worked example, an FAQ block, sources with dates, and the
   not-financial-advice disclaimer. A page missing any of these is not done.

9. **Client JS budget: under 18KB gzipped** per calculator page. Article and content
   pages ship **zero**. Enforced by a byte-count assertion in CI against the built
   output — a deterministic gate, not a Lighthouse score.

   **Inline scripts count**, not just fetched modules. A browser executes both.

   The number is derived, not chosen. Fixed cost is 12.48KB: preact 4.31, Astro
   hydration client 1.36, hooks 1.13, shared UI/lib chunk 3.42, Astro's inline
   island bootstrap 1.73, theme script 0.53. That leaves ~5.5KB for an individual
   calculator. It was 15KB until PR #8, picked before any of it had been measured.

   Content pages ship **0.53KB** — the inline theme script and nothing else. Not
   literally zero, and saying "zero" when it is 0.53 would be the kind of small
   inaccuracy this project cannot afford elsewhere.

   **Raising it again requires the same treatment:** measure the floor first, write
   down what the number is made of, and state what it still forbids. It must always
   forbid React (~45KB), any charting library (40KB+), and a schema library reaching
   an island (Zod cost 15.7KB when it did). "This change needs the budget raised" is
   still evidence the change is wrong until proven otherwise.

10. **Every calculator outputs more than a number.** A single computed figure is something a
    chatbot gives away free; it is not a product. Each tool ships all four of:
    - a full period-by-period schedule (virtualised past a few hundred rows),
    - a chart,
    - a side-by-side comparison against the do-nothing baseline,
    - CSV download, generated client-side.

11. **Calculator state lives in the URL** as short query params (`?p=350000&r=5.2&y=25`).
    Written on change, debounced, via `replaceState`; read on load. Params are parsed and
    range-checked through Zod and rendered **as text only** — never interpolated into HTML,
    an attribute, or an SVG `<title>`. A malformed param resets to default and is not echoed
    back. Permalinks carry `<link rel="canonical">` to the clean tool URL and never enter the
    sitemap.

12. **Affiliate links go through `/go/<partner>`**, never direct. `rel="sponsored nofollow"`.
    Disclosure above the link on any page carrying one.

13. **Multi-jurisdiction pages must differ in logic, not in place name.** Before creating a
    country variant, state in the PR body which *rule* differs and cite it. UK early
    repayment charges are a different calculation — legitimate. "Texas mortgage calculator"
    is a different word — forbidden. When no rule differs, use one page with a
    currency/locale switcher. **No `switch (country)` anywhere** — jurisdiction modules
    register against the contract in `calc/contracts.ts`.

## Backend policy

The site is static. Two stateless exceptions, same Worker, both behind `lib/ports/`:

- `/go/*` — affiliate redirects
- `/api/subscribe` — email capture proxy

Nothing else. No database, no session, no user state, no server-side calculation. Never use
Cloudflare KV, D1, R2 or Durable Objects — they are what would make this genuinely
Cloudflare-only. A tool that cannot run in the browser is out of scope.

## Privacy is a hard engineering constraint

**No calculator input may ever be transmitted, logged, or attached to an analytics event.**
Events record that a calculation completed, never what was calculated. The claim "your
numbers never leave your device" must remain literally true. Nothing goes in `localStorage`
that the visitor has not explicitly chosen to save.

## Style

- Tailwind utilities only. No inline styles, no CSS modules, no styled-components.
- Design tokens live in the `@theme` block in `src/styles/global.css`. Never hardcode a
  colour, font size, or spacing value inside a component.
- Islands hydrate with `client:visible`, or `client:load` above the fold.
- Fonts via Astro's Fonts API, Latin subset, one preloaded weight. Never the Google Fonts CDN.
- Prefer native `<details>`, `<select>`, `<dialog>` over a primitives library. We do not ship Radix.
- Accessibility is not optional: labelled inputs, keyboard operable, visible focus rings,
  4.5:1 contrast minimum. Numeric inputs get `inputmode="decimal"`.
- Mobile first. The calculator must be usable without scrolling on a 375px viewport.

## Page structure (enforced, not suggested)

```
<Calculator />        island, above the fold
<HowCalculated />     disclosure: formula + intermediate values
<Schedule />          full period-by-period table + CSV export
<EmailCapture />      "email me this schedule" — result-driven, not generic
<Explanation />       800-1500 words: derivation, worked example, assumptions
<FAQ />               3-6 questions, FAQPage JSON-LD
<Sources />           each figure, its source, its date
<Disclaimer />        visible without expanding
<RelatedTools />      2-3 genuine internal links + the cluster hub
```

`FAQPage` JSON-LD note: Google deprecated FAQ rich results on 7 May 2026. We still emit it —
Bing and AI retrieval systems consume it — but it buys no SERP real estate. Do not optimise
it for rich snippets.

## Structured data and AI retrieval

`WebApplication` (`applicationCategory: FinanceApplication`) on tool pages, `BreadcrumbList`
everywhere, `Organization` + `Person` (author, with `sameAs`) site-wide.

AI assistants are a first-class traffic channel, not an afterthought — they weight structure
and specificity far more than backlink profile, which is the one axis on which a new domain
is not automatically last. Therefore:

- Maintain `/llms.txt` listing every tool: what it computes, inputs, jurisdiction, methodology URL.
- Allow AI crawlers in `robots.txt`. Do not block them.
- State key facts as flat, quotable sentences that stay true standalone.
- The methodology page is written to be machine-read: formula, assumptions, fixture sources,
  under stable headings.

## Workflow

- Branch per unit of work: `feat/<name>`. **Never commit or push to `main`.**
- Never `--force` in any form, never `git reset --hard`, never `git clean -fdx`, never rebase
  a shared branch, never delete a branch or tag, never merge your own PR, never run
  `wrangler deploy`, never modify branch protection or workflow permissions.
- Open a PR. CI must pass: typecheck, Vitest, secret scan, JS byte budget.
- Explain trade-offs in the PR body, not just what changed.
- One tool per session. Long sessions produce inconsistent output and unreviewable diffs.

## Never do

- Generate a set of pages that differ only by a place name.
- Invent a rate, threshold, cap or figure. If the value is not in `src/data/` with a cited
  source, **stop and ask**.
- Ship prose that reads as generic AI output. Every page needs at least one thing a model
  could not have produced: a worked example with real numbers, or a documented comparison
  against a named competitor's output showing where we differ and why we are right.
- Add analytics beyond the approved stack without being asked.

## Definition of done for v1

Five calculators live, 15+ substantive pages, trust pages published, sitemap submitted,
AdSense application submitted, at least one affiliate or paid revenue path live and
instrumented.
