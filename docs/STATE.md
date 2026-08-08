# Project state

**Updated:** 2026-08-08, after PR #18.

Where the project actually is. Update this at the end of any pull request that
changes the answer to "what exists" or "what is next".

**New session? Read in this order:**

1. `CLAUDE.md` — the rules.
2. `docs/DECISIONS.md` — why the rules are what they are, and what has already
   been tried and disproven. Read the **Superseded** section before proposing
   any optimisation.
3. This file — what exists, what is next, what is blocked on the operator.
4. `docs/VERIFICATION.md` — how the operator independently checks the arithmetic.

---

## Status

| | |
|---|---|
| Live? | **No.** Nothing is deployed. The domain does not resolve to this site. |
| Pages built | 13 (12 substantive — `/404` is not) |
| Working calculators | 2 |
| Tests | 136 passing |
| CI gates | typecheck · vitest · secret scan · JS byte budget · internal links + indexability · prose spacing · STATE.md counts · island prose slots · structured data |
| Worst-page JS | 17.51 KB of 18 KB (0.49 KB spare) |
| Content pages JS | 0.53 KB (inline theme script only) |

---

## What exists

**Calculators**

- `/finance/debt-payoff-calculator` — avalanche vs snowball vs minimums-only.
  Debt entry, chart, full schedule, CSV, printable PDF, shareable URL.
- `/finance/coast-fire-calculator` — coast number, year-by-year projection,
  three-series chart, CSV, printable PDF, shareable URL.

Both complete under rule 8, and both carry an optional name for the printed
report (local-only — never in the URL, never persisted).

**Content and trust**

`/` · `/finance` (cluster hub) · `/methodology` · `/verify` ·
`/credit-card-interest` · `/monthly-return-rate` · `/about` ·
`/privacy` · `/terms` · `/contact` · `/404`

**Engines** (`src/lib/calc/`) — `money.ts`, `debt-payoff.ts`, `coast-fire.ts`.
Pure, no DOM, no framework. Fixtures anchored to published figures (D7).

**Shared UI** — `LineChart.tsx` (hand-rolled reactive SVG), `ScheduleTable.tsx`,
`lib/csv.ts`, `lib/params.ts`, `lib/url-state.ts`.

**Ornament** (`src/components/ornament/`) — `Guilloche.astro` (lens, behind
headings), `Rosette.astro` (radial medallion, legible down to 28px),
`LatheBand.astro` (tiled braided wave), `NoteFrame.astro` (double rule +
corner rosettes), `TrustStrip.astro` (three checkable facts above a tool),
`ProofChart.astro` (a real payoff curve, computed at build time by the engine
itself), `Rule.astro`. Build-time SVG, zero JavaScript, `currentColor`.
The banknote identity is applied site-wide through `BaseLayout` (D29), not page
by page as it was under D25. The masthead and footer are bands of dark ink with
their own token set, ruled in brand (D30).

**Gates** (`scripts/`) — `check-js-budget.mjs` (per-page module graph *and*
inline scripts), `check-links.mjs` (every internal href resolves; indexability
invariant), `check-spacing.mjs` (missing spaces in rendered prose),
`check-state.mjs` (the counts in this file match the build),
`check-slots.mjs` (every prose slot an island declares reaches its page),
`check-schema.mjs` (Organization + Person + WebSite on every page, breadcrumbs,
WebApplication on tool pages).

Every gate has been deliberately broken once to prove it exits non-zero. A gate
that has never failed is not a gate.

---

## Blocked on the operator

Nothing in code depends on these, but launch does.

1. **Create `hello@quickoper.com`.** Published on three pages and in structured
   data. Hostinger mail is already in the DNS zone, so this is a mailbox to
   create, not infrastructure to build. An address that bounces is worse than
   none, and AdSense checks the contact route works. Change it in one place if
   preferred: `SITE.email` in `src/lib/site.ts`.

2. **Cloudflare DNS migration.** The domain carries **live email** — MX, SPF,
   DMARC and three DKIM CNAMEs. Recreate every one in Cloudflare *before*
   switching nameservers, and test mail end-to-end as a gate before anything
   else. Records and the full procedure: `docs/DNS.md`. That file used to say
   "the project charter §13", which is not in this repository — the values are
   now here, flagged as operator-supplied and unverified against the zone.

3. **Search Console** verification and sitemap submission, once the domain
   resolves.

