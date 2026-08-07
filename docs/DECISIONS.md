# Decisions

Why this codebase is the way it is.

`CLAUDE.md` says **what** the rules are. This file says **why**, and what was
rejected — so a decision that took an afternoon to reach is not undone in five
minutes by someone who only sees the rule.

Every entry records the reasoning and, where it exists, the measurement. If you
disagree with one, disagree with the reasoning; do not just change the rule.

---

## Positioning

### D1 — Compute, never advise

The operator has no financial qualification and no budget for a credentialed
reviewer. Advice-shaped content from an uncredentialed author in a
Your-Money-Your-Life category is the fastest route to a helpful-content
demotion, and no amount of technical quality offsets it.

So the site does arithmetic and shows its working. It never says what someone
should do. This is not a limitation being managed — it is the positioning, and
it is stated plainly on `/about` because saying it openly is stronger than
hiding it.

**Enforced at build time**, not by review: `src/content.config.ts` rejects
titles matching `Should you…`, `5 ways to…`, `The best way to…`, `Why you
should…`.

### D2 — Build only what can be proved from first principles

If verifying an output needs expertise we do not have, the tool is out of scope
regardless of its traffic.

Permanently excluded: tax withholding, payroll, capital gains, equity
compensation (RSU/ISO/NSO/ESPP), retirement contribution rules, anything needing
a tax table.

This costs real traffic — those are the biggest categories in the vertical — and
`/methodology` says so publicly. A calculator whose output nobody here could
check can be confidently, consistently wrong without anyone noticing, and that
is the one failure this site cannot survive.

**This rule killed the original plan's tool #5** (equity comp), which had been
scheduled on the false premise that the operator had domain expertise there.

### D3 — Ledger visual identity

The product is schedules and worked arithmetic; that artefact has a visual
tradition. Warm paper rather than white (a document to keep, not a form to fill
in), dark green-black ink rather than black, one banknote-green accent, Georgia
for headings.

A system serif was chosen over a self-hosted webfont because it is the largest
character gain available at **zero bytes**.

Applied site-wide rather than scoped to finance pages: every page here is a
finance page, and sub-theming a ten-page site fragments it for no gain.

---

## Correctness

### D4 — Money is an integer count of minor units, behind a branded type

`0.1 + 0.2 !== 0.3`. Every amount is whole cents. `Minor` is branded so
`add(balance, 5)` is a compile error — 5 is ambiguous between cents and dollars.

That guarantee has a regression test: `tests/calc/money.test.ts` contains
`@ts-expect-error` directives which become *unused* (and therefore fail
typecheck) if the brand ever stops working.

### D5 — Rounding is specified behaviour, and the float tolerance is not optional

Integer cents do not fix everything. `1.005 * 100 === 100.49999999999999`, so
naive rounding gives $1.00 where correct half-up gives $1.01 — the most common
currency bug in JavaScript.

Boundary comparisons use a tolerance of **eight ULPs**, chosen rather than
reached for: `1e-9` relative was tried and is actively wrong, dragging
`104166.49995` upward at realistic magnitudes.

Policy: rounded **every period, not at the end** (a statement rounds monthly and
carries it forward); **half away from zero**; **the final payment absorbs the
drift**.

### D6 — The debt tool and the investment tool use different compounding, deliberately

`debt-payoff.ts` uses `annualRate / 12`, because that is how lenders quote an
APR and how a statement computes a month's charge.

`coast-fire.ts` uses the effective rate, `(1 + r)^(1/12) − 1`, because a stated
annual *return* compounds to that figure over the year. For 7%: 0.5654% vs
0.5833%. Dividing would overstate a 30-year projection by several percent,
always flatteringly.

Same word, different meaning, because the underlying contracts differ. Both have
fixtures asserting their convention.

### D7 — Fixtures must be anchored to something outside this codebase

A test comparing our code to our own expectations proves self-consistency, not
correctness. Every engine is checked against a published figure:

