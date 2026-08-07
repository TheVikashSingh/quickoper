# Project state

**Updated:** 2026-08-07, after PR #13.

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
| Pages built | 10 (9 substantive — `/404` is not) |
| Working calculators | 2 |
| Tests | 136 passing |
| CI gates | typecheck · vitest · secret scan · JS byte budget · internal links + indexability · prose spacing |
| Worst-page JS | 17.92 KB of 18 KB (0.08 KB spare) |
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

`/` · `/finance` (cluster hub) · `/methodology` · `/about` · `/privacy` ·
`/terms` · `/contact` · `/404`

**Engines** (`src/lib/calc/`) — `money.ts`, `debt-payoff.ts`, `coast-fire.ts`.
Pure, no DOM, no framework. Fixtures anchored to published figures (D7).

**Shared UI** — `LineChart.tsx` (hand-rolled reactive SVG), `ScheduleTable.tsx`,
`lib/csv.ts`, `lib/params.ts`, `lib/url-state.ts`.

**Ornament** (`src/components/ornament/`) — `Guilloche.astro`, `Rule.astro`.
Build-time SVG, zero JavaScript, `currentColor`.

**Gates** (`scripts/`) — `check-js-budget.mjs` (per-page module graph *and*
inline scripts), `check-links.mjs` (every internal href resolves; indexability
invariant), `check-spacing.mjs` (missing spaces in rendered prose).

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
   else. Exact records are in the project charter §13.

3. **Search Console** verification and sitemap submission, once the domain
   resolves.

4. **Run `docs/VERIFICATION.md`** — five spreadsheet checks and one at
   investor.gov, ten minutes. Do this
   before launch so "an AI wrote this" becomes a documented verification rather
   than a worry.

---

## Next

Ordered. Nothing here is started.

1. **Mortgage overpayment calculator.** Tool 3, and the first with market
   exposure — see D20. **This will breach the JS budget** (0.08 KB spare). The
   options, in order of preference: move static disclosure prose out of the
   island into the `.astro` page (real saving, better architecture); or revisit
   the number with the same discipline as D10. Do **not** deduplicate components
   across islands — that has been measured twice and makes it worse (D23).
2. **Supporting content** to reach 15+ pages for AdSense. Six more needed —
   the build produces 10 pages, of which 9 are substantive (`/404` is not).
3. **Contrast checking in CI.** PR #9 shipped a real 4.15:1 regression that only
   manual measurement caught. Needs Playwright and a headless run.
4. **Affiliate plumbing** (`/go/*`) before there is anything to put in it.
5. **Surface `docs/VERIFICATION.md` publicly.** A "check our arithmetic in your
   own spreadsheet" page is a genuine trust asset and fits the methodology pitch.

---

## AdSense readiness

| Requirement | State |
|---|---|
| 15+ substantive pages | **9** — six to go |
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

- **Whether the money identity should distinguish calculator pages** from trust
  pages. Currently site-wide (D3).
- **Whether the ornament should appear on more pages.** Currently the homepage
  and methodology only, deliberately sparing.

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
