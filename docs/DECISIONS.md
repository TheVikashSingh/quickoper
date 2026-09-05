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

### D31 — The entity graph, and the trust signal that was never emitted

CLAUDE.md has required `Organization + Person (author, with sameAs)` site-wide
since the first commit. **`Person` was on zero of ten pages for seventeen pull
requests**, and `Organization` carried no `sameAs` either. Found by auditing the
built output rather than by anything failing, which is the sixth time that has
been how a real defect surfaced (D18, D26).

This one is expensive rather than untidy. The site is YMYL content on a domain
with no history, and its entire pitch is that the arithmetic is checkable by a
named person. A search engine cannot attach credibility to an author it cannot
resolve to an entity — the missing node was the one carrying the answer to the
first question anyone asks of financial content from an unknown name.

Now emitted on every page, and **linked rather than merely present**: `@id` on
each node, `founder` from Organization to Person, `publisher` from WebSite to
Organization. A bare Person beside a bare Organization is two orphans; the
cross-references are what make it a graph a consumer can traverse.

`knowsAbout` claims **deterministic financial arithmetic, amortisation, compound
interest and rounding policy** — not financial expertise. Claiming the latter
would be false and is exactly what D1 forbids. `sameAs` carries the one identity
claim that can be verified by following a link, and nothing invented.

`scripts/check-schema.mjs` now enforces it, including that Person has a
`sameAs` — an identity asserted with no way to confirm it is worth little.
Proven to fail by removing the Person node and rebuilding: **exit 1**, ten pages
named; exit 0 once restored.

**Also: `twitter:card` was lying.** Every page declared `summary_large_image`
and no page supplied an `og:image`, so the card rendered as an empty box
everywhere the site was shared. Downgraded to `summary`, which is accurate.
Restoring the large card needs a real 1200×630 raster: SVG is not accepted by
card renderers, and generating a PNG at build time means satori or sharp — a
dependency against rule 4 for a social preview. Recorded as an operator task
rather than left as a silent defect.

### D32 — The homepage proves rather than claims, and the proof is computed

The operator: *"looks very bland", "the user has like 3 seconds to decide".*
Both fair. The homepage led with three abstract trust claims and put the
calculators below them — so a visitor who arrived wanting a debt calculator had
to scroll past an argument about why we are trustworthy before reaching one.

Three changes, in order of how much they matter:

**1. The tools moved above the fold.** Two buttons in the hero, primary and
secondary. This is the largest bounce-rate lever on the page and it is pure
information architecture, not copy.

**2. A real curve replaced the empty space.** `ProofChart.astro` draws the
balance falling to zero — and the page *computes it at build time by importing
the actual engine* and running the calculator's own default scenario. 19 months
against 77, $5,021.37 saved, all produced by the same code the tool runs.

It is not a stock illustration and it cannot go stale: change the engine and the
homepage changes with it. It also cannot overclaim, because the homepage has no
way to state a saving the product does not produce. Zero client JavaScript —
`.astro` frontmatter never reaches the browser, and the page still measures
0.53KB.

**3. The copy names the differentiator instead of asserting quality.** "What the
big comparison sites will not give you" is about *incentives*, which is checkable,
rather than about accuracy, which is not. A lead-generation site needs an email;
this one has no backend to send anything to. That is a structural difference a
large publisher cannot copy without cannibalising its own revenue.

**What was deliberately not done:** no illustration library, no icon set, no
stock imagery. The visual interest comes from the thing the site actually makes.
A calculator site whose homepage shows a drawing of a calculator is decorating;
one that shows its own output is demonstrating.

**On the strapline.** "Quickly operate" now sits under the wordmark, because an
unexplained coinage reads as arbitrary on a site whose whole argument is that
nothing is arbitrary. It is explicitly **not** the value proposition and should
not be asked to carry one — nobody reads a masthead strapline in three seconds.
The H1 and the curve do that work.

### D33 — Readability first, and the dark default is a product call, not an accessible one

Four requests from the operator, and they do not all pull the same way.

**Type scale — the clear win.** The root is now `106.25%` of the *reader's own*
default rather than a fixed pixel size, so someone who has enlarged text in
their browser keeps that enlargement and gets 6.25% on top. A px value here
would have overridden their setting, which is the opposite of the intent.

`--text-xs` went 0.75rem → 0.8125rem and `.engraved-fine` 0.625rem → 0.75rem.
The second was rendering at **10px** and carried field hints, stat labels and
the footer line. 10px is indefensible for a reader with presbyopia, and "they
can zoom" is not an answer when the page is built out of it. Body leading is
1.65.

**`prose-like` did nothing.** It was applied on five pages and defined in no
stylesheet. It now caps the measure at 68ch and sets 1.75 leading on paragraphs
— which is what makes widening the shell safe.

**Layout — wider shell, same measure.** `max-w-3xl` → `max-w-4xl` (952px at the
new root), FAQ answers in two columns above `lg`. That is the honest reading of
"less scrolling": more content per row where content tolerates it, never a
horizontal scrollbar, and sentences still capped at a length the eye can track
back from. Horizontal *scrolling* was not implemented and should not be — it is
an anti-pattern on the phones that will be most of the traffic.

**Dark by default — and this one is a trade, stated openly.** `prefers-color-scheme`
is no longer consulted: a visitor whose system says light still lands in dark,
until they use the toggle.

That is a legitimate product decision and it was asked for. It is **not** the
accessible choice for the audience the same request wanted to protect. A bright
field constricts the pupil, which deepens focus and directly helps hypermetropia
and presbyopia; light text on a dark ground haloes for the astigmatism that
usually accompanies them. Dark helps light sensitivity and migraine instead.
Different readers, opposite answers.

Mitigated by a toggle on every page that persists for ever after. Reverting is
one edit — restore the `@media (prefers-color-scheme: dark)` wrapper in
`global.css` and the site respects the system again.

**A bug this nearly shipped:** the print stylesheet forced light via `:root`,
which now loses specificity to `:root:not([data-theme='light'])`. Every printed
schedule and saved PDF would have come out white-on-black — a full cartridge,
on a feature the site advertises. The print reset now carries the same
specificity.

**Tool pages got the homepage treatment.** An engraved eyebrow, a larger H1, and
`TrustStrip.astro`: three facts on one line above the calculator. A visitor
arriving from search has already decided they want a calculator — the question
is whether to trust *this* one, and it has to be answered without pushing the
tool down the page. Every claim is structurally true or links to the page that
proves it. No adjectives; "trusted" and "accurate" are what a site says when it
cannot say anything checkable.

### D34 — A calculator on the homepage, and the budget moves to 19.5KB

The homepage had nothing to *do*. Every element was build-time HTML, which is
excellent for bytes and useless for the three seconds a visitor spends deciding
whether to stay. Someone who types a number into a box has engaged; someone who
reads a value proposition has not.

**It is not a general calculator, deliberately.** calculator.net puts a
scientific keypad on its front page, and that is right for calculator.net —
it sells breadth. A four-function keypad here would demonstrate nothing this
site is good at, in a category where we have no advantage and no intention of
building one. `QuickCost` asks the one question the site answers better than a
chatbot: not "what is the number" but "what does the whole thing cost, and over
how long".

**It uses the real engine.** `compareStrategies` — the same function behind the
full tool. A closed-form approximation would have been ~2KB lighter and would
have disagreed by cents or by a month boundary, which on a site whose entire
pitch is checkable arithmetic is not a saving. Verified in the browser: teaser
and full tool both return **33 months and $2,113.21** for the same inputs.

**It hands off rather than competing.** The result carries a link that opens the
full calculator with the figures already loaded, using the URL params the tool
already reads. No schedule, no chart, no CSV, no PDF on the teaser — those are
the reason to follow the link. Asked for PDF export here and pushed back: it
would duplicate the print machinery and weaken the funnel it exists to feed.

**THE BUDGET MOVED, 18KB → 19.5KB.** Not for this widget's own bytes. A *second
island* means Rollup can no longer inline preact's jsxRuntime into a single
island chunk, so it becomes a shared chunk fetched by every calculator page.
The debt payoff page went **17.51 → 17.99KB with its own code unchanged**,
leaving 0.01KB of headroom — untenable.

That is D23 from the other side: splitting shared code across islands costs
bytes rather than saving them. It was reverted when it was optional; here the
second island is the product decision, so the cost is real and the budget
absorbs it instead of pretending otherwise. 19.5KB leaves 1.51KB of margin and
still fails instantly on React (~45KB), any charting library (40KB+), and Zod
reaching an island (15.7KB). `CLAUDE.md` rule 9 updated to match, because a
contract that states a false number is worse than one that states a hard one.

**Mobile was the real test and it failed first.** At 375px the hero pushed the
calculator to 774px — below the fold on the device most of the traffic will
use, which defeated the entire point. The lead paragraph alone was 208px tall.
Cut to one sentence, stepped down a size below `sm`, and the two tool buttons
(duplicated verbatim further down the page) removed. Input now sits at 616px of
an 830px viewport.

### D35 — Light is the default again

D33 made dark the default. Reverted after looking at it: harder to read cold,
which matches the optics — a bright field constricts the pupil, deepening focus
for the presbyopia and hypermetropia this audience is likely to have, and
light-on-dark haloes for the astigmatism that usually accompanies them. The
system preference decides again; the toggle still overrides in both directions.

Also fixed in passing: the **theme toggle's border measured 1.34:1** against the
masthead, the only control on any page below WCAG 1.4.11's 3:1. Found by
measuring every interactive element rather than by looking, which is the fourth
contrast defect found that way.

The debt calculator gained a **Reset to example** control. `Remove` worked per
row and the last row could not be removed at all, so there was no way back to a
blank slate — calculator.net has AC for the same reason.

### D36 — "No contrast" on headings was not a contrast problem

Reported against headings like "What you can pay each month". Measured through a
canvas: every `h2` and `h3` on the page sits at **16.05:1** — the highest ratio
this palette can produce. There was nothing to fix in colour.

The real fault was **hierarchy**. A section heading was 19px against 12.75px
body text, in the same ink, with no device marking where one section ended and
the next began. The eye had no edge to catch on, and "I cannot pick the headings
out" is reported as "no contrast" because that is what it feels like.

calculator.net solves this with coloured bars. A ledger solves it with a rule,
which is the idiom this site already speaks — so `.section-head` is the display
face at 1.375rem over a hairline running the width of the column. Measured
after: 23.4px Georgia with a 0.8px rule.

**Worth generalising:** when a contrast complaint measures fine, the answer is
almost never more colour. It is size, weight, spacing or a rule.

### D37 — The strategy toggle was live and provably inert

With a single debt, avalanche and snowball are the same thing: there is only one
order to pay one debt in. The toggle stayed clickable, `aria-pressed` flipped,
and every figure on the page stayed identical — which reads as broken software
rather than as "not applicable", and was reported as exactly that.

Now disabled below two debts, with a title attribute and a line saying why. The
prose that already explained the tie stays, because it is still true.

Found by the operator, not by any gate. No automated check here could have
caught it: the markup was correct, the state updated, the arithmetic was right.
It was only wrong as an interface.

### D38 — Every tool visible without scrolling

Two calculator links were removed from the hero in D34 to buy vertical space,
and put straight back. A visitor who came for a specific calculator should be
able to see whether it exists before deciding anything — that is the most useful
thing the top of the page can do, and it is what calculator.net gets right.

Compact rather than the large buttons that were removed: one line on a phone.
The row is also honest about its own length — it says "two calculators today"
rather than padding itself out to look fuller. Three tools are planned and none
are started; `STATE.md` Next is the list.

### D39 — Tool 3: mortgage overpayment, anchored to a competitor's published output

The first tool with market exposure (D20), and the first whose anchor is a named
competitor rather than a formula. calculator.net publishes, for $400,000 with
20% down at 6.706% over 30 years: **$2,066.16 a month, $743,818.78 over 360
payments, $423,818.78 of interest.** Our engine reproduces the payment **to the
cent**.

That is a stronger anchor than a formula we derived, and it is the "documented
comparison against a named competitor" CLAUDE.md asks every page to carry.

**Two real bugs, both found by fixtures rather than by review.**

**A "30-year" mortgage ran to 361 months.** The payment is rounded to the cent,
which puts it a hair *below* the exact amortising figure ($2,066.16 against
$2,066.1633), so the principal is never quite retired and a 361st payment of a
few dollars appears. Arithmetically defensible and wrong about the product: no
lender writes a 30-year loan that takes 361 months. The contractual term is now
a hard stop and the final payment absorbs the residue — **$2,070.07**, larger
than the others, which is what a real schedule does.

Rounding the payment *up* would also have fixed it, and was written first. It is
wrong for a different reason: $2,066.17 misses the published figure by a cent,
and matching the anchor is the entire point.

**"Overpay nothing" reported saving minus one cent.** The baseline capped at the
term and the comparison schedule did not, so they diverged by a month. A
comparison whose no-op is not a no-op is broken. Both now take the cap.

**Where we differ from calculator.net, stated on the page rather than buried.**
They report $423,818.78 of interest; we report **$423,821.51**, $2.73 more. They
carry the unrounded payment at full precision — which is why their "total of 360
payments" is $743,818.78 rather than $2,066.16 × 360 = $743,817.60, a payment
nobody could make. We charge the rounded payment a lender collects. Ours being
higher is the direction that makes sense: a payment rounded down retires the
loan marginally more slowly. Under a cent a month over thirty years.

Four assertions in the fixture were corrected **from measured failures**, using
D7's technique — write the guess, read the truth off the failure, assert that.
Every one is exact; no tolerances.

### D40 — The last two derivations, and citing a paper without quoting it

`/withdrawal-rate` and `/coast-number` complete the Coast FIRE cluster and take
the site to **15 substantive pages — the AdSense threshold, met.**

