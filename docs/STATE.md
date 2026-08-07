# Project state

**Updated:** 2026-08-07, after PR #9.

Where the project actually is. Update this at the end of any pull request that
changes the answer to "what exists" or "what is next".

If you are a new session: read `CLAUDE.md` first (the rules), then
`docs/DECISIONS.md` (why the rules are what they are), then this.

---

## Status

| | |
|---|---|
| Live? | **No.** Nothing is deployed. The domain does not resolve to this site. |
| Pages built | 11 |
| Working calculators | 2 |
| Tests | 136 passing |
| CI gates | typecheck · vitest · secret scan · JS byte budget · internal links |
| Worst-page JS | 17.82 KB of 18 KB (0.18 KB spare) |

---

## What exists

**Calculators**

- `/finance/debt-payoff-calculator` — avalanche vs snowball vs minimums-only.
  Debt entry, chart, full schedule, CSV, printable PDF, shareable URL.
- `/finance/coast-fire-calculator` — coast number, year-by-year projection,
  three-series chart, CSV, printable PDF, shareable URL.

Both complete under rule 7: tool, how-it-was-calculated disclosure, full
schedule, 800+ words of derivation, FAQ with structured data, cited sources,
disclaimer.

**Content and trust**

`/` · `/finance` (cluster hub) · `/methodology` · `/about` · `/privacy` ·
`/terms` · `/contact` · `/404`

**Engines** (`src/lib/calc/`) — `money.ts`, `debt-payoff.ts`, `coast-fire.ts`.
Pure, no DOM, no framework. Fixtures anchored to published figures (see D7).

**Shared UI** — `LineChart.tsx` (hand-rolled reactive SVG), `ScheduleTable.tsx`,
`lib/csv.ts`, `lib/params.ts`, `lib/url-state.ts`.

**Gates** — `scripts/check-js-budget.mjs` (per-page module graph *and* inline
scripts), `scripts/check-links.mjs` (every internal href must resolve).

---

## Blocked on the operator

Nothing in code depends on these, but launch does.

1. **Create `hello@quickoper.com`.** It is published on three pages and in
   structured data. Hostinger mail is already in the DNS zone, so this is a
   mailbox to create, not infrastructure to build. An address that bounces is
   worse than none, and AdSense checks the contact route works.
   Change it in one place if preferred: `SITE.email` in `src/lib/site.ts`.

2. **Cloudflare DNS migration.** The domain still carries **live email** — MX,
   SPF, DMARC and three DKIM CNAMEs. Recreate every one of them in Cloudflare
   *before* switching nameservers, and test mail end-to-end as a gate before
   doing anything else. The exact records are in the project charter §13.

3. **Search Console** verification and sitemap submission, once the domain
   resolves.

---

## Next

Ordered. Nothing here is started.

1. **Mortgage overpayment calculator.** Tool 3, and the first with market
   exposure — see D20. **This will breach the JS budget**; the intended fix is
   structural (`client:visible` for the below-fold chart and schedule), not
   another increment.
2. **Supporting content** to reach 15+ pages for AdSense. Four more needed.
3. **Contrast checking in CI.** PR #9 shipped a real 4.15:1 contrast regression
   that only manual measurement caught. Making it permanent needs Playwright and
   a headless run — worth doing, deliberately deferred rather than smuggled in.
4. **Affiliate plumbing** (`/go/*`) before there is anything to put in it, so
   nothing needs retrofitting.

---

## AdSense readiness

| Requirement | State |
|---|---|
| 15+ substantive pages | **11** — four to go |
| Privacy policy naming Google as an ad vendor | Written, marked as not yet live |
| Terms, about with named author, working contact | Done, pending the mailbox |
| Clear navigation, everything within two clicks | Done |
| Financial disclaimer on every calculator page | Done |
| Indexed with impressions registering | Blocked on launch |
| `ads.txt` | Needs a publisher ID — after approval |
| No placeholder pages or empty categories | Done |

Launch is **not** gated on AdSense. Indexing lag is the bottleneck on
everything downstream, and that clock does not start until the domain resolves.

---

## Open questions

- **Emailing a report to a visitor.** Requested, not built. It breaks the
  "nothing leaves your device" claim unless scoped to an explicit action, and an
  unprotected send endpoint is a spam relay that would poison the domain's mail
  reputation — including `hello@`. The cheap first version is to email a
  *scenario link* rather than a PDF attachment: no PDF library, no attachment
  size limits, and it doubles as list capture. Needs a decision before building.
- **Whether the money identity should distinguish calculator pages** from trust
  pages. Currently site-wide (D3).

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
- **Always sync `main` before branching.** PRs are squash-merged, so a branch
  cut from a previous feature branch diverges and conflicts. This has happened
  once (PR #6).
