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
finance page, and sub-theming an eleven-page site fragments it for no gain.

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

**It is now tight — the worst page sits 0.18KB under.** A third calculator will
breach it. The honest fix then is structural (hydrate the below-fold chart and
schedule with `client:visible`), not another increment.

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