**The rule followed on citation, and it is worth stating as policy.** Both pages
cite Bengen (1994) and the Trinity Study (1998), and **neither quotes a number
from either paper.** The papers are cited for *what they studied*; every figure
on the pages is computed here from stated inputs. That is the only honest way to
reference research this project cannot independently reproduce, and it is what
"never invent a figure" means in practice when a source exists but is not to
hand: cite the study for its scope, derive the arithmetic yourself.

**The strongest thing on either page is a demonstration, not a claim.** Applying
the same ten annual returns in opposite orders to a $1,000,000 portfolio drawing
$40,000 a year:

| Order | After ten years |
|---|---|
| Bad years first | $1,573,834.11 |
| Good years first | $1,835,954.59 |
| **Difference** | **$262,120.48** |

Identical multiset, identical 10% arithmetic mean, **$262,120.48 apart.** That is
sequence-of-returns risk made concrete, it is fully derivable, and it indicts our
own Coast FIRE projection — which is a constant-rate model and therefore cannot
express it. Both pages say so.

Both also state the **coast number's real weakness** rather than burying it: the
same $1,000,000 target thirty years out needs $131,367.12 at 7% and $411,986.76
at 3%. More than three times the capital, from the assumption alone. A page that
only flattered the tool would not be worth citing.

The 30-year, 5% figure — **$231,377.45** — is deliberately the same one `/verify`
asks readers to reproduce with `=1000000/1.05^30` and the same one the calculator
returns. Three surfaces, one number, by construction.

### D41 — The mortgage calculator shipped orphaned, and now orphans fail the build

`/finance/mortgage-overpayment-calculator` merged in PR #27 linked from
**nothing**. Not the homepage, not the `/finance` hub, not the navigation. It was
in the sitemap and reachable by typing the URL, and that was the entire route to
it. The operator counted the tools on the landing page, got two, and asked where
the third was. He was right and every gate was green.

**Why nothing caught it.** `check-links.mjs` asked *"does every link resolve"* and
never *"is every page linked"*. Those are different questions, and only the
second finds a page nobody can reach. Seventh time a real defect surfaced because
a check was asked a question it had not been asked before (D18, D26, D31).

**Why it is expensive, not untidy.** Three separate harms: a visitor cannot find
the tool at all; the page accumulates almost no internal link equity so it will
not rank whatever its quality; and "every page reachable within two clicks" is an
explicit AdSense criterion. A tool that took a whole session to build and verify
was, in traffic terms, not shipped.

`check-links.mjs` now collects every internal `href` across the build and fails
on any page absent from that set. `/404` is exempt — it is reached by failing,
not by linking. Proven by stripping the inbound links from the built HTML: exit
1 naming the route, exit 0 restored.

**Also in this pass, at the operator's request:** the homepage tool row is now
solid dark buttons (`bg-masthead`, which is darker than the page in *both*
themes) rather than outlined text. The border is `--color-brand` rather than
`--color-masthead-line`, because in the dark theme a dark border on a dark page
is the same invisible-boundary failure D30 fixed for the masthead — brand
inverts with the theme and stays crisp against both.

### D42 — Two chart series were the same green, and colour was the only channel

The default palette opened with `--color-brand` and `--color-positive`:
**oklch hue 158 at 42% and hue 155 at 45%.** That is the same green. On every
chart the first two series were indistinguishable — avalanche from snowball,
contractual from overpaid, projection from target. The operator saw it; no gate
did, because nothing compares two colours to each other.

**The fix is not just better hues.** Colour is now one of *two* channels, and
the second is a dash pattern. Three reasons, each sufficient on its own:

1. **WCAG 1.4.1** — colour must never be the sole means of conveying
   information. Deuteranopia is the common form and it is precisely the one
   that merges green with amber.
2. **The printed PDF is a headline feature.** Measured greyscale luminance of
   the three series after the fix: **0.431, 0.465, 0.477** — nearly identical.
   Hue collapses entirely on a monochrome printer, so without a dash the three
   lines would be one. The fix is load-bearing, not belt-and-braces.
3. **Overlap.** Payoff curves run together for most of their length; a dash
   separates them even when the colours are perfectly distinct.

New order spreads the hues rather than clustering them — green (solid), amber
(dashed `7 4`), neutral ink (dotted `2 3`), red (dash-dot). Measured pairwise
RGB distance after: **107 to 164**, against roughly a dozen before.

**The legend swatch now draws the dash too**, as a tiny SVG line rather than a
coloured block. A solid swatch beside a dashed line is a legend that contradicts
its own chart, which is worse than none because it is believed.

Cost: 0.09KB on the worst page. 18.27KB of 19.5.

### D43 — The migration runbook, and the character that would have unverified the domain

`docs/DNS.md` carried a table of ten records and a warning that they were
operator-supplied and had never been checked against the zone. Checking them was
ten minutes of `nslookup`. Nine matched exactly — both MX, SPF, DMARC, three DKIM
CNAMEs, `autodiscover`, `autoconfig`.

The tenth was wrong, in precisely the way the file's own warning describes:

```
doc : google-site-verification=QrWqvXMiSI_pmA5-aYVgZ6bsYI1PZHVxcbekLA4NO8I
live: google-site-verification=QrWqvXMiSI_pmA5-aYVgZ6bsYl1PZHVxcbekLA4NO8I
index 25: doc "I" (U+0049) vs live "l" (U+006C)
```

Capital `I` where the zone has lowercase `l`. Indistinguishable in most fonts,
including the one this file is read in. Anyone recreating the zone by copying the
table would have dropped Search Console verification on a domain property, and
the failure is silent — the record resolves, the dashboard looks right, and
verification lapses later.

**The general lesson is the one D18 keeps producing.** The file already said
"verify against the export" and had said it for two pull requests; nobody had.
A warning is not a check. The values are now marked verified, with the date and
the resolver used, so the next reader knows whether the claim has been tested
rather than merely asserted.

**Three changes to the procedure, each removing a way the migration can go wrong.**

**Deploy before DNS.** The old step order attached the Worker custom domain after
the nameserver switch, which meant a first-ever deploy would be debugged with the
real domain already pointing at Cloudflare. The site is now proven on
`workers.dev` first. That also puts a real check under `public/_headers`, which
has never been served by anything and is assumed rather than known to work on
Workers static assets.

**Query the destination nameservers directly, before switching.** Cloudflare's
assigned nameservers answer for the zone before the registrar points anyone at
them. The old procedure asked for a visual review of the dashboard, which
confirms what was typed; querying confirms what will be *served*. This is what
converts the irreversible step into a safe one, and it is the check that would
have caught the character above without anyone noticing it by eye.

**Retire Vercel last, not first.** The operator's instinct was to close the
account up front, which is reasonable and slightly wrong: until mail passes on
the far side of the nameserver switch, the previous host is a free rollback
target. Reverting nameservers at Hostinger restores a fully working state only if
something is still there to serve.

**Also found, and it changes what launch means.** The apex was assumed parked.
It is not — it serves an unrelated earlier application from Vercel, a React SPA
with `/dashboard`, `/tracker`, `/checklists`, `/pricing` and `/blog`, with its own
`/sitemap.xml`. So this is a **replacement**, and the expected 404 spike is
correct behaviour rather than a defect to chase. No redirects are warranted:
none of that content has an equivalent here, and redirecting `/pricing` at a page
about amortisation would be worse than a clean 404.

`/about` and `/contact` exist on both sites with entirely different content.

**Only one step in the whole migration is irreversible**, and stating that
plainly is most of the value of the rewrite. Nameservers switch back in minutes;
a deploy is replaced by another deploy; a custom domain detaches; the Hostinger
zone stays as rollback for as long as it is left alone. The single unrecoverable
failure is mail that bounces while MX is wrong — the message is gone and the
sender gets a rejection the operator never sees. Everything in the ordering
exists to isolate that.

### D44 — The published contact address is the author's, not a role address

`SITE.email` was `hello@quickoper.com` and had been since the first commit. The
mailbox that actually exists is `vikash@quickoper.com`, on Hostinger Starter
Business Email, which includes one mailbox.

So the choice was: buy a second mailbox to match the code, or change the code to
match reality. Changed the code — and it is the better answer on its own terms,
not merely the cheaper one.

**A role address is the anonymous option, and anonymity is what this site argues
against.** D31 spent a whole pull request establishing a `Person` node with
`sameAs`, because a search engine cannot attach credibility to an author it
cannot resolve to an entity, and because YMYL content from an unknown name is
answering "who says so?" before anything else. `hello@` answers that question
with "a company", which is not true here — there is one person, he is named on
`/about`, and his GitHub is linked. `vikash@` is consistent with all of it.

The counter-argument is scale: a role address survives a second author, a
handover, or a decision to depersonalise. That is a real advantage and it is
speculative, whereas the trust signal is present today. `SITE.email` is one
constant feeding five call sites, so reversing this is a one-line change if the
site ever has more than one person behind it.

**It also removes the last non-DNS launch blocker.** The address bounced —
`hello@` was published on `/about`, `/contact`, `/terms`, `/privacy` and in the
`Organization` structured data, and nothing has ever received at it. An address
that bounces is worse than none, and AdSense checks the contact route works.

### D45 — The first deploy failed on a file nothing had ever read

`npx wrangler deploy`, the first deployment this project has ever attempted,
uploaded all 32 assets and then died:

```
Invalid _headers configuration:
Line 16: Invalid header format [code: 100324]
```

Line 16 was `X-Frame-Options:` — an empty value, meant to unset the header for an
`/embed/*` rule. **Both halves of that rule were wrong.**

An empty value is not how a header is removed; the unset form is
`! X-Frame-Options`. And **there is no `/embed/` route** — no page, no build
output, nothing. The rule cited "charter §14", a document that is not in this
repository, the same phantom reference `docs/DNS.md` carried for §13 until it was
replaced.

**So the fix is deletion, not repair.** Correcting the syntax would ship working
headers for a route that 404s, and re-arm the identical breakage the day someone
builds `/embed/`. Headers for a route ship in the same pull request as the route.

**This is the argument for D43's ordering, tested on the first attempt.** D43 moved
the deploy ahead of every DNS change on the reasoning that a first-ever deploy
should not be debugged with the real domain pointing at it, and noted explicitly
that `public/_headers` "has never been served by anything — its behaviour on
Workers static assets is currently assumed, not known". It was assumed, it was
wrong, and it cost nothing because the domain was still on Hostinger.

**Why every gate was green.** Ten checks read `dist/`; none had ever read
`_headers`. Cloudflare parses it at **deploy time, which is after CI** — so a
syntax error there is a green pipeline and a failed release, and there was no
point in the pipeline where it could surface. Eighth time a real defect appeared
because a check was asked a question it had not been asked before (D18, D26,
D31, D41).

`scripts/check-headers.mjs` now asks it: every header line parses as
`Name: value` or `! Name`, and every path rule matches something the build
produced. Proven against the committed state of `main` before the fix — it fails
at **line 16**, the same line Cloudflare named, plus line 15 for the route that
does not exist. Exit 1; exit 0 once the block is removed.

**What it deliberately does not check:** whether the header *values* are wise.
Whether HSTS should be a year is a judgement, not a fact derivable from `dist/`.

### D46 — Every page on the site was a 307, and both config files were correct

The first deploy after the nameserver switch served the entire site as redirects.

`astro.config.mjs` sets `trailingSlash: 'never'`, so the build produces slash-less
routes, the sitemap lists slash-less URLs, and every `<link rel="canonical">` is
slash-less. Cloudflare Workers static assets defaults to
`html_handling = "auto-trailing-slash"`, which **adds** a slash and 307s to it.

So the crawl path for every page was: Google reads `/about` from the sitemap →
**307** to `/about/` → lands on a page whose canonical says `/about`. A site that
redirects away from the URL it declares as canonical, on all ten pages at once.

Fixed by setting `html_handling = "drop-trailing-slash"` in `wrangler.toml`,
which serves `/about` directly from `about/index.html` and redirects `/about/` to
`/about` — the shape `astro.config.mjs` had asserted all along.

**Why nothing caught it.** `astro.config.mjs` was right. `wrangler.toml` was right
*as written* — it simply said nothing about the setting, and the unstated default
was wrong. Two files that must agree, consumed by two different tools, neither
validating the other. That is D45's shape (`_headers` parsed at deploy time,
after CI) and it recurs in D52 (`_redirects` versus the affiliate registry).

`scripts/check-deploy-config.mjs` now compares them and fails when `trailingSlash`
and `html_handling` disagree.

**Found by querying the live site**, not by a gate. Ten checks read `dist/`; a
307 does not exist in `dist/`. Every page being a redirect was invisible to all
of them, and to the GitHub, CI and Cloudflare dashboards, all three of which
reported success.

### D47 — The arithmetic was right, the test was right, and the sentence was false

Found on the live deployment by changing one number: a first debt of $3,000 at
29.99% with a $30 minimum. The calculator reported

> **SAVED VS MINIMUMS — $0.00**, and 0 months sooner

and, below the toggle, *"Either way you save $0.00 against paying only the
minimums."*

Paying $600 a month against $300 of minimums cannot save nothing. What had
actually happened is that $30 does not cover the $74.98 of monthly interest on
that card, so the **baseline never ends** — and the engine, correctly and
deliberately, refuses to quote a saving against a schedule that does not
terminate:

```ts
// A baseline that never clears has no meaningful saving to quote against.
const interestSavedVsMinimums = minimumsOnly.neverPaysOff ? ZERO : …
```

**The bug was that the UI read the wrong flag.** `shown.neverPaysOff` asks
whether *the strategy the visitor selected* clears the debt, and that was
handled — it shows a caution panel. `minimumsOnly.neverPaysOff` asks whether
*the baseline* does. Two different questions, and the second was never asked.
When your plan clears and the baseline does not, the stats rendered and the zero
was formatted as a fact.