4. **One 1200x630 PNG at `public/og.png`**, then flip `twitter:card` back to
   `summary_large_image` in `BaseLayout`. The card claimed a large image and
   supplied none for the whole project (D31); it is now honestly `summary`.
   Generating one at build time would mean satori or sharp, a dependency
   against rule 4 for a social preview — a hand-made file is cheaper.

5. **Run `docs/VERIFICATION.md`** — five spreadsheet checks and one at
   investor.gov, ten minutes. Do this
   before launch so "an AI wrote this" becomes a documented verification rather
   than a worry.

---

## Next

Ordered, and the order changed on 2026-08-08. **Content now outranks tool 3.**
Nothing monetises until AdSense clears, and that needs 15 substantive pages:
the build produces 13 pages, of which 12 are substantive, so three more needed.
Content pages ship 0.53KB and need no budget work at all. Tool 3 is one page and
a pile of engineering.

1. **Three more content pages**, each a derivation tied to a tool that already
   exists, not filler to hit a threshold:
   - why a payoff date differs from the one on a statement (Reg Z Appendix M1
     and its two-month tolerance)
   - where the 4% rule comes from (Bengen 1994, Trinity 1998) and what it does
     not say
   - what a coast number is and is not

   Each needs the thing CLAUDE.md demands and a model cannot fake: a worked
   example with real numbers, or a documented comparison against a named
   competitor. That is a handful of sessions, not one.
2. **Mortgage overpayment calculator.** Tool 3, first with market exposure (D20).
   Build its prose in slots from the first commit (D28). The risk is the
   **shared chunk**, which grows for every calculator page at once, not this
   page's own island. Do **not** deduplicate across islands (D23).
3. **Contrast checking in CI.** PR #9 shipped a real 4.15:1 regression and D29
   measured by hand again. Needs Playwright and a headless run — and it must
   resolve colours through a canvas, because `getComputedStyle` returns
   `oklch()` and parsing those three numbers as RGB silently reports nonsense.
4. **Affiliate plumbing** (`/go/*`) before there is anything to put in it.

---

## AdSense readiness

| Requirement | State |
|---|---|
| 15+ substantive pages | **12** — three to go |
| Privacy policy naming Google as an ad vendor | Written, marked as not yet live |
| Terms, about with named author, working contact | Done, pending the mailbox |
| Clear navigation, everything within two clicks | Done |
| Financial disclaimer on every calculator page | Done |
| Indexed with impressions registering | Blocked on launch |
| `ads.txt` | Needs a publisher ID — after approval |
| No placeholder pages or empty categories | Done |

Launch is **not** gated on AdSense. Indexing lag is the bottleneck on everything
downstream, and that clock does not start until the domain resolves.

---

## Open questions

- **How far the banknote treatment should reach inside a calculator.** D29 took
  it site-wide through the layout, and reframed the homepage as the face of a
  note. The islands themselves are still plain — deliberately, to avoid a
  conflict with the open PR that moves their prose into slots. Framing the
  result panels and the schedule is the obvious next step.
- **Whether `/finance`, `/about` and the trust pages want their own frame**, or
  whether the masthead and paper carry enough on their own.

**Closed:**

- Whether the identity should distinguish calculator pages from trust pages. It
  should not — every page here is a finance page (D3), and D29 applies it
  through the layout for exactly that reason.
- Whether the ornament should appear on more pages. Yes; D25's two-page scope
  was too quiet and is superseded by D29.

**Closed — do not re-propose:**

- Emailing reports to visitors. Rejected on privacy grounds (D21).
- Deduplicating shared UI across islands to save bytes. Measured twice, makes it
  worse (D23).
- Reclaiming `@preact/signals`. It is a dynamic import and already costs zero.

---

## Working agreement

- The agent owns branches, code, commits, pushes, PRs and CI. The operator owns
  the merge click.
- `CODEOWNERS` routes `src/lib/calc/`, `src/data/` and `tests/calc/` to the
  operator, because CI can prove code matches a fixture but not that the fixture
  matches reality.
- Branch protection is server-side with `enforce_admins: true`, so it binds the
  operator's account too — which is the point, since the agent authenticates
  with the operator's token.
- **Always sync `main` before branching.** PRs are squash-merged, so a branch cut
  from a previous feature branch diverges and conflicts. This has happened once
  (PR #6).
- **Verify in a browser, not only by the gates.** Several real defects — a wrong
  chart axis, a dead null-coalesce, a contrast failure, 49 missing spaces —
  passed every automated check and were found by looking at the rendered page.