| Engine | Anchor | Result |
|---|---|---|
| debt payoff | standard loan formula: $10,000 @ 6% over 60 months → $193.33 | 60 months, **$1,599.68 interest — exact match** |
| coast fire | compound interest: $100,000 @ 7% × 30y → $761,225.50 | **42 cents** drift over 360 roundings |

**Assert exact values, not tolerances.** Two drafts used loose bounds ("under a
dollar", "within 50 cents") that were 50× wider than reality and would have
absorbed a genuine rounding regression. The technique that fixed both: write a
deliberately wrong assertion, read the real value from the failure, then assert
that.

---

## Stack

### D8 — Preact, not React

React + react-dom is ~45KB gzipped. The whole per-page budget is 18KB. This is a
constraint, not a preference. `compat: true` means JSX is authored exactly as
React would be.

### D9 — Zod is build-time only and must never reach an island

Importing `lib/schema.ts` into a calculator put **28.64 KB** on a page with a
15KB budget — 309 references to `zod` in the bundle.

Zod stays for content frontmatter and generated-data validation, where it runs
at build and costs the visitor nothing. Client-side parsing is `lib/params.ts`:
~60 lines, no dependencies, same semantics. `lib/schema.ts` carries a header
saying so.

### D10 — The JS budget is 18KB, and it is derived

Measured fixed cost is **12.48KB**: preact 4.31, Astro hydration client 1.36,
hooks 1.13, shared UI/lib chunk 3.42, Astro's inline island bootstrap 1.73,
theme script 0.53. That leaves ~5.5KB for an individual calculator.

It was 15KB until PR #8, picked from rough arithmetic before any of that had
been measured. Two of those lines (the inline ones) were only discovered in
PR #9 when the gate started counting inline scripts.

**The worst page sits 0.58KB under**, after D28 moved static prose out of the
islands. It was 0.08KB before that — and this entry said 0.18KB, as did the
gate's own header comment, both stale by a tenth of a kilobyte for at least two
pull requests. Nothing checks the JS figures quoted in the documentation; the
page counts next to them are checked, which is why they are right (D27).

The honest fix, if it tightens again, is structural — more prose out of the
island, or hydrating the below-fold chart and schedule with `client:visible` —
not another increment.

Raising it again requires the same treatment: measure, record the components,
state what it still forbids. It must always forbid React, any charting library
(40KB+), and a schema library reaching an island.

### D11 — No PDF library; a print stylesheet instead

jsPDF unpacks to 30MB (~90KB gz), pdf-lib to 19MB. Against the budget neither
was ever available.

The browser's print pipeline is better anyway: selectable text, real typography,
and the SVG chart prints as **vector** rather than a raster. The printed
document is designed — masthead with the scenario URL so a recipient can reopen
and change the figures, debts as a clean table, complete schedule, headers
repeated across pages.

Two things needed JS rather than CSS: collapsed rows are not in the DOM (a
`beforeprint` listener expands them), and forcing `<details>` open via CSS
depends on beating a UA stylesheet Chrome has re-implemented more than once
(so `open` is set directly).

### D12 — The schedule table does not virtualise

Against the literal wording of rule 10, read as its intent — *do not jank the
page*. Progressive disclosure serves that better: Ctrl+F finds a row, it prints,
it costs no library, and 600 table rows is not a performance problem. A
virtualised table is unsearchable and absent from printouts, which is terrible
for a document people open specifically to inspect.

---

## Privacy

### D13 — Calculator inputs never leave the browser, and this is structural

There is no backend, so there is nothing that *could* receive them. Events may
record that a calculation completed, never what was calculated.

### D14 — Shareable URLs carry figures, never names

`encodeDebts` deliberately omits debt names. A URL pasted into a forum, caught
in a screenshot or attached to a ticket would otherwise reveal who someone owes
money to. Restored links show "Debt 1", "Debt 2".

### D15 — `localStorage` only for something explicitly chosen

The theme toggle writes on click and never on load. That is the exception
`CLAUDE.md` allows; storing a preference nobody expressed would not be.

### D16 — No contact form

A form needs a backend we do not have, or a third-party embed that would load
tracking onto pages whose whole claim is that they load none. An email address
and a public issue tracker are less fashionable and more honest. `/contact`
explains this to visitors.

---

## Process

### D17 — Two Worker routes are permitted; nothing else

`/go/*` for affiliate redirects and `/api/subscribe` for email capture. Both
stateless, both behind `lib/ports/`. **Never** KV, D1, R2 or Durable Objects —
those are what would make the site genuinely Cloudflare-only.

### D18 — Making a check report more detail keeps finding real bugs

Four times now:

1. The byte budget reported an island page at 1.09KB — it was not parsing
   `<astro-island>` attributes at all.
2. Made to print a per-module breakdown, it disproved a prediction (that
   `@preact/signals` was reclaimable — it is a *dynamic* import and already
   costs zero) and found the real culprit: a link-prefetch runtime shipping to
   every page for a feature never used.
3. It was never counting inline scripts, hiding 1.73KB of Astro island bootstrap
   that had shipped since PR #5.
4. Six site-wide navigation links were 404s for three PRs because nothing
   checked. `scripts/check-links.mjs` now does.

Corollary: **a gate that has never failed is not a gate.** Both the byte budget
and the link checker were deliberately broken once to prove they exit non-zero.

### D19 — Trust pages came before the second calculator

Six links in the site-wide nav and footer were 404s. "Clear navigation, every
page reachable within two clicks" and "no placeholder pages" are explicit
AdSense criteria, and a site whose own footer does not work undercuts the single
claim it makes about carefulness.

### D25 — Ornament is inline SVG in the ledger idiom, generated at build

The pages were text-only and read as bland. The identity (D3) already points
somewhere specific: guilloché — the engine-turned pattern engraved on banknotes,
passports and share certificates.

`components/ornament/Guilloche.astro` draws it as **rotated ellipses**, not a
plotted hypotrochoid. A real parametric curve needs a few hundred coordinates
and gzips to about 1.5KB; twenty-eight rotated ellipses read the same at a
glance and cost a fraction, because each is one number in a transform.

`.astro`, so it renders at build time and ships **zero JavaScript** — this is
why an image library or an icon set was never considered. Stroked in
`currentColor`, so it inherits the theme without knowing one exists.
`aria-hidden`, because it carries nothing a reader would miss.

Used sparingly: faint behind two page headings, and as a section rule. The site
is a serious tool and ornament that draws attention to itself would undercut it.

### D29 — The note, not the ledger: how far the identity goes

D3 chose the ledger — warm paper, green-black ink, one banknote accent — and D25
added guilloché to two page headings. That was too quiet. The operator's verdict
on the live site was "bland and boring", and it was right: the identity existed
in the tokens and almost nowhere on the screen. A calculator page carried none of
it at all, because D25 scoped the ornament to `/` and `/methodology`.

So the reference moves from *ledger* to *banknote*, and it is applied
site-wide through the layout rather than page by page. Four pieces:

- **Engine-turned paper.** Two sets of hairlines crossing at ±58°, as
  `repeating-linear-gradient`, at 5% alpha. Gradients rather than an SVG data
  URI because a data URI would have to hardcode its stroke colour and could not
  follow the theme. Text never sits on it — panels are opaque `--color-surface`
  — so it costs nothing in contrast.
- **`LatheBand.astro`** — two sine chains in opposing phase, braided. Tiled from
  a single 24px `<pattern>`, so one tile covers any viewport for fixed bytes.
- **`Rosette.astro`** — a radial medallion, the counterpart to `Guilloche.astro`.
  Both exist because they fail differently: the lens bundle turns into a blob
  below about 80px, the rosette stays legible at 28px in a corner.
- **`NoteFrame.astro`** — heavy outer rule, hairline inset, rosette in each
  corner. The double rule is what does the work; one border reads as a card, two
  unevenly weighted read as intaglio.

Plus `.engraved` and `.engraved-fine`: serif, full caps, wide letterspacing. The
institutional voice, and free, because the face is already a system serif (D3).

**Deliberately banknote-*idiom*, not US currency.** Guilloché, lathe work and
struck rosettes are the general vocabulary of security printing — share
certificates, passports, bond coupons. No Treasury or Federal Reserve seal, no
portrait, no denomination, no reproduction of any real note. That is the right
call on its own terms: a site that computes rather than advises should not open
by imitating government paper.

**Still zero JavaScript.** Every ornament is `.astro`, rendered at build. Content
pages remain at 0.53KB — the inline theme script and nothing else.

**Contrast measured, not eyeballed**, because PR #9 shipped a 4.15:1 regression
that only measurement caught. Every text/background pair on the homepage, both
themes, resolved through a canvas (`getComputedStyle` returns `oklch()` in
Chrome, and parsing those three numbers as RGB gives plausible nonsense — the
first attempt at this check reported 1.29:1 for every element on the page). The
tightest real figure is `.engraved-fine` at **4.95:1** dark, **5.39:1** light.

### D30 — The masthead is a band of ink, and `--color-line-strong` was failing

Two complaints from the operator, both correct, both measurable:

**"No contrast between the header and the background."** The masthead was
`--color-surface` on `--color-canvas` — two shades of cream a hairline apart. It
is now a **band of dark ink** with its own token set (`--color-masthead*`),
because text on it can never take `--color-ink`. Dark in the light theme, darker
still in the dark one, so it separates in both directions rather than inverting.

Two dark fields cannot reach 3:1 against each other — in the dark theme the band
measured **1.06:1** against the canvas, and no amount of nudging fixes that. So
the **boundary** carries it instead: a 2px `--color-brand` rule. Brand inverts
with the theme, so that rule is **7.48:1** in light and **8.79:1** in dark. WCAG
1.4.11 asks for a distinguishable boundary, not a distinguishable field.

**"A lot of buttons have no contrast with the background."** Also right, and it
was a *token* defect rather than anything to do with the buttons:

| | Was | Now |
|---|---|---|
| `--color-line-strong` on surface, light | **1.92:1** | 3.65:1 |
| `--color-line-strong` on surface, dark | **2.04:1** | 4.05:1 |
| Primary button text, dark | **2.18:1** | 8.79:1 |

Every control on the site takes that token, so every control was failing WCAG
1.4.11's 3:1 for the boundary of a UI component. Fixing the token fixed all of
them at once — which is the argument for tokens, and the reason a component may
never hardcode a colour.

The dark-theme primary button failed differently: `--color-brand` is a *light*
green in dark, and `text-white` on it is 2.18:1. It is now `text-canvas`, which
inverts with the theme — near-white on dark green in light, near-black on light
green in dark. One class, correct in both, no theme-conditional markup.

Controls are also now **filled rather than outlined**, with the primary action
solid brand. An outline button on a textured field reads as a label, not a
control.

**Cost: 0.06KB** on the worst page (17.42 → 17.48, 0.52 spare) — longer class
strings in the islands. Recorded rather than waved through, because that is the
budget being spent on something.

This is the third contrast defect found by measuring and the third that every
automated gate passed. Contrast checking in CI is Next item 4, and it must
resolve colours through a canvas: `getComputedStyle` returns `oklch()` in
Chrome, and the first version of this check reported 1.29:1 for every element on
the page because it parsed those three numbers as RGB.

### D26 — Indexability is an invariant, and it is checked

**The homepage shipped with `noindex` for six pull requests.** Set in PR #5 when
the site had two pages and the calculator was unfinished; nothing ever removed
it. At launch, the single most important page would have been silently invisible
to Google, and the failure mode is silence — no error, no warning, just no
traffic ever.

`scripts/check-links.mjs` now asserts: a page is either **in the sitemap and
indexable**, or **noindex and out of it**. Anything else is a contradictory
signal. `/404` and `/dev/*` are the only legitimate exceptions.

This is the fifth time a check found something real by being asked to look
(D18). It is also the second latent launch-blocker found by inspecting state
rather than writing new code — the first was six 404s in the site navigation.

### D28 — Static prose belongs to the page, not to the island

A sentence inside a Preact component is paid for twice: once as HTML in the
document, and once as the JavaScript able to re-render it. The second copy never
does anything, because the sentence never changes.

So the calculators now take their fixed prose from the `.astro` page as named
slots. Measured, gzipped:

| | Before | After |
|---|---|---|
| debt payoff island | 5.43 KB | **4.93 KB** |
| coast fire island | 3.95 KB | **3.73 KB** |
| worst page, total | 17.92 KB | **17.42 KB** |
| spare against the 18KB budget | 0.08 KB | **0.58 KB** |

0.72KB across the two islands, and headroom went from a rounding error to
something tool 3 can be built inside. It is also faster: @astrojs/preact wraps
slot content in `StaticHtml`, which sets `shouldComponentUpdate = () => false`,
so that prose no longer re-renders on every keystroke.

**It costs nothing in HTML.** Astro's island element re-reads rendered slots
from the DOM (`querySelectorAll('astro-slot')`) and only emits a
`<template data-astro-template>` copy for slots a conditional branch did not
render. The prose is in the document once, as it was before.

Three things about this that are not obvious, all found by reading the installed
package or the running page rather than by reasoning:

1. **Slot names must be single words.** `@astrojs/preact`'s server pass
   camel-cases them (`slotName()` turns `how-it-works` into `howItWorks`); the
   client hydration pass assigns `props[key]` from the raw template name. A
   hyphenated slot renders at build and hydrates to `undefined` — the prose
   vanishes the moment the island wakes up.

2. **TypeScript cannot enforce that a page passes them.** `astro check` types a
   framework component's children as `children`, not as named props, so
   declaring the props required *fails* on a page that passes all six
   correctly. They are therefore optional in the type and enforced in
   `scripts/check-slots.mjs` against the built HTML — the same reasoning as
   D24, where the defect only exists in the output.

3. **`<astro-slot>` is `display: contents`.** A margin from `space-y-*` lands on
   a box that generates no layout, so slot content sits flush against its
   neighbours. Every gate passed; the browser showed 0px where there should
   have been 12px. The fix is a real element on each side of the boundary: the
   island wraps the slot in a plain `<div>` to take the outer gap, and the page
   wraps its own content in `space-y-3` for the inner ones. Single-paragraph
   slots avoid the problem entirely by keeping the `<p>` in the island and
   passing only inline text.

The third is the reason the working agreement says to open a browser. It would
have shipped otherwise.

### D27 — "Pages" is two numbers, and only one of them is the build's

`docs/STATE.md` claimed **11 pages for two pull requests**. The build has
produced ten since PR #5. The figure was not stale — `git log -S` puts its
introduction at PR #11, and the tree at that commit already had exactly the ten
route files it has now. It was wrong on the day it was written, and nothing
recomputed it, because every other number in that table is printed by a gate and
this one was typed.

The two numbers, kept separate deliberately:

- **Pages built — 10.** What `astro build` reports and what
  `check-js-budget.mjs` enumerates. A mechanical fact.
- **Substantive pages — 9.** The AdSense criterion. `/404` is excluded: it is an
  error page, it is correctly absent from the sitemap (D26), and counting it
  toward "15+ substantive pages" would be claiming credit for a page nobody
  navigates to on purpose.

They differ by one today and will differ by one forever, which is exactly why a
single number invited the conflation. Same reasoning as the insistence that
content pages ship 0.53KB rather than "zero" (rule 9): a small inaccuracy in a
document whose entire argument is carefulness is not small.

`scripts/check-state.mjs` now derives both from `dist/` and fails if `STATE.md`
disagrees — in the Status table, the AdSense table, or the prose in Next, since
the same count stated three ways is two chances to update one of them. A missing
claim fails too: rewording a sentence must not silently retire the check on it.

It deliberately does **not** check the JS byte figures. They are derivable, but
only by importing `check-js-budget.mjs`'s module-graph measurement, and
destabilising the project's most safety-critical gate to police a document is a
bad trade. Worth revisiting when tool 3 moves those numbers.

### D21 — Emailing reports is rejected, not deferred

Requested by the operator and then withdrawn, correctly. The site's proposition
is that nothing you type leaves your device; emailing a report requires
transmitting the figures, which breaks it literally rather than technically.

Recorded so it is not re-proposed as "just a small endpoint": Cloudflare Workers
**cannot send mail** — V8 isolates block raw TCP so SMTP is impossible, and
Email Routing is inbound-only. It would need a third-party API, a key that
cannot live in client code, a second DKIM setup alongside Hostinger's, and abuse
protection, because an unprotected send endpoint is a spam relay that would
poison the domain's reputation including `hello@`.

If "keep a copy" is wanted again, the answer already exists: **Save as PDF or
print**. Zero bytes, transmits nothing, better document than a generated
attachment.

### D22 — The name on a printed report is local-only

A name field titles the PDF. It is deliberately **not** in the URL and **not**
persisted — same reasoning as D14. A name in a shared link identifies whoever
shared it, which is the exact harm D14 avoids for lender names. It lives in
component state and dies with the tab.

### D23 — Deduplicating UI *across* islands can cost bytes rather than save them

`Stat` was byte-identical in both calculators. Extracting it to a shared
component made the debt payoff page **worse**: 18.01KB → 18.05KB. Moving code
into the shared chunk trades one well-compressed stream for two poorly-compressed
ones — the same phenomenon that made the first calculator heavier when the
second was added.

Reverted. **Measure before deduplicating across island boundaries.** The usual
instinct is wrong here. Deduplication *within* a single island is still free.

The 0.01KB breach was instead resolved by tightening prose written in the same
pull request — editing my own verbose copy, not cutting a feature to fit.

### D24 — Prose spacing is a build-time gate

Astro trims the newline between prose and an inline element, so

```
we keep anyway:
<strong>if verifying…</strong>
```

renders as `anyway:if verifying`. **49 instances shipped to live pages**, found
by a human reading the site — the worst possible way to find anything.

The defect is invisible in the source and invisible in review; it exists only in
the built HTML, so that is where `scripts/check-spacing.mjs` looks. Fix with an
explicit `{' '}`. Mark deliberate adjacency with `data-tight`
(`Quick<span data-tight>Oper</span>` is one word in two colours). `<sup>` and
`<sub>` are exempt because `1.05<sup>30</sup>` is correct.

### D20 — Build order, and the jurisdiction decision

Tools 1 and 2 (debt payoff, Coast FIRE) are **jurisdiction-agnostic on purpose**,
so the site could ship and index without betting on a market. The original plan
opened with mortgage, which forces that bet in week 2 on evidence nobody has.

Tool 3 (mortgage overpayment) is the first with market exposure. The recorded
decision is **United States first** — highest volume and revenue per visitor,
and where AI-assistant referrals concentrate, which is the channel where a
new domain is least disadvantaged. The organic difficulty is real and accepted;
ranking there is a long-tail exercise, not a head-term one.

---

## Superseded

Recorded so they are not re-proposed.

- **`@preact/signals` is not reclaimable.** Predicted in PR #4 as 2.95KB of
  headroom; it is loaded via Vite's `__vite__mapDeps` as a dynamic import and is
  never fetched, because no island passes a signal prop. It already costs zero.
- **`experimentalMinChunkSize` does not merge the shared UI chunk.** Rollup only
  merges chunks with a *single* importer, and both islands import it.
- **FAQ structured data buys no SERP real estate.** Google deprecated FAQ rich
  results on 7 May 2026. We still emit `FAQPage` because Bing and AI retrieval
  consume it, but it is not a ranking lever.
- **Astro's `prefetch` key must stay absent.** Declaring it *at all*, even as
  `{ prefetchAll: false }`, ships the link-prefetch runtime to every page.