**This is the worst possible case to be wrong in.** "Your minimum payments never
clear this debt" is the single most important thing this tool can tell anyone.
Instead it said the opposite: that doubling their payment gained them nothing.
And the inputs are not exotic — a store card at 29.99% with a $30 minimum is an
ordinary statement.

Now branches on the baseline in both places:

> **SAVED VS MINIMUMS — Never clears**, still owing after 50 years of minimums

> Paying only the minimums, a balance is still outstanding after **50 years** —
> so there is no finite saving to quote against it.

"50 years" is derived from `minimumsOnly.months / 12`, not typed, so it cannot
drift if `MAX_MONTHS` moves. Saying *why* no number is shown is the "shows its
working" positioning applied to an absence.

**The part worth generalising.** `tests/calc/debt-payoff.test.ts` already had
`quotes no saving against a baseline that never clears`, asserting exactly the
zero that was being displayed. The engine was right, the fixture was right, and
nobody asked what sentence they would produce together. D37 said an interface
can be wrong while the markup, the state and the arithmetic are all correct;
this is the same failure one level up — **a correct number formatted into a
false claim.** That test now carries a comment saying the zeros are not
displayable and naming the branch that depends on them.

**No component test was added, deliberately.** This project has no DOM testing
setup, and adding one means `@testing-library/preact` — a dependency against
rule 4, to catch a class of defect the working agreement already assigns to
opening a browser. It was found by opening a browser. Both branches were then
verified the same way, at defaults and at the stalling inputs.

**Cost: 0.12KB** on the worst page (18.27 → 18.39, 1.11 spare), for one ternary
and two strings.

### D48 — Delete the previous host's records after the custom domain, never before

The instinct is to clear the retired Vercel `A` and `www` records first, then
attach the Worker custom domain to a clean name. It is wrong, and it fails slowly
rather than loudly.

Removing the address record before the Worker is attached leaves the name with
**no answer at all**. Every resolver that asks during that window caches the
emptiness for the zone's negative-cache TTL — **1800 seconds**. The site then
stays dark for up to half an hour *after* it is actually working, and the obvious
reaction, detaching and re-attaching the custom domain, restarts the clock while
fixing nothing.

Attaching the custom domain replaces those records itself, so the name never has
a moment without an answer. `docs/DNS.md` orders it that way and says why in two
places — at the record table and again at step 8 — because the wrong order is the
intuitive one and a runbook that only states the right order invites the reader
to improve on it.

**The general rule:** when replacing a live DNS record, add the replacement
before removing the original. Negative caching makes a gap far more expensive
than an overlap, and the cost is paid at the moment you most want to be watching
something else.

### D49 — Merging to main is the release

Until now, `main` and the live site were connected by nothing but memory.
Production moved only when someone ran `npx wrangler deploy` by hand, from a
working tree that might be on any branch, against a `dist/` that might be from
any commit.

**That drift is not hypothetical — it cost two deploys during launch.** One
uploaded a `wrangler.toml` from a branch cut before the fix it was supposed to
carry, so a merged change never reached the site while GitHub, CI and the
Cloudflare dashboard all reported success. The only thing that caught it was
querying the live site and finding every page still a 307 (D46).

So the deploy is now a job in the same workflow, and the properties are the
point:

**Production can only receive a commit that passed all ten gates.**
`needs: [verify, secret-scan]`. There is no path to the live site that skips
them — not "I'll just push this one small fix".

**It builds first.** `wrangler deploy` uploads `./dist` exactly as it finds it;
it does not build. Both bad deploys above were a stale `dist/`, and a human is
reliably the wrong mechanism for remembering this.

**Pull requests never touch it.** Gated on `push` to `main`.

**`npx wrangler`, not `cloudflare/wrangler-action`.** A third-party action in
the release path is a supply-chain dependency that holds a token able to rewrite
the live site, adopted to save four lines of YAML. Rule 4's reasoning — state
what it does and why hand-rolling is worse — applies to CI at least as much as
to npm, and here hand-rolling is *better*: `npx wrangler deploy` is exactly the
command that already worked.

**`cancel-in-progress` is now conditional.** It was unconditionally true, which
is right for superseding a PR run and actively dangerous for a run that deploys:
two quick merges would cancel the first mid-upload and leave the live site
half-written, with no error anywhere. Now it cancels pull requests only.

**Two secrets, created by the operator, never seen by an agent:**
`CLOUDFLARE_API_TOKEN` (scoped to *Edit Cloudflare Workers* on this account
only) and `CLOUDFLARE_ACCOUNT_ID`.

**What this does not change:** CLAUDE.md still forbids an agent from running
`wrangler deploy`, and that stays. The operator's merge click is what releases —
which is exactly the division the working agreement already described, now
enforced by the pipeline rather than by etiquette.

### D50 — The page contradicted itself, and "linked from somewhere" was not enough

The homepage hero row listed three calculators. The section further down headed
**"Calculators"** listed two — the mortgage tool was missing from it for four
pull requests. A visitor who scrolled to the list of calculators was told there
were two.

**Every gate passed**, and D41's orphan check is the reason why: it asks *"is
this page linked from anywhere"*, and the mortgage page **was** linked, from the
hero, thirty lines above. Being linked from somewhere is not the same as being
listed where a reader looks for the list.

Second time this same tool has gone missing from a listing (D41). Twice is a
pattern, so `check-links.mjs` now asserts that every `/finance/*-calculator`
route appears in the list under the "Calculators" heading. Proven by stripping
the mortgage `<li>` from the built HTML **while leaving the hero link intact** —
the orphan check still passes, the new one exits 1 naming the route.

Anchored on the heading text, and a **missing heading is a failure**, not a
silent pass. Renaming the section must break the check loudly rather than
quietly retire it — the same reasoning as `check-state.mjs` (D27), and the
failure mode that let the byte budget report an island page at 1.09 KB (D18).

**What is still unchecked, and stated rather than hidden:** the hero's "Three
calculators today" is prose. It said "two" for two pull requests after the third
tool shipped, and nothing catches that. Gating a sentence against a count is
possible and was not done — the list is the thing a reader acts on, the sentence
is a caption. Recorded so the next person knows it is a gap rather than an
oversight.

**On the affordance, which was the operator's other complaint.** The cards were
bordered panels whose only cue was coloured text; a whole-card link that does
not look like a link is a dead end for anyone not hovering. They now carry an
arrow that shifts on hover, the title underlines with it, and the border moves
to `--color-line-strong` — the token D30 raised specifically so control
boundaries clear WCAG 1.4.11.

No per-card focus ring was added: `global.css` already sets a 2px brand
`:focus-visible` outline site-wide, and duplicating it in a component is how
tokens stop being the single source.

**Measured, not eyeballed** (D29, D36):

| | Border vs card | Title | Description |
|---|---|---|---|
| Light | **3.85:1** | 7.88:1 | 7.89:1 |
| Dark | **3.80:1** | 8.24:1 | 9.04:1 |

Against 3:1 for a UI component boundary and 4.5:1 for text. At 375px: no
horizontal scroll, arrows contained, every card far above the 44px tap target.

**The first measurement pass reported 2.24:1 for both title and description** —
two different tokens returning one number, which is the exact smell D29 records.
It was a selector picking the wrong node after a colour-scheme switch without a
reload, not a contrast defect. Worth writing down: when two distinct tokens
measure identically, suspect the instrument before the palette.

**Zero JavaScript cost.** These are `.astro` markup changes; the homepage island
is untouched.

### D51 — The share image, and deriving a claim instead of asserting it

`public/og.png` exists: 1200×630, 160KB, the picture link previews render in
WhatsApp, Slack, Discord, LinkedIn and X.

**It is not an SEO signal and this entry does not pretend otherwise.** Google
does not rank on it. What it changes is click-through on a link somebody shares,
which matters because "posted in a personal-finance thread" is a real
distribution path for this site and a bare text row is a weak invitation.

**Generated by a browser, not a dependency.** `scripts/og/generate.html` draws
the image on a canvas and exports a PNG. Satori or sharp would each be a
dependency against rule 4 for a social preview; a browser already contains a
rasteriser. It never runs in CI and never ships.

**It lives in `scripts/`, deliberately not in `src/pages/` or `public/`.** Either
of those makes it a route — Astro would build it into `dist/`, `check-state.mjs`
counts every HTML file there as a page, and the AdSense "15 substantive pages"
figure would quietly become 16. A generator is not a page.

**The image shows the product's own output.** The curve is extracted from the
built homepage, whose `ProofChart` runs the real debt-payoff engine at build
time on the calculator's default scenario — 19 months against 77, $5,021.37
saved (D32). Colours are read from the `@theme` block rather than typed from
memory, so it cannot drift from the palette. Both series carry a dash pattern as
well as a hue, because colour must never be the only channel (D42).

**The part worth keeping is not the image.** D31 found that every page had
declared `summary_large_image` while no page supplied an `og:image`, for the
whole project, so the card rendered as an empty grey box everywhere. The obvious
fix is "add the image and flip the tag back". That restores the same fragility:
two facts asserted separately, free to disagree again the moment someone deletes
a file.

So the card type is **derived**:

```astro
const hasOgImage = existsSync(`public${OG_IMAGE}`);
<meta name="twitter:card" content={hasOgImage ? 'summary_large_image' : 'summary'} />
```

Proven by removing the file and rebuilding: the card downgrades to `summary` and
**zero `og:image` tags are emitted**; restored, it returns to
`summary_large_image` with all five. The same `existsSync` pattern the author
photograph already used — an asset claim that checks itself is the only kind
that cannot rot.

**Still hand-verified rather than gated:** nothing asserts the PNG is really
1200×630, or that it is a PNG at all. Checked once here by reading the IHDR
header. A gate is possible and was not written — the file changes about once a
year, and D27's reasoning applies about not building machinery to police
something that does not move.

### D52 — Affiliate plumbing before there is anything to put in it

`/go/<partner>`, the disclosure component, the registry and the enforcement all
exist. **There are zero partners**, and that is the point: a disclosure
convention and a redirect indirection cost five minutes now and are a genuine
problem to retrofit across a grown site, where every existing page has to be
revisited.

**It needs no backend, which was not expected.** CLAUDE.md's backend policy
permits a Worker route for `/go/*`, and it turns out not to need one — a
`_redirects` line is served by Cloudflare's static asset handler at the edge.
No Worker script, no `lib/ports/`, no request logging, nothing stateful.
Verified in the installed wrangler (`REDIRECTS_FILENAME = "_redirects"`) rather
than assumed, after D45 and D46 both cost a deploy to that exact assumption.

That is strictly better than the permitted design: the site stays deployable
anywhere as a directory of files, and the click is not observed by anything we
run. A visitor's outbound click is the one piece of behaviour this site could
have started logging without anybody noticing, and it does not.

**302, never 301.** A permanent redirect is cached by browsers indefinitely, so
the day a programme changes its destination — or ends — every visitor who ever
clicked keeps going there and no deploy can reach them. Affiliate destinations
are the least permanent URLs on the internet. The gate rejects any other status.

**Two files must agree**: `src/lib/affiliates.ts` renders the links,
`public/_redirects` serves them. Each is individually valid while disagreeing,
which is D46's shape precisely, so `check-deploy-config.mjs` compares them —
slug by slug and URL by URL — and fails on a partner present in one and not the
other. Proven by adding a line to one file alone: exit 1, naming the slug and
the direction of the mismatch.

**Rule 12 is enforced against the built HTML**, because a hand-written `<a>` to
a partner looks identical to a correct one in review. `check-links.mjs` now
requires, for every `/go/` link on any page:

1. the slug is really in the registry — a `/go/` path with no redirect behind
   it is a dead link that reviews fine;
2. `rel` contains both `sponsored` and `nofollow`;
3. the page carries a disclosure, and it appears **above** the link — below it,
   the reader is informed after the click it was meant to inform.

All three proven by injecting each violation into `dist/index.html` and running
the gate: four problems, two problems, two problems, exit 1 each time, exit 0
restored. The disclosure-position check compares document offsets, which is the
only place "above" is a fact rather than an intention.

**`/go/*` is exempt from the link resolver** and this is not a loophole. Those
paths deliberately have no file behind them; resolving them against `dist/`
would report every correct affiliate link as broken. They are checked against
the registry instead, which is the stronger question.

**Also: `Disallow: /go/` in robots.txt.** The links already carry
`rel="sponsored nofollow"`; this keeps crawl budget off the hops as well.

**The disclosure wording is deliberately not a hedge.** "We may receive
compensation from our partners" is what a site writes when it does not want to
be understood. The component names the partner and states what triggers the
payment, and the type requires a relationship string long enough to be a real
sentence — a vague disclosure on a site whose entire argument is checkability
costs more than the affiliate link earns.

### D53 — The site was spending its internal link equity on /terms

Measured inbound internal links across the built site, which nobody had done:

| Page | Inbound | | Page | Inbound |
|---|---|---|---|---|
| `/methodology` | 41 | | `/coast-number` | **1** |
| `/contact` | 22 | | `/withdrawal-rate` | **2** |
| `/about` | 19 | | `/credit-card-interest` | **3** |
| `/privacy` | 17 | | `/monthly-return-rate` | **3** |
| `/terms` | 16 | | `/finance/mortgage-overpayment-calculator` | **3** |

The trust pages sit in the footer, so they collect a link from every page and
will never rank for anything worth having. The derivation pages — the entire
long-tail surface, and the only part of this site that can realistically win a
query — were an island linked mostly to each other.

**`/credit-card-interest` was not linked from the debt payoff calculator at
all.** It was linked from the *mortgage* page. The pages that exist to support a
calculator were not connected to it.

**Rule 8 already required the fix and all three pages violated it.** "2-3 genuine
internal links + the cluster hub", measured:

| Page | What it actually had |
|---|---|
| debt payoff | **one link, to `/`** — no siblings, no derivations, no hub |
| coast fire | two links, neither of them its own derivations |
| mortgage overpayment | three links, one a *debt* derivation, still no hub |

**None of the three linked to `/finance`**, the cluster hub the rule names
explicitly. Three hand-written blocks, three different shapes, three failures of
the same rule — which is the argument for a component rather than a convention.

`components/RelatedTools.astro` renders the hub link itself rather than taking
it as a prop, because that is the specific part every hand-written version
forgot. It throws below two genuine links.

**`/` does not count as a related link.** It is on every page already;
satisfying a *related content* requirement with site navigation is how the debt
payoff page ended up with a Related block containing nothing related.

After, with each derivation now linked from the calculator it supports:

| | Before | After |
|---|---|---|
| `/coast-number` | 1 | 2 |
| `/withdrawal-rate` | 2 | 3 |
| `/credit-card-interest` | 3 | 4 |
| `/monthly-return-rate` | 3 | 4 |
| `/finance` | 17 | 20 |

**The counts are small and the point is not the counts.** A link from the debt
calculator to the page explaining its own interest arithmetic is a topical
signal; a footer link to `/terms` is not. What changed is which pages the site
says are related to which.

Proven by removing the hub link from the built HTML — exit 1, naming the page —
and again by deleting the block entirely. Exit 0 restored.

**Not done, deliberately:** nothing here targets a query. It makes the pages that
already exist legible to a crawler as a cluster. Whether any of them ranks is a
separate question that only Search Console can answer, and it cannot answer it
for pages that are not linked.

### D54 — The first page built to beat a giant, and what it is betting on

`/minimum-payments` — the first page on this site written for a query rather
than derived from a tool that already existed.

**The bet, stated plainly.** calculator.net and Credit Karma both rank for
"how long to pay off a credit card". Neither leads with the honest answer,
which for a great many real cards is **"it never finishes"**. A
lead-generation site for credit products has no incentive to open with that
sentence. We have no incentive not to.

That is the whole thesis of competing here: not better SEO, not more words —
**a true statement the incumbent's business model discourages them from
making.**

**Every figure is computed at build time by the real engine.** The page imports
`debt-payoff.ts` and runs four scenarios, the same discipline as the homepage's
ProofChart (D32). It cannot state a number the product does not produce, and it
cannot go stale when the engine changes. Zero client JavaScript.

What the engine returned, none of it typed:

| Balance | APR | Paid | Interest m1 | Clears in | Interest |
|---|---|---|---|---|---|
| $3,000 | 29.99% | $30 | $74.98 | **never** | unbounded |
| $3,000 | 29.99% | $90 | $74.98 | 73 months | **$3,526.99** |
| $6,000 | 22.99% | $150 | $114.95 | 77 months | $5,492.03 |
| $6,000 | 22.99% | $250 | $114.95 | 33 months | $2,113.21 |

Two of those are the page's reason to exist. Row 2 costs **$526.99 more in
interest than the balance itself**. Rows 3 and 4 differ by $100 a month and by
**44 months and $3,378.82**. Both are derived from the table rather than
restated beside it, so a quotable sentence cannot drift from the figures above
it.

Row 4 independently reproduces D34's `QuickCost` verification — 33 months and
$2,113.21 — from a page written months later, which is what having one engine
buys.

**The honest limitation is stated rather than buried.** The engine models a
*fixed* payment; issuers commonly use a percentage of the balance, which shrinks
as the balance falls and therefore takes **longer**. So every figure here is the
optimistic case, and the page says so in its own section. It also tells readers
to check against the Regulation Z repayment box on their own statement, and
which of the two to believe when they disagree — the statement describes their
card, this page describes the arithmetic.

**On being cited by language models rather than replaced by them.** `llms.txt`
gains an entry in the established shape: flat, standalone, quotable sentences
carrying the computed figures. The strategy is not to be un-summarisable. It is
that a model asked "how long to pay off $3,000 at 29.99%" produces an estimate,
while this page produces $74.98 of month-one interest, a named threshold, a
schedule and a spreadsheet check — and a retrieval system that wants a specific
number has somewhere exact to get one. Being *the citable source* for a
computed fact is a better position than being unquotable.

**The warning is now struck rather than whispered.** "This does not finish" was
a tinted paragraph in body text — visually quieter than the three stat tiles it
replaced, for the most important thing the tool ever says. It is now a double
rule, an engraved caution eyebrow and the verdict at the size the debt-free
figure would have been.

**And the tint had to go, on measurement.** In the light theme a 5% caution wash
put the eyebrow at **4.13:1** (12px text needs 4.5) and a `border-caution/50`
rule at **1.93:1** (a component boundary needs 3). On opaque `bg-surface` the
same two measure **4.66:1** and **4.66:1**; dark measures 8.82 and 8.82. That is
D29's existing rule rediscovered by measuring — text never sits on a tint here,
panels are opaque, so the texture never costs contrast.

**The first measurement pass reported 1.06:1 and 1.61:1** and looked like a
catastrophe. It was the instrument: filling a canvas with a *translucent* colour
composites it over transparent black, not over the page. The fix is to paint the
page colour first, then the panel, then read. Third time a contrast measurement
has been wrong before the design was (D29, D36, D50) — when a number looks
impossible, suspect the ruler.

**Also fixed: `check-state.mjs` demanded a sentence that is not English.** The
sixteenth substantive page made its gap go negative, and the gate began
requiring `STATE.md` to claim **"-1 more needed"** — which whoever was getting
the build green would have written. The AdSense criterion is a floor, not a
quota; the gap is clamped at zero and the honest answer is "none" at 15 pages
and at 150.

### D55 — A true number in a false sentence, and the three places it was waiting

The operator flagged the `/minimum-payments` bug as the one that would kill the
site's credibility, and he is right. The rendered card said:

> Paying **$150.00** instead of **$250.00** on $6,000.00 removes 44 months and
> $3,378.82.

Backwards. Paying *more* removes them. **The arithmetic was correct** — 44
months and $3,378.82 are exactly right — and the sentence was false. Every gate
was green, 159 tests passed, and no reader could have detected it.

That is the worst failure available to this site. A wrong number can be caught
by anyone with a spreadsheet, which is what `/verify` invites. A right number in
a false sentence cannot, and it discredits every other figure on the page.

**The class, named:** *prose that says which side is which, instead of deriving
it.* An audit of every place the site puts directional language beside a
computed figure found three live instances.

**1. The comparison card that was reported.** Two scenarios indexed out of an
array by hand and labelled `BIG_FAST` / `BIG_SLOW` by position. Now sorted by
the outcome, so the labels cannot be the wrong way round — the mistake is
unavailable rather than merely fixed.

**2. The strategy sentence, and this one was a loaded gun.**

```
On these figures avalanche costs $230.65 less interest than snowball.
```

The figure is `absolute(avalanche − snowball)` — **the direction is thrown
away** — and the sentence then asserted which side won. If snowball ever came
out cheaper by a cent, the tool would state the opposite of its own arithmetic,
confidently, with the correct number attached. It now reads `comparison.best`,
which is already computed as the cheaper result and carries its own strategy
name.

Currently unreachable, because avalanche minimises interest by construction. It
is fixed anyway: an assertion that is true only because of an invariant nobody
wrote down is a defect waiting for the engine to change.

**3. The homepage described a scenario it did not compute.** `"$9,400 of debt,
$600 a month"` was typed into two places while the balances lived in
`DEMO_DEBTS` above them. Editing one demo balance would have left the caption
stating a total the chart beside it no longer showed. Both now derive from the
same constants the engine is given.

**The engines were exonerated, by test rather than by argument.**
`tests/calc/direction.test.ts` adds six invariants that ask a different question
from every other fixture here — not "is the number right" but "does it point the
way the prose says":

- `best` is never beaten by either strategy it chose between, across five debt
  shapes at three budgets each
- `interestDifferenceBetweenStrategies` really is the gap between the two named
  strategies
- a larger budget never clears later or costs more
- the saving against the minimums is never negative
- a payment below the monthly interest grows the balance; above it, clears
- a larger mortgage overpayment never removes fewer months or less interest,
  swept across six overpayments
- overpaying nothing saves exactly zero (D39's regression)

All six pass. **So the reversal was never arithmetic — it was labelling**, which
is precisely why no existing fixture could have caught it and why the fix has to
be structural rather than a corrected string.

**What is still not protected, stated rather than implied.** No gate reads
English. A future sentence could still describe a computed figure incorrectly,
and nothing here would fail. The defence is three layers deep and none of them
is a checker: derive the labels, keep the engines provably monotonic, and read
the rendered page. The bug that started this was found by the third.

### D56 — The Reg Z claim was true, and is now quoted rather than asserted

`STATE.md` carried this as blocked debt: the debt-payoff page claimed Regulation
Z Appendix M1 "permits a margin of error of two months", the claim predated the
current work, and **nobody had opened the regulation**.

Opened. It is correct. Appendix M1 (b)(5):

> A minimum payment repayment estimate shall be considered accurate if it is not
> more than 2 months above or below the minimum payment repayment estimate
> determined in accordance with the guidance in this appendix.

Read at
[consumerfinance.gov/rules-policy/regulations/1026/m1](https://www.consumerfinance.gov/rules-policy/regulations/1026/m1/)
— the regulation text published by the agency that administers it, which is a
primary source rather than a summary of one.

**Both places the site made the claim now quote it.** Being right was not
sufficient: a paraphrase asks the reader to trust us about a regulation, and
this site's entire proposition is that its figures can be checked. A quoted
sentence with a named provision can be verified in a minute; "permits a margin
of error of two months" cannot be verified at all without already knowing the
answer.

**The gap in the check, stated.** eCFR was the intended second source and
bot-blocks automated fetches, so this rests on one source. That is one primary
source rather than two, not a disagreement between sources — recorded so nobody
later assumes it was double-checked.

**The general rule this settles.** Every *number* on this site is computed and
checkable. Regulatory claims are the one category that cannot be derived from
first principles, which makes them the weakest link in a site built on
checkability. So they get the strictest treatment available: quote the text,
name the provision, link the source, and record the date it was read.

### D57 — Encyclopedia pages are rejected; education through computation is not

The operator proposed a set of educational pages — types of loans, what a
mortgage is, kinds of debt — reasoning that more topical pages would help
AdSense and search trust. It is a reasonable instinct and the answer is no,
for four reasons that compound.

**1. The project's own plan already decided this.** The Master Build Plan's §1
reversed exactly this idea, and gave its evidence: informational queries now
resolve on the results page roughly 74% of the time, and organic CTR falls by up
to 61% where an AI Overview appears. Its conclusion: *explainer articles are a
compliance and internal-linking asset, not a traffic asset.* Both of those jobs
are already done — 16 substantive pages, and the internal linking was rebuilt in
D53.

**2. It is the most contested content class on the internet.** "What is a
mortgage" is held by Investopedia, NerdWallet, Bankrate, the CFPB itself and
every retail bank — institutions with decades of domain age, editorial staff and
budgets. A domain with no history does not take those queries with better prose.
The `/minimum-payments` bet works because it says something incumbents *will not*
say (D54); there is no equivalent edge in defining a term everyone defines
identically.

**3. It fails rule B in spirit.** "Build only what can be proved from first
principles" is what every page here is built on. A definitional page has no
computation, no anchor, nothing a reader can check and nothing a fixture can
test. It would be the first content on this site whose only warrant is that we
say so — which is precisely the "generic AI output" `CLAUDE.md` forbids, and it
would sit next to pages whose whole claim is the opposite.

**4. It risks the pages that do work.** Helpful-content signals are assessed
site-wide, not per page. Ten thin definitional pages beside sixteen computed
ones do not add ten pages of value; they dilute what the site demonstrably is.

**What is not rejected: education that computes.** The derivation format already
does this, and it is the thing to extend — `/credit-card-interest` teaches how
interest works *by computing it three ways*; `/minimum-payments` teaches the
minimum-payment trap *by showing the balance rise*. That is educational content.
It is simply educational content with an anchor.

Candidates in that shape, all first-principles verifiable and all long-tail:

- what an extra payment does in year one versus year twenty of an amortising
  loan, computed
- why a mortgage payment barely touches the principal early on, with the split
  shown month by month
- biweekly versus monthly payments — 26 half-payments is 13 monthly payments a
  year, and the difference is computable
- what a rate change of one percentage point costs over a term

**The distinction, in one line:** define nothing, compute everything. If a page
cannot be checked by a reader with a spreadsheet, it does not belong on this
site regardless of its search volume.

### D58 — Biweekly payments, and two rounding bugs caught before they shipped

`/biweekly-mortgage-payments` — the second page written for a query, and the
first to be anchored to a **third party's own worked example**.

**The finding, which is not what the name suggests.** Twenty-six half-payments a
year is thirteen monthly payments, not twelve. The entire benefit of a biweekly
schedule is that one extra payment; the fortnightly timing contributes almost
nothing. Computed on the site's standard loan:

| | Payment | 12 monthly | 26 halves | Difference |
|---|---|---|---|---|
| $320,000 at 6.706% | $2,066.16 | $24,793.92 | $26,860.08 | **$2,066.16** |

That difference is exactly one payment, and it removes **72 months and
$99,532.52** of interest.

**The second row is the CFPB's own example loan.** The Bureau sued Nationwide
Biweekly Administration over its programme, alleging a setup fee of up to $995
plus $84–$101 a year, and used a $160,000 mortgage at 4.125% to argue a consumer
would need nine years to recoup the fees. Running that same loan here: the extra
payment removes $18,840.18 of interest over 25y 10m. Both figures are real and
measured over different periods, and the page says so rather than picking the
flattering one.

That is the "documented comparison against a named third party" `CLAUDE.md`
requires, and it is a stronger form of it than D39's: the comparison is not to a
competitor's calculator but to a regulator's enforcement filing.

**Two rounding bugs, both caught by reading the rendered page.**

The first draft converted to major-unit floats and rounded to whole dollars for
display. It produced:

- **$2,066.00** for a payment D39 anchors to **$2,066.16** against
  calculator.net — quietly breaking the site's most precise external anchor;
- **$780.00 of "extra a year" against a $775.30 payment.** One extra payment a
  year that is *larger than a payment* is arithmetically impossible, and it
  would have shipped looking entirely plausible.

Both came from the same mistake: leaving minor units, which is exactly what D4's
branded `Minor` type exists to prevent. Every amount on the page now stays in
cents until `format` renders it.

**And the central claim is derived, not asserted.** `26 × (P/2) − 12 × P = P`
holds in exact arithmetic. It does **not** always hold on the cent: halving an
odd number of cents rounds, and twenty-six of the rounded halves drift. A
payment of $775.45 halves to $387.73 and twenty-six of those come to **thirteen
cents** more than thirteen payments.

Both loans here happen to have even cents, so the identity is exact — but a
sentence true only by luck of the input is D55 waiting to recur. The residual is
computed, and the prose reads it: "exactly one payment" when it is, and "one
payment to within *n*" when it is not. Two fixtures pin both branches.

**What the page refuses to claim.** It does not model a true fortnightly
accrual, where half a payment lands mid-month and reduces the balance a
fortnight earlier than a monthly engine can express. That effect is real and
small beside the thirteenth payment. Saying so costs nothing and is the
difference between a model and a claim — and the CFPB's own description of these
programmes ("collect fortnightly, forward monthly") means that for many of them
the fortnightly part does nothing at all.

**Why this topic passes the filter where "what is a mortgage" fails (D57).**
It computes something, the arithmetic is checkable against a spreadsheet, and
the honest answer — *the fortnightly part is not what helps* — is one a company
selling fortnightly payment plans has no reason to lead with.

### D59 — The affordance fix that was applied to one page and not the other

D50 made the homepage's calculator cards read as links, after the operator
reported that they looked like text. The **`/finance` hub carries the same three
cards** and was never touched — so the fix lived on one page and the defect on
the other, and the operator reported it a second time, on the other page.

Two hand-written copies of one pattern, one of them wrong. That is D53's shape
exactly, and it gets D53's answer: `components/ToolCard.astro`. Both pages now
render through it, a third use site inherits the affordance instead of
reinventing it, and there is no longer a copy that can be missed.

**The important design change is that the affordance no longer depends on
hover.** The old card announced itself only when the cursor arrived, which is
useless to a reader deciding whether the page has anything to click — and
useless on touch, where there is no hover at all. Every card now carries a
visible `→` at rest, measured at **8.24:1** against the card, with the border at
**4.05:1** against the page and `cursor: pointer`. Hover adds an underline and
moves the arrow; it is no longer carrying the whole signal.

**On verifying hover, and an honest limit.** Four separate attempts to measure
the hover background and border in the headless browser produced four wrong
answers, each for a different reason:

1. reading `transform` when Tailwind v4 animates the standalone `translate`
   property;
2. a `grep` pattern that did not escape the `\` Tailwind writes into class
   selectors, reporting the utilities as absent when they are present;
3. a synthetic injected stylesheet whose `var(--spacing)` resolved to `0`;
4. enumerating `document.styleSheets[].cssRules` without descending into the
   `@layer` blocks Tailwind emits everything inside — 54 rules found in a file
   containing thousands.

The rules themselves were then read straight out of the built CSS and are
correct, unwrapped and higher-specificity than the base utilities:

```css
.hover\:bg-sunken:hover{background-color:var(--color-sunken)}
.hover\:border-brand:hover{border-color:var(--color-brand)}
```

So the hover states are almost certainly fine, and **that is stated as "almost
certainly" rather than "verified"**, because the instrument was wrong four times
and one more confident measurement is not worth much. The resting state is
verified, and the resting state is what the complaint was about.

**The generalisation, now earned three times over** (D29, D36, D50, D54, and
here): when a browser measurement contradicts something the source plainly says,
suspect the measurement first. It has been the measurement every time.

### D60 — The first week of live data, and two hostnames sharing one crawl budget

Six days after launch, the first real numbers. They are recorded here because
Search Console does not keep them for ever and nobody can re-derive them later.

**Search Console, 7 days to 2026-08-17:** 60 impressions, **0 clicks**, average
position **66.9**. The sitemap was submitted on 2026-08-11, status Success, all
17 URLs discovered. `URL Inspection` confirms **5 pages indexed** — the three
calculators, `/finance` and `/minimum-payments`; the Page indexing report lagged
at 4 and is not the authoritative surface.

**Every impression came from one page.** All 14 ranking queries are mortgage
overpayment variants and all of them resolve to
`/finance/mortgage-overpayment-calculator`. The other sixteen pages contributed
nothing.

**Cloudflare, same window:** 80 unique visitors over 7 days. In 24 hours, 351
requests of which **179 were 4xx** — vulnerability scanners probing `/.env.test`,
`/backend/.env`, `/.ssh/known_hosts`, `/.cursor/mcp.json`. Nothing here has
secrets to leak, but it means the visitor counts are mostly not people.

**The number that mattered: GoogleBot made 1 request in 24 hours. AppleBot made
57.** That is the whole budget, and it reframes what "not indexed" means — the 4
URLs sitting in *Discovered – currently not indexed* are not rejected, they are
queued behind a crawler that visits once a day.

**So the site was serving itself twice.** `www.quickoper.com` returned **200** on
every path — a complete duplicate, because the launch attached Worker custom
domains to both the apex and www (D43 step 8). Canonical tags pointed at the apex
and Google was honouring them, so nothing was penalised. But half of a
once-a-day crawl was being spent on a mirror. Separately, `http://` on both
hostnames also returned 200; the HSTS header the app sends is ignored on a
plaintext response, so a first-time crawler got served unencrypted.

Fixed with two zone settings, both recorded in `docs/DNS.md` because **neither
lives in this repository and no gate can see them**: a Redirect Rule 301ing
`https://www.*` to the apex, and *Always Use HTTPS*. Verified across all four
combinations of scheme and hostname, including that a calculator permalink keeps
every query parameter through a two-hop chain.

**Cloudflare's own warning was wrong, and that is the part worth keeping.**
Deploying the redirect rule raised a dialog: *"This rule may not apply to your
traffic — your DNS configuration may not be proxying traffic for www."* The
reasoning was plausible: www was a Worker custom domain rather than a proxied
DNS record, and a whole detach-and-recreate procedure was drafted on the strength
of it. The rule works. Proven by requesting a path that does not exist —
`https://www.quickoper.com/not-a-real-page` returns **301**, not the Worker's
own 404, so the Rules engine is demonstrably answering ahead of the Worker.

That is D59's generalisation arriving from a new direction. D59 said to suspect
the *measurement* when it contradicts the source. Here the vendor's own warning
was the thing that was wrong, and the measurement was right. The stable rule
underneath both: **a claim about behaviour is worth less than one request that
exercises it.**

**On the queries, and what is deliberately not being built.** All 14 use British
vocabulary — "overpayment" rather than the American "extra payment" — and one is
`mortgage overpayment penalty calculator`, which is an early repayment charge.
Rule 13 names UK early repayment charges explicitly as a *legitimate* jurisdiction
variant, because the calculation genuinely differs. That is the first
evidence-backed candidate this project has had. **It is not being built on 60
impressions.** One week of data is a rumour, and D57's reasoning about not
diluting the site applies to over-fitting just as much as to thin pages. Recorded
so the next session knows to watch it, not to act on it.

### D61 — Timing beats amount, and the closed form was not close enough

`/mortgage-overpayment-timing` — the third page written for a query rather than
derived from a tool, and the first built on what Search Console actually
returned (D60) rather than on a guess about what would rank.

**The finding.** On the site's anchor loan — $320,000 at 6.706% over 30 years —
**$5,000 paid once in month 1 removes $30,332.98 of interest and 17 months. The
same $5,000 in month 241 removes $4,604.94 and 4 months.** Identical amount,
identical loan, **6.6 times** the effect. The value of an extra payment is
governed by how much of the term is left in front of it, not by its size.

Two supporting figures, both read off the real schedule: the first payment is
**86.6% interest** ($1,788.27 against $277.89 of principal), and principal does
not exceed interest until **month 237** — more than two-thirds through a
thirty-year term. The crossover is *found* by walking the schedule for the first
month where principal wins, never typed, so it cannot drift from the table beside
it (D55).

**A closed form was written first and rejected on measurement.** The interest
avoided by retiring principal early looks like `L · ((1 + i)^(n − m) − 1)`, and
it is wrong: measured against the walker it is out by **29 cents** on a month-1
lump and 2–3 cents elsewhere, because it ignores the per-period cent rounding a
real schedule performs. It would have been the cheaper implementation and it
would have published a figure the product does not produce. D7 forbids
tolerances, so the page's numbers come from `compareLumpSum`.

**The lump rides the existing `amortise` loop rather than getting its own
walker.** A second amortisation path that has to agree with the first is D59's
shape exactly — one gets fixed, the other does not. The lump is a whole number of
minor units added to one month's payment, so it contributes no rounding of its
own; all drift remains the per-period interest.

**Five fixtures, every expected value read off a failing assertion** (D7's
technique) and every one exact. One of them sweeps six points across the term
asserting the saving only ever *falls* as the payment is made later — the page's
central claim is directional, and D55 says the defence for directional prose is a
provably monotonic engine rather than careful wording.

**Found while writing it: `/biweekly-mortgage-payments` was missing from
`llms.txt` entirely.** It shipped in D58 and was never listed, so the page most
likely to be quoted by a retrieval system for a fortnightly-payments question was
invisible to the file that exists to serve exactly that. Third time a page has
existed without appearing where something looks for it (D41, D50). Both entries
added here. **Nothing checks this** — `check-links.mjs` asserts calculators
appear in the homepage list, and no gate compares `llms.txt` against the build.
Recorded as a known gap rather than fixed, because the honest fix is a gate and
this pull request is already carrying an engine change.

**One defect found by reading the rendered page, as usual.** The interest-share
column used `Math.round(x * 10) / 10`, which drops a trailing zero — month 240
rendered as **"49%"** in a column reading 86.6%, 81.3%, 73.9%, 28.8%, 0.6%. Every
gate was green. It is `toFixed(1)` now.

**And one measurement that was wrong before the design was.** At 375px the page
reported `scrollWidth 384` against `clientWidth 375` and looked like a horizontal
overflow. It is the scrollbar: `window.scrollTo(9999, y)` leaves `scrollX` at
**0**, so the page does not scroll horizontally at all. Fifth time (D29, D36,
D50, D54, D59) — suspect the instrument first.

### D62 — At a fixed rate, the term is the payment

`/15-year-vs-30-year-mortgage`. Fourth page written for a query, and the second
chosen from D60's evidence rather than a guess.

**The headline is the ordinary one:** on the anchor loan, halving the term raises
the payment **36.7%** ($2,066.16 → $2,823.91) and removes **55.6%** of the
interest ($423,821.51 → $188,303.66, a difference of **$235,517.85**). The
borrower hands over **2.32×** what they borrowed over thirty years and **1.59×**
over fifteen.

**The two findings worth the page are not that.**

**Both loans are charged identical interest in month one — $1,788.27.** Same
balance, same rate, so the same charge; interest does not know the term. What
differs is the remainder: **$277.89** of principal against **$1,035.64**, which
is **3.7×** as much principal from a payment only 36.7% larger, because the extra
lands entirely on the balance rather than being split. Principal first beats
interest in month **237** on the long term and month **57** on the short one.

**And the term turns out not to be a property of the product at all.** Paying the
15-year amount on the 30-year *contract* clears it in **180 months having charged
$188,303.66** — identical to a real 15-year loan, to the cent. Computed with
`compareOverpayment`, and the page **branches on whether the two actually match**
rather than asserting they do; the "identical, to the cent" sentence only renders
because the engine produced it. If per-period rounding ever separated them the
prose would say so and quote the gap. D55's rule applied to an identity rather
than a direction.

What genuinely differs between the products is obligation — on the short term the
larger payment is compulsory. The page says that and stops, because whether that
is worth anything is not arithmetic (D1).

**The rate is held constant across both terms, and that is a modelling choice
with a stated consequence.** Lenders normally price a 15-year product below a
30-year one. We have no citable 15-year quote and CLAUDE.md forbids inventing a
rate, so the comparison holds it fixed and isolates the term. That makes every
gap on the page **conservative** — a genuinely lower short-term rate widens all
of them — and saying so is what keeps a missing figure from reading as an
oversight. This is the same discipline as D40: cite what you have, derive the
rest, never fill a gap with a plausible number.

**No new engine code.** Everything here is `calculateMortgage` and
`compareOverpayment` as they already stood, which is the difference between a
page the data suggested and a page that needed a feature built first.

**A D55 defect shipped past every gate and was caught by reading the page.** An
FAQ entry asked *"Why is the first payment identical on both?"* — and the first
payments are **$2,066.16 and $2,823.91**, which differ by $757.75. It is the
first month's *interest* that is identical, which is what the answer beneath it
correctly explained. A true number under a false question, on the one page whose
entire point is that those two things are different. Twenty pages of gates, 172
tests and a clean typecheck all passed it.

Third time this exact class has appeared (D47, D55) and it keeps arriving the
same way: the computation is right, the label is written by hand, and no checker
reads English. The defence remains the one D55 named — read the rendered page —
and it is the only reason this was found.

**Also found while verifying, and deliberately not fixed here.** The homepage
logs two console errors: `<svg> attribute height: Expected length, "auto"`, from
`height="auto"` on the `<svg>` in `ProofChart.astro`. `auto` is not a valid SVG
length. It renders correctly because browsers ignore the invalid attribute, and
**nothing in CI reads browser console output**, which is why it has survived.
Left for its own change rather than bundled into a content page.

> **Corrected in D65.** This entry originally said *"every page on the site"* and
> claimed the error was reproduced on `/biweekly-mortgage-payments`. Both are
> false. `ProofChart` is imported by `src/pages/index.astro` and nothing else, so
> the homepage is the only page that has ever emitted it. The reading came from a
> console buffer that persisted across navigations in the same browser session —
> the instrument again (D59), and this time it got as far as a merged decision
> record before anyone checked.

### D63 — One module of three satisfies rule 3, and the 15-year term was pinned by nothing

Prompted by the operator: *"it is a YMYL domain, be extra careful with your
calculations."* The right response to that is not reassurance, so the mortgage
figures were re-derived by a second implementation written **outside this
repository**, importing none of the engine, and compared against what the built
pages actually say. Thirty-three checks: payment, term, totals reconciling,
every lump-sum saving, every percentage, every multiple, both crossovers, the
identity claim, and cross-page agreement on the shared loan. **All passed.**

Two independent implementations agreeing is worth more than a green suite. It is
also not the same as being right, and the audit surfaced two things that were.

**1. Every mortgage fixture used a 360-month term.** `/15-year-vs-30-year-
mortgage` publishes **$2,823.91** and **$188,303.66** as headline figures, and
until this entry nothing in the suite asserted either. An engine change could
have moved a number on a live YMYL page with every gate green. Four fixtures now
pin the payment, the totals, the equal first-month interest across terms, both
crossover months, and the "identical, to the cent" identity — the last one
specifically because the page *branches* on that identity, so without a fixture
it could silently downgrade itself to the weaker wording and nobody would see it.

**2. Rule 3 is satisfied by one module of three, and the other two say so in
their own comments.** The rule asks for a fixture matching *"a real published
third-party schedule, not a formula we derived"*:

| Module | Anchor | Third party? |
|---|---|---|
| `mortgage.ts` | calculator.net's published $2,066.16 / $743,818.78 / $423,818.78 | **yes** |
| `debt-payoff.ts` | "the standard loan payment formula… $193.33" | no — a formula |
| `coast-fire.ts` | "the compound interest formula FV = PV × (1 + r)^n" | no — a formula |

Both are honest about it in their own headers, and both are genuinely checkable
by a reader with a spreadsheet, which is far better than self-consistency. But a
formula cannot adjudicate a **convention**, and conventions are where money bugs
live. The mortgage anchor earned its keep on exactly that: it settled half-up
against round-up, $2,066.16 against $2,066.17, which both readings of "the
formula" permit. Nothing plays that role for the other two engines.

**Not fixed here, and the reason is not laziness.** Manufacturing an anchor by
finding some calculator that agrees with us is the appearance of verification,
not verification. `docs/VERIFICATION.md` already names **investor.gov** for the
compound-interest check, which is a published third-party tool and the natural
anchor for `coast-fire.ts` — it simply has never been run. The honest sequence is
that the operator runs it, and its output is recorded as the fixture's source.
Recorded as a known gap so the next session does not read D7's summary table and
conclude all three engines are externally anchored. They are not.

**What the audit does not prove, stated so it is not over-read.** Both
implementations use `annualRate / 12` and half-up per-period rounding. Had that
convention been wrong for a US fixed-rate loan, both would be wrong identically
and all thirty-three checks would still pass. The single thing standing between
this site and a consistent, confident, undetectable error is one retrieved figure
from one competitor, dated 2026-08-08, now supporting four published pages.

### D64 — Tool 4 is the first jurisdiction variant, and `contracts.ts` finally exists

`/finance/uk-early-repayment-charge-calculator`. The first tool built for a
country rather than a convention, and the first thing that made rule 13's
architecture necessary instead of theoretical.

**Why it clears rule 13 where a currency switcher did not.** A UK fixed deal
allows a percentage of the balance to be repaid each year without penalty and
charges a percentage of the excess. A US fixed-rate note has no such term. That
is a different *rule*, not a different word — which is exactly the distinction
rule 13 draws, and exactly why the earlier proposal to put a **£** on the US
engine was rejected: it would have changed the symbol and nothing else, on an
engine whose header says UK early repayment charges are not modelled.

**`src/lib/calc/contracts.ts` was specified in rule 13 from the first commit and
had never been written.** It exists now, and deliberately does very little: it
carries the presentation facts a jurisdiction fixes — id, label, currency, locale
— so no caller ever branches on a country to format a figure. It does **not** try
to abstract "a mortgage" across countries. That abstraction would be wrong for
D6's reason: the same word meaning different things is how a compounding
convention gets silently misapplied. The island reads `JURISDICTION.currency`
off the engine, so there is no `switch (country)` and no hardcoded `£`.

**Both contractual figures are inputs, and that is a deliberate cost.** The
allowance and the charge vary by lender, by product and often by year of the
deal, so any number filled in would be wrong for most readers and uncheckable by
all of them. It makes the tool slower to use than a competitor that guesses. The
regulator supports the choice: **MCOB 12.3.1R** requires a charge to be *"able to
be expressed as a cash value"* and *"a reasonable pre-estimate of the costs"* —
it is a stated number on the borrower's offer, not something to estimate. Read
at handbook.fca.org.uk on 2026-08-18, quoted rather than paraphrased (D56).

**The two horizons are the honest heart of it.** A UK deal is fixed for a few
years and then reverts to a rate nobody can know, so a saving quoted over a
25-year remaining term is a forecast wearing a schedule's clothes. The tool
reports the interest removed *within the contractually fixed months* — which
rests on no assumption at all — separately from the whole-term figure, which is
labelled as assuming a rate that expires. Collapsing them into one number is
what every competitor does and it is the thing this tool exists not to do.

**The finding, which is not what the charge's prominence suggests.** On an
illustrative £250,000 at 4.5% with 36 months still fixed, a £450 charge is
outrun by **£5,598.91** of interest removed inside the fixed period alone. The
comparison reverses on the two things borrowers rarely check — the rate, and how
long is left — not on the charge percentage they fixate on. At 1.5% with six
months left and a 5% charge, the same overpayment runs **£936.71 behind**, with
the crossing point at **£28,581.69**. The rule of thumb the arithmetic produces:
a charge is a one-off percentage, the saving is the rate working over the months
still fixed.

**The break-even is bisected, not solved.** D61 rejected a closed form because a
schedule that rounds every period has no clean algebraic answer; the same applies
here, so the crossing point is found by bisection on whole pence. Its fixture is
**self-verifying**: it asserts the net is non-negative *at* £28,581.69 and
negative *one penny past it*. Asserting the number alone would prove nothing
about the search that produced it. It returns `null` — never a misleading finite
number — whenever the saving stays ahead all the way to the full balance, which
at ordinary rates is the common case.

**The byte cost was measured before the UI was written, and it landed on another
page.** A fifth island pulls `mortgage.ts` out of the mortgage calculator's own
chunk and into a shared one, so that page moved **16.32 → 16.70 KB with its own
code untouched** — D23's phenomenon again, and the third time splitting across
island boundaries has cost rather than saved. Affordable because it had 3.18 KB
spare; the binding page, debt payoff at 0.99 KB, does not import `mortgage.ts`
and is unchanged at 18.51. The new page sits at **17.43 KB**. Had the binding
page moved, the tool would have needed rethinking rather than the budget raising
(rule 9).

**Two things found by reading the rendered page, as usual.** The charge row
rendered `− £1,250.00` with a hand-written U+2212 one line above Intl's U+002D
on the net row — two different minus glyphs in one money table. It is negated
through Intl now, so a single glyph is used throughout. And the mobile pass
confirmed the first input sits at 629px of an 830px viewport, above the fold on
a 375px screen, which is the constraint D34 fought for.

**Not fixed, and stated rather than left implied:** the theme toggle is 31px and
the schedule buttons 37px on a phone. Both clear WCAG 2.2 SC 2.5.8 (AA, 24×24)
and miss SC 2.5.5 (AAA, 44×44). They are identical on all four calculators, so
raising them on this page alone would make it the odd one out — it is a
site-wide change or none.

### D65 — An invalid SVG attribute, and a console buffer that reached a merged decision

`ProofChart.astro` set `height="auto"` on its `<svg>`. `auto` is not a valid SVG
length, so the browser rejected the attribute and logged
`<svg> attribute height: Expected length, "auto".` on every render.

**The fix is a deletion, and it changes nothing visually.** That is the whole
argument for it being safe: the browser was *already* discarding the attribute
and sizing the element from `width="100%"` plus the `viewBox`, which is exactly
what it does now. Measured after: rendered ratio **3.200** against a viewBox
ratio of **3.200**, in both themes, with all three series still drawn. Height is
now left to CSS (`h-auto`) rather than asserted in an attribute that could not
be honoured.

**Why no gate caught it.** Ten checks read `dist/`; the markup they read is
*valid HTML* and the string `height="auto"` is unremarkable in it. The defect
only exists once a browser parses the attribute as an SVG length, and **nothing
in CI reads browser console output**. Ninth time a real defect surfaced because
a check was asked a question it had not been asked before (D18, D26, D31, D41,
D45).

**No gate was added, and the reasoning is D27's.** A console-error gate means
Playwright and a headless run in CI for a class of defect that has appeared once.
The same argument was made and accepted against contrast checking. If a second
console defect appears, that changes.

**The part worth keeping is the correction.** D61 recorded this as *"every page
on the site logs two console errors"* and said it had been reproduced on
`/biweekly-mortgage-payments`. Both claims were false. `ProofChart` is imported
by `src/pages/index.astro` and by nothing else — verified twice, against the
imports and against the built output, where exactly one file in `dist/` contains
the chart's SVG. The other pages mention ProofChart only in code comments citing
D32, which is what the original grep matched.

What produced the false reading was a **console buffer persisting across
navigations**: the errors seen on later pages were carried over from an earlier
visit to the homepage in the same browser session. D59's rule — suspect the
measurement before the source — has now been earned six times, and this is the
first time a bad measurement got past review and into a merged decision record.
D61 is annotated rather than rewritten, because a decisions file that quietly
edits its own history is worth less than one that shows where it was wrong.

**The generalisation:** a console read is only evidence for the page that was
loaded *after* the buffer was last clear. Navigate, then read, and confirm the
element you are blaming is actually on the page you are reading.

### D66 — "Dull" measured fine again, and the PDF button was missing from one calculator of four

Two reports from the operator on the UK tool: the result panels looked dull in
both themes, and there should be a way to get the result out as a PDF. Neither
turned out to be the thing it looked like.

**The contrast complaint measured fine — for the fourth time (D29, D36, D50,
D54).** Resolved through a canvas, compositing each layer over the page colour
first:

| | Before |
|---|---|
| "What the charge comes to" | 12.75px, weight 400, **5.12:1** |
| "Contractual — no assumption" | 12.75px, weight 400, **5.12:1** |
| "How far the charge can be outrun" | 12.75px, weight 400, **4.67:1** |
| Body text in those panels | 15.94px, **7.49:1** |

Every one clears WCAG AA. Nothing was failing. The actual defect is in the
fourth row: **the headings were smaller and lighter than the text they headed** —
12.75px at weight 400 introducing 15.94px content. A heading with less presence
than its own body has no hierarchy, and that reads as dull however well it
contrasts. This is D36's finding restated: *when a contrast complaint measures
fine, the answer is size, weight, spacing or a rule.*

Those eyebrows were also **my own invention** rather than an established idiom —
no other island uses a heading element at all, so there was nothing to be
consistent with and `engraved-fine text-ink-mute` got used for a job it was never
meant to do. They are `.section-head` now, which is the site's existing device
for exactly this: display face, 1.375rem, weight 600, over a hairline.

| | After (light) | After (dark) |
|---|---|---|
| Section headings | 23.375px, 600, **15.74:1** | **16.05:1** |
| "Contractual" eyebrow | **16.58:1** | **15.05:1** |
| "How far the charge" | **14.38:1** | **16.71:1** |
| Primary panel border vs page | **3.65:1** | **4.05:1** |

**The two horizons are now deliberately unequal, and that is the point.** They
were rendered identically, which invited the reader to pick whichever number they
preferred — the opposite of what separating them was for. The contractual panel
is solid, bordered with `--color-line-strong` and carries its eyebrow at
**16.58:1**; the assumed panel stays quiet at **5.28:1**, which still clears AA.
The asymmetry encodes which figure is trustworthy, so hierarchy now carries what
the prose was carrying alone.

**The PDF request was a missing feature, not a new one.** All three earlier
calculators ship a *Save as PDF or print* button and a `beforeprint` handler.
The UK tool shipped with neither — D59's shape for the third time, a pattern
present on the siblings and absent from the newest, and introduced by the same
session that wrote D59's lesson into the file.

No library was considered. D11 settled it: jsPDF is ~90KB gzipped against a
19.5KB budget, and the browser's print pipeline is the better document anyway —
selectable text, real typography, and the chart as vector rather than raster.
Verified by dispatching `beforeprint` rather than opening a dialog: the masthead
appears with the date and the scenario URL, and **the schedule expands from 12
rows to all 224**, so a printed PDF carries the complete schedule rather than the
preview. `ScheduleTable` was already doing that expansion itself; the island only
had to stop being the one calculator that never asked.

**Cost: 0.37KB** on this page (17.43 → 17.80, 1.70 spare). Recorded rather than
waved through, because that is budget being spent on something.

### D67 — Calendar months on the schedule, and the budget did not have to move

"Month 224" makes a reader do arithmetic before they can feel anything. "Apr
2045" is the answer they came with. The mortgage schedule now carries a **Due**
column and the term stat reads *last payment Dec 2049*, anchored to a first
payment month the reader can set.

**The budget was measured before any UI was written, and it held.**

| | Before | After |
|---|---|---|
| mortgage-overpayment | 16.70 KB | **17.40 KB** (+0.70, 2.10 spare) |
| **debt-payoff (binding page)** | 18.51 KB | **18.51 KB — unchanged** |

`lib/dates.ts` is imported by one island, so it lands in that island's chunk
rather than the shared one and the constrained page never sees it. **No budget
raise, and no `client:visible` split.** Both were on the table and neither was
needed — which is the order rule 9 asks for: exhaust the structural options, and
only then discuss the number. The `client:visible` option D10 names is still
unused and still available for whatever needs it next.

**Dates are not in `calc/`, and must never be.** Rule 1 requires pure functions
with fixture tests; a function that reads the clock is neither, and its fixtures
would fail the following morning. The engines still return month indices. The
clock is read in the island, and `currentYearMonth(now = new Date())` takes the
date as a parameter so that even the one function which touches it is testable.
`calc/` remains entirely `Date`-free.

**Months are integers, not `Date` objects, and that removes two bugs rather than
handling them.** A month is `YYYYMM` — August 2026 is `202608` — advanced by
integer arithmetic:

- **Month-end.** `new Date(2026, 0, 31)` plus one month is 3 March, not 28
  February, because JavaScript overflows instead of clamping. A schedule
  starting on the 31st would skip a month about seven times a year.
- **DST.** Adding months in local time crosses daylight-saving boundaries and
  can land an hour earlier, flipping the day at midnight.

Neither is possible against an integer. There is no day component at all, which
is also why the input asks only for month and year: a schedule anchored to "March
2045" is exactly as useful as one anchored to "14 March 2045", and the day would
be a precision we have not got. Formatting goes through `Date.UTC` and a UTC
formatter, because a local-time midnight on the 1st is the *previous month*
everywhere in the Americas — that alone would have shifted every row.

**Row 1 is the month AFTER the anchor**, because a payment is made at the end of
a period, not the start. Getting that backwards would shift all 280 rows by a
month while looking entirely plausible.

**The anchor is deliberately outside the `PARAMS` spec, and this was the sharpest
finding.** `parseParams` falls back **wholesale** — one missing field resets every
other one — which is right for financial inputs and would have been a real defect
here. Adding a required `s` would have meant **every permalink already shared
silently resetting to the default scenario**: a link carrying someone's actual
mortgage would quietly show $320,000 at 6.706% instead. Verified by loading
`?p=250000&r=5.5&y=25&o=300` with no date param — all four values restore intact
and the date falls back to the current month.

An absent date is not half a scenario; it is an unset display preference, so it
is read on its own with `parseNumber` and defaults to now. A malformed one
(`s=999999`) falls back to the current month with the financial inputs untouched
and is not echoed back.

**And it does reach the URL**, through a ref that `encode` reads, because a
shared link carrying the figures but not the anchor would show the recipient the
same money against a *different payoff month* — the one inconsistency a permalink
must not have.

**On the live clock that was also proposed, and declined.** A widget showing the
current date and time was considered and rejected: it computes nothing, it
duplicates something every device already shows in its own corner more accurately,
it needs a `setInterval` re-rendering an island that is memoised specifically to
avoid that, and it is a dashboard ornament on a site whose identity is a ledger
(D3, D29). The temporal grounding it was reaching for is what the anchor month
and the payoff date actually deliver, tied to the reader's own mortgage rather
than to a wall clock. The print masthead already stamps the date where a date
genuinely belongs — on a document that will outlive the tab.

**Applied to one calculator, not four.** The other three keep month indices until
this has been looked at in use. Doing all of them at once would have put the
shared chunk on the binding page, which is precisely the measurement that came
back clean only because it was avoided.

### D68 — Three calculators got dates. Debt payoff could not, and the number said so

D67 put calendar months on the mortgage schedule and left the other three to be
decided on measurement. Measured: **two of the three, and debt payoff is
excluded.**

| Page | Before | After |
|---|---|---|
| UK early repayment charge | 17.80 KB | **18.68 KB** (0.82 spare) |
| Coast FIRE | 16.62 KB | **17.28 KB** (2.22 spare) |
| Mortgage overpayment | 17.40 KB | **17.58 KB** (shared-chunk cost) |
| **Debt payoff** | 18.51 KB | **18.51 KB — not changed** |

**Debt payoff was wired, measured at 19.37 KB, and reverted.** That is 0.13 KB
of headroom against 19.5. It *passes* the gate, which is exactly why it needed a
judgement rather than a green tick: D34 called 0.01 KB headroom "untenable" and
moved the budget rather than live with it, and shipping at 0.13 would leave the
next person to touch that island with a build that fails for reasons they did
not cause.

**Every escape route was checked before concluding, and each one closed:**

**`client:visible` does not apply to this metric.** D10 names it as "the honest
fix" for budget pressure. It is not, for this gate: `check-js-budget.mjs` follows
each page's entry points and walks **static imports transitively**, and a
`client:visible` island still declares its `component-url` in the HTML. The bytes
are deferred at runtime and counted all the same. Worth recording because D10's
advice reads as available and is not — the real-world load improves, the number
does not move.

**D28's prose extraction is exhausted on that island.** Scanned for static
sentences still living in `DebtPayoffCalculator`'s JSX: **245 characters across 7
strings**, and most are structural labels — "Download spreadsheet (CSV)", "Name
on the report (optional)" — not prose. Extracting them would yield a rounding
error and make the component worse.

**Raising the budget is refused by the tooling itself.** `check-js-budget.mjs`
prints, on failure: *"Do not raise the budget. Find what got added and remove
it."* Rule 9's own framing is that needing a raise is evidence the change is
wrong. On 0.13 KB of headroom for a convenience column, the change is wrong.

**Where the bytes actually are**, since it was measured anyway:
`DebtPayoffCalculator.js` is **4.55 KB — the largest chunk on the site**, ahead
of preact itself at 4.31. `dates.js` is only **0.59 KB**, but it is unavoidable
once a second island imports it, because Rollup promotes it to a shared chunk.
That promotion is what moved the mortgage page 17.40 → 17.58 with its own code
untouched — D23's phenomenon for the fourth time.

**Coast FIRE got a year, not a month, and no new input.** Its schedule is indexed
by **age**, not by month, and `s` is already taken there by annual spending. The
calendar year is therefore *derived*: `currentYear + (age − currentAge)`. No
second input to justify, no param collision, and the reader has already supplied
everything it needs. Verified that changing the age re-derives correctly — age 45
still maps to the current year, not to a frozen offset.

**The UK tool renders "Sept 2026" where the US ones render "Sep 2026"**, because
`formatYearMonth` is given `JURISDICTION.locale`. That is the rule 13 contract
from D64 doing real work rather than sitting in a type — the date format follows
the jurisdiction without anything branching on a country.

**Backward compatibility re-verified on both.** A link carrying only the
financial params restores all of them and falls back to the current month, which
is the whole reason D67 kept the anchor outside the wholesale spec.

**What would make debt payoff possible later**, recorded so it is not
rediscovered: the island is 4.55 KB and is the only one still carrying its full
input list, debt rows and results in one component. Splitting the debt-row editor
into its own module would not help the total. What would help is the thing
nothing has tried — reducing what that island renders, not where it hydrates.

### D69 — The llms.txt gate, and a gate that CI cannot yet run

D61 found `/biweekly-mortgage-payments` absent from `llms.txt` for two pull
requests, recorded it as a known gap, and explicitly declined to build the check
because that pull request was already carrying an engine change.
`scripts/check-llms.mjs` closes it.

**Fourth time a page has existed without appearing where something looks for
it.** D41: orphaned from the navigation. D50: absent from the homepage's own
calculator list. D61: absent from `llms.txt`. Three of the four were found by a
human noticing. Twice is a pattern; four times is a gate.

**Why it matters more than tidiness.** CLAUDE.md treats AI assistants as a
first-class traffic channel, on the reasoning that retrieval systems weight
structure and specificity far above backlink profile — the one axis where a new
domain is not automatically last. `llms.txt` is the entirety of that surface. A
page missing from it is not untidy, it is absent from the channel this site is
best positioned to win. The Cloudflare logs make that concrete: **AppleBot hit
57 times in the day GoogleBot hit once** (D60).

**It fails safe, which is the whole design.** Requirement is the default: every
URL in the sitemap must have a `URL:` line unless its path is explicitly
exempted. The alternative — a list of pages to check — would have checked
nothing for anything newly added, which is precisely how the original defect
survived two pull requests. Add a page and forget, and this fails naming it.

**It checks the reverse direction too.** An entry pointing at a page the build no
longer produces is a dead citation, and a retrieval system that follows it gets a
404 with this site's name on it.

**Proven to fail, in both directions and in the fail-safe one** (D18: a gate that
has never failed is not a gate). Repointing the biweekly entry at a nonexistent
path produced two failures at once — the real page missing, and the invented one
stale. Injecting a brand-new URL into the sitemap failed naming it. Exit 1 each
time; exit 0 restored.

**Nothing was found today.** All 12 tool and derivation pages are catalogued and
no entry is stale. That is a regression guard rather than a fix, and it is
recorded as such — the defect class is proven real, this instance is not.

**The gate needed an operator action to become real, and got one.** The workflow
runs each check as its own named step rather than invoking `npm run verify`, so
adding the script and the npm script was not enough. `.github/workflows/` is
denied to an agent by the permission rules — correctly, since a release path an
agent can rewrite is not a release path, and that guardrail is deliberately
stricter than CLAUDE.md's own wording, which forbids modifying workflow
*permissions* rather than adding a step.

The block was therefore written into the pull request body for the operator, who
added it in **#58**. Confirmed live by reading the executed step list of the
`verify` job on `main` rather than trusting a green tick: step 15,
`llms.txt catalogue`, between `Structured data` and `Deploy config`, conclusion
`success`. That merge also carried `deploy: success`, so the gate now guards the
live release path.

**Not proven by a deliberately red CI build**, and that is a considered omission
rather than a gap. The script's three failure modes are proven locally (exit 1
for a missing entry, a stale entry, and an uncatalogued new page), and that a
non-zero exit turns this job red is already demonstrated by #49, where the
`Formatting` step failed `verify`. Burning a red build on `main` to re-prove
GitHub Actions' documented behaviour would cost a deploy cycle for no new
information.

**The general point worth keeping.** An agent can write a check and wire it into
`package.json`, and that check will still not run where it matters. The gap
between "the script exists" and "CI executes it" is invisible from inside the
repository, and it is the same shape as D45: `_headers` was correct-looking,
committed, and parsed by nothing until a deploy failed on it. When a gate is
added, verify the pipeline *ran the step*, not that the pipeline was green.

### D70 — The tap drill page described a rule the code had already rejected

`/machining/tap-drill-calculator` shipped in PR #61 asserting, in a FAQ answer
and in a full explanation section, that "the recommended drill is the largest
one in your index that does not exceed the target" and that "engagement can only
come out at or above what you asked for, never below."

`snapToSeries` does nothing of the kind. It takes the **nearest** drill, tie to
the larger — and the comment above it explains at length that never-exceed was
the first implementation, that it was wrong, and why. The prose describing the
rejected rule was left behind when the rule changed.

**It is falsified by the page's own default view.** M8 × 1.25 at 75% wants
6.7822 mm. The tool returns 6.8 mm — larger than the target — and the result
panel prints "You will get 73.9% / you asked for 75%", directly under an
explanation saying engagement can never come out below what was asked. Anyone
reading the page top to bottom sees the contradiction without typing anything.

**Why it survived two pull requests.** Every gate this project owns checks the
code against a standard, or the build against a document, or a link against the
network. Nothing checks the *prose* against the *code*, and prose is where the
argument for correctness actually lives. 330 tests passed the whole time: the
implementation was right and well covered. What was wrong was the sentence
describing it, and a test suite has no opinion about sentences.

This is the same shape as the four findings in the research repo's
`findings-from-build.md` — right answer, wrong claim about it — and it is the
first instance where the code was correct and the page was not, rather than the
reverse.

**What changed:** both passages now describe nearest-with-tie-to-larger, state
plainly that the recommendation *can* land above the target, and keep the M4 ×
0.7 → 3.50 mm competitor defect where it was, reframed correctly. The defence
against that defect was never the rounding direction; it is that the drill comes
from an index of sizes that exist, and that the true engagement is always
printed beside the requested one. `llms.txt` carried the same false sentence to
AI retrieval systems and is corrected too.

**The pin:** `tests/calc/tap-drill.test.ts` now asserts that M8 × 1.25 at 75%
returns 6.8 mm and that the chosen drill EXCEEDS the target diameter. Reverting
to never-exceed fails a test whose message names this decision, so the rule and
the paragraph describing it cannot drift apart again without something going
red. A general prose-versus-code gate is not attempted; this pins the one claim
that was wrong and the one input the page loads with.

---

### D71 — The thread constants are derived from √3, and the tie is half-even

`tap-drill.ts` shipped with `ENGAGEMENT_K = 1.299` and `MINOR_DIA_K = 1.0825`,
the decimals machining practice quotes. Both are roundings of an identity:
ISO 68-1's basic profile has `H = (√3/2) × P` exactly, so the constants are
`3√3/4 = 1.2990381…` and `(5/8)√3 = 1.0825317…`. The truncation is 2.9 parts in
100 000.

**That is invisible in the shop and visible on the page.** A twist drill's own
diameter tolerance is hundreds of times larger, so no hole changes. But against
the canonical 25-row fixture the rounding moved the fourth decimal of the basic
minor diameter on 8 rows — under a four-decimal display floor — and the
*published second decimal* of engagement on three: #8-32 68.98 → 68.97, #10-24
74.83 → 74.82, 5/16-18 76.91 → 76.90. The argument this site makes is that its
numbers are checkable against a catalogue. A machinist doing that check reads
the second decimal.

**The rounding also cost us a published table row, which is how it was found.**
At full precision the shop-rule target is exactly `major − pitch`, so M8 × 1.25
lands on 6.750 mm and M12 × 1.75 on 10.250 mm — each *exactly* midway between
two catalogue drills. The published chart resolves those two ties in opposite
directions: M8 up to 6.8 mm, M12 down to 10.2 mm. Computed as `1.299 × 76.98`
they land 0.04 and 0.05 µm above midway, the ties vanish, and no rule can
reproduce the chart. That is precisely why an earlier revision of this file's
sibling in `machinist-calc-research` concluded the table was underivable and
that "nothing does better" than tie-to-larger.

Something does. **Half-even is not monotone**, and no monotone rule can satisfy
two ties broken in opposite directions. Breaking an exact tie to the even
multiple of the local step reproduces the published chart on every metric row in
range: 11 of 11, against 10 of 11 for tie-to-larger, which missed M12. It is
also not a rule invented to win that row — half-even is already the module's
declared display rounding, applied to a grid of real drills instead of to a
decimal place.

**Rejected: keeping 1.299 because the pair is self-consistent.** `1.0825 =
(5/6) × 1.299` exactly, so drilling to D₁ came out at exactly 83⅓ % engagement,
and that was the stated reason to keep both. The premise is true; the conclusion
does not follow. The 5/6 is `(5/8)/(3/4)` with H cancelling — pure geometry, so
it holds for *any* common H. It breaks only when the two constants come from
*different* roundings of H. Both now derive from one `H_PER_PITCH`, so it is
preserved, and a test asserts it rather than a comment claiming it.

Source of truth changed first, as the fixture checksum gate requires:
`machinist-calc-research` 7f38eaa, then `machinist-calc-app` c49ec5c, then here.

### D72 — Inch threads do not fit in whole micrometres, and the page still rounds them

Found while landing D71, and larger than D71.

`Micrometres` is deliberately integral — it is the guard that catches a
millimetre passed where a micrometre was meant, and it is a good guard. Metric
threads survive it exactly: 0.1 mm is 100 µm on the nose. **Unified inch threads
do not.** 0.164 in is 4165.6 µm; 1/32 in is 793.75 µm; 1/64 in is 396.875 µm.
Rounding each to a whole micrometre *before* the division moves the answer by
more than the second decimal:

| Thread | Exact | Via whole µm |
|---|---|---|
| #8-32 on a #29 | 68.97 % | 69.03 % |
| #10-24 on a #25 | 74.82 % | 74.87 % |

That is ~0.06 points — physically nothing, and a published digit. It is on the
Unified series, which is the one used across four of the five target markets.

**It was invisible because the fixture was wrong in the same direction.** The
old golden values were computed with the truncated constant, which happened to
push the inch rows the same way the µm rounding does. Correcting the constant
made the two disagree and the assertion failed — the fixture and the pipeline
had been wrong together, and only became legible when one of them got right.

**Rejected: loosening the assertion to make it pass.** It was one line and the
tolerance was already `toBeCloseTo(…, 1)`. Widening it would have retired the
only check that can detect this, to hide a defect the check had just correctly
found.

**Resolved by moving the whole machining domain to nanometres.** `Micrometres`
became `Nanometres` across `tap-drill.ts`, `drill-series.ts`, `drill-chart.ts`
and `feeds-speeds.ts`, with their pages and tests. The brand stays integral —
that guard was never the problem, the scale was.

`NM_PER_INCH` is 25 400 000 = 2⁸ × 5⁵ × 127, so any inch figure quoted to five
decimals or fewer is a whole number of nanometres, and 64 divides it: **1/64 in
is exactly 396 875 nm, remainder zero.** The fractional drill catalogue is now
its exact nominal size rather than a rounded near-miss, and `Math.round` came
out of its generator because it had become a no-op that implied a precision loss
that was gone. It is also the representation the Kotlin core already uses, which
makes the two directly comparable for the Gate 7 cross-check.

The golden inch rows were then **rewired onto the rounding conversions the page
actually calls**, not a private exact variant, and they pass at two decimals. So
the claim "the shipped path is correct" is tested rather than asserted, and
`inchToUmExact`/`tpiToPitchUmExact` were deleted as the dead workarounds they
had become.

**What still rounds, stated.** `tpiToPitchNm` divides 25 400 000 by the thread
count and only some counts divide exactly — 32 tpi gives 793 750 on the nose,
24 tpi gives 1 058 333.33 and is rounded. The residue is under half a nanometre
in a million, four orders of magnitude below the micrometre error it replaces
and far below the second decimal the fixture asserts.

**The part worth keeping: 334 tests and eleven gates passed while the page
displayed a number a thousand times wrong.** Both calculator pages rendered inch
lengths by dividing nanometres by `25400` — the *micrometre*-per-inch constant,
a bare numeric literal that no rename could see and no type could catch, because
both sides are `number`. 1/4-20 showed a target of **201.2861 in**. Nothing in
the suite covers presentation-layer unit conversion: the calc tests stop at the
module boundary, and the byte-budget, link, spacing and schema gates have no
opinion about arithmetic. It was found by opening the page and reading it, which
is the same way D70 was found and the same lesson — the tests prove the code
does what it was told, and say nothing about the layer that formats the answer.

### D73 — Above the top of the drill index there is no answer, and the largest drill is not one

Found by the display gate D72 asked for, on its first run, which is the entire
argument for building it.

`snapToSeries` takes the NEAREST drill in the index. Above the ceiling that
means the largest one, however far away it is — and the metric index stops at
13 mm. So the page answered:

| Thread | It recommended | Reporting |
|---|---|---|
| M16 × 2 | 13 mm | 115.47 % |
| M20 × 2.5 | 13 mm | 215.54 % |
| M24 × 3 | 13 mm | 282.26 % |
| M30 × 3.5 | 13 mm | 373.90 % |

Every one reachable by typing a common thread into the form. **"Use this drill:
13 mm" for an M30 hole is a broken tap and a scrapped part.** The engagement
figure beside it is absurd enough that an attentive machinist would stop, but
the headline is a plausible-looking drill size in large type, and the
engagement is in smaller type below it.

Gate 9 is explicit — `unavailable` is an acceptable output, a plausible wrong
number is not — and the Kotlin core in `machinist-calc-app` already refuses
these, returning `NoDrillInRange`. The two cores disagreed, and the site was the
one that was wrong.

`tapDrillDisplay` now refuses when the target exceeds the largest drill in the
chosen index, with a message naming both numbers: *"No drill in this index
reaches 17.5643 mm. The largest it holds is 13 mm."*

**Guarded at the top only, deliberately.** Below the smallest drill the nearest
one genuinely is the nearest real drill — a 0.49 mm target against a 0.5 mm
index is a fair answer, off by a fiftieth of a millimetre. 17.5 against 13 is
off by 4.5 mm and serves nothing. The distinguishing fact is the distance, not
the direction, and only one end of this index produces distances that matter.

**Placed in the display layer, not in `snapToSeries`.** The calc function's
contract — nearest drill in the series provided — is honest and is asserted by
existing tests including one for targets below the series. What was missing was
a caller deciding that "nearest" had stopped being "suitable". Moving that
judgement into `snapToSeries` would change a shared primitive to fix one
caller's presentation problem. If the fractional index or a future number-drill
index needs the same rule, this is the layer that already has it.

### D74 — Drilling does not "reduce to the turning arithmetic", and the FAQ said it did

`calculations.md` §3 requires milling, turning, drilling and boring. The page
shipped two, and an FAQ answer explaining why the other two were unnecessary:

> Because drilling reduces to the turning arithmetic with the drill diameter as
> Dc and feed in mm/rev, and adding a third mode that reuses the same two
> formulas would be interface for its own sake. Use turning and read fn.

**The premise is half true and the advice is wrong.** Drilling does reduce to
the turning expression — at a depth of cut of exactly `Dc / 4`, and at no other
value. A drill removes the whole cylinder it advances into, so
`Q = (π Dc² / 4) × vf`, and substituting `vf = fn × n` with
`n = Vc × 1000 / (π Dc)` cancels π and one power of Dc to leave
`Q = Dc × fn × Vc / 4` — which is `Vc × ap × fn` with `ap = Dc/4`.

Turning mode makes ap an input, and nothing on the page said which value to
type. For a 10 mm drill at fn 0.2, Vc 80 — a 40 cm³/min cut:

| What the user enters for ap | Removal rate | Factor |
|---|---|---|
| `Dc/4` = 2.5 mm — the only correct value | 40 | 1.00× |
| `Dc/2` = 5 mm — "it cuts to half its diameter" | 80 | **2.00×** |
| `Dc` = 10 mm — "the whole hole" | 160 | **4.00×** |
| 1 mm — a plausible finishing depth | 16 | 0.40× |

Power scales linearly with the removal rate, so a machinist checking against
spindle rating was off by the same factor.

Drilling and boring are now their own modes and **neither asks for a depth of
cut** — drilling's is fixed by the drill, and boring's is derived from the two
diameters. The FAQ now states the difference instead of denying it.

**Boring takes both diameters on purpose.** `ap = (d1 − d0) / 2`, because the
diameter grows by twice what the tool takes off the radius. Asking for "depth of
cut" invites the commonest error in the operation — entering the diameter change
and doubling everything downstream. Taking both makes it unrepresentable, and
the working box shows the derivation rather than hiding it.

### D75 — Turning's cutting power was computed with the milling formula, and was π times too small

Found while adding D74's modes, and worse than D74.

`renderPower` took ae, ap and vf and handed them to `millingPower`, which
recomputes the **milling** removal rate `ae × ap × vf / 1000` from them. Turning
had no ae, so the page passed **Dc** in its place. The result:

```
        page:  Q = Dc × ap × vf / 1000
    should be: Q = Vc × ap × fn
```

and since `vf = fn × n` with `n = Vc × 1000 / (π Dc)`, the first is the second
divided by **exactly π**. Not approximately — the Dc cancels and π is left
standing.

On the page's own turning defaults — Vc 200, Dm 50, ap 2, fn 0.25, kc1.1 1500,
mc 0.25, η 0.8:

| | Removal rate | Net power | On a 3 kW spindle |
|---|---|---|---|
| What it showed | 31.83 cm³/min | 1.407 kW | 47% — comfortable |
| The truth | 100.00 cm³/min | 4.419 kW | **147% — overloaded** |

The removal rate displayed beside it was always right; only the power was
wrong, which is what made it survivable. §3 asks for exactly this feature —
*"warn when computed Pc exceeds the selected machine"* — and it was under-warning
by a factor of three on every turning cut.

**The fix is structural, not arithmetic.** `cuttingPower(Q, kc, η)` now takes a
removal rate rather than one operation's inputs, so all four operations share
one power path and no operation's formula can be reused for another's numbers.
`millingPower` is kept as the milling-shaped entry point and expressed through
it, so the two cannot diverge. A test asserts the ratio is π, which is the only
way to state "this specific bug is gone" rather than "the numbers changed".

**Why no gate caught it.** The same reason as D70 and D72: every check stops at
a module boundary. `millingPower` was correct and tested. `turningMrr` was
correct and tested. What was wrong was a call site handing one function the
other's arguments, and nothing in the suite exercised the page's wiring. That is
three defects now in the seam between a correct module and a correct module.

---

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

### D76 — A removal rate and its unit must travel together, and inch mode proved it

The feeds page displayed a removal rate **16.387064× too high for milling and
53.7633× too high for turning, boring and drilling**, for as long as inch mode
has existed. On a 1 in bar at 400 sfm, 0.010 in/rev, 0.100 in depth of cut it
printed 258.064 in³/min for a cut that removes 4.8.

Two independent errors compounded, and neither is arithmetic:

1. **A label chosen instead of a conversion.** Every MRR function normalises
   `Nanometres` to millimetres and returns cm³/min — always, because
   `Nanometres` carry no unit system. The page selected the string `in³/min`
   for inch mode and printed the unconverted number beside it.
2. **A convention assumed instead of stated.** `turningMrr` and `drillingMrr`
   take Vc in m/min. The page handed them the surface-feet-per-minute figure
   the user typed.

Together: 25.4² / 12 = 53.7633. The first alone: 16.387064.

**Every individual function was correct.** The arithmetic was never wrong; the
unit handling between the functions was, and it lived in a `.astro` template
where no test could see it — `vitest.config` covers `src/lib/calc/**`. That is
D72's shape exactly: the site once rendered `201.2861 in` where the answer was
`0.2013 in`, past a whole green suite, because a conversion lived in a template
instead of a tested function. The lesson was recorded and then not applied one
directory over.

The fix is two functions in the tested module, and the shape of them is the
decision:

- `cuttingSpeedToMetric(vc, units)`, and **`units` is a required parameter of
  `turningMrr` and `drillingMrr`** rather than a defaulted one. The lengths
  arrive as `Nanometres` and reveal nothing, so a default would silently pick a
  convention. Making it required turned this into 13 compiler errors at the
  existing call sites, which is where a unit mismatch should surface.
- `removalRateFor(cm3PerMin, units)` returns **`{ value, unit }` together**. The
  defect was a value and a label disagreeing, so they are now one object and
  cannot. A caller cannot relabel without converting, because it never touches
  the label.

The derivation box was wrong in a way worth recording separately: metric and
inch are genuinely **different equations**, not one equation with the numbers
swapped. Metric divides mm³ down to cm³; inch multiplies surface feet per minute
up to inches per minute. The box printed the metric form to inch users, so it
read `Q = 0.25 × 0.1 × 24.4462 / 1000 = 10.015 in³/min` — an equation whose left
side evaluates to 0.00061. **A working box that formats its own values is a
second display layer, and the first thing it does is disagree with the first.**
It now quotes the panel's rendered figure rather than rounding again.

The Kotlin implementation made the identical mistake independently and fixed it
first: `FeedsSpeedsPresentation.kt` has `CM3_PER_IN3 = 16.387064` and a comment
naming the web side as the sibling case. So Gate 7 worked exactly as intended —
two independent implementations disagreed, and the disagreement was the signal.
Nobody acted on it for as long as it took an audit to ask.

Both defects are now asserted by tests that were confirmed to fail when each is
reintroduced separately. A regression test that has never failed proves nothing.

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
