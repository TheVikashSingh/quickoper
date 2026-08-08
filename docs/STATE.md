# Project state

**Updated:** 2026-08-08, after PR #29.

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
| Live? | **No.** Nothing is deployed. The apex still serves an unrelated Vercel app, being retired at launch. |
| Pages built | 16 (15 substantive — `/404` is not) |
| Working calculators | 3 |
| Tests | 153 passing |
| CI gates | typecheck · vitest · secret scan · JS byte budget · internal links + indexability · prose spacing · STATE.md counts · island prose slots · structured data |
| Worst-page JS | 18.27 KB of 19.5 KB (1.23 KB spare) |
| Content pages JS | 0.53 KB (inline theme script only); homepage 12.81 KB — it carries an island (D34) |

---

## What exists

**Calculators**

- `/finance/debt-payoff-calculator` — avalanche vs snowball vs minimums-only.
  Debt entry, chart, full schedule, CSV, printable PDF, shareable URL.
- `/finance/coast-fire-calculator` — coast number, year-by-year projection,
  three-series chart, CSV, printable PDF, shareable URL.
- `/finance/mortgage-overpayment-calculator` — what an extra monthly payment
  removes, baseline vs overpaid chart, full schedule, CSV, printable PDF,
  shareable URL. Payment anchored to calculator.net's published figure (D39).

Plus **`QuickCost`** on the homepage — a three-input teaser using the real debt
engine, handing off to the full tool with the figures pre-filled (D34). It is
the only reason the homepage ships JavaScript.

All three complete under rule 8, and all carry an optional name for the printed
report (local-only — never in the URL, never persisted).

**Content and trust**

`/` · `/finance` (cluster hub) · `/methodology` · `/verify` · `/about` ·
`/privacy` · `/terms` · `/contact` · `/404`

**Derivations** — four pages, each tied to a tool that exists and each carrying
figures computed here rather than transcribed:
`/credit-card-interest` · `/monthly-return-rate` · `/withdrawal-rate` ·
`/coast-number`

**Engines** (`src/lib/calc/`) — `money.ts`, `debt-payoff.ts`, `coast-fire.ts`,
`mortgage.ts`. Pure, no DOM, no framework. Fixtures anchored to published
figures (D7) — the mortgage engine to calculator.net's own output, to the cent.

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
   switching nameservers, and test mail end-to-end as a gate on both sides of the
   switch. `docs/DNS.md` is the runbook, ordered so the site is deployed and
   proven on `workers.dev` before any DNS change. Its records were **verified
   against the live zone on 2026-08-09** — which found the Search Console token
   recorded there was wrong by one character (D43).

3. **Search Console** verification and sitemap submission, once the domain
   resolves. The domain property is already verified by a TXT record; carrying
   that record across the migration correctly is what keeps it verified.

   The apex currently serves an **unrelated earlier application** from Vercel
   (`/dashboard`, `/tracker`, `/checklists`, `/pricing`, `/blog`). Launch is a
   replacement, not a first appearance: expect a 404 spike, and expect the old
   `/sitemap.xml` submission to need removing. No redirects are warranted —
   none of that content has an equivalent here.

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

**The content threshold is met.**
The build produces 16 pages, of which 15 are substantive.
None more needed for AdSense. Every remaining blocker is on the
operator, not in the code — see the section above. **Nothing in this list is
worth doing before the domain resolves**, because indexing lag gates everything
downstream and that clock has not started.

1. **Launch.** Mailbox, then DNS (`docs/DNS.md`), then Search Console and the
   sitemap. This is the whole critical path and it is entirely operator work.
2. **Export Search Console data** once there is any, to `.gsc/` (gitignored),
   and tell the next session. **This is the first point in the project where
   keyword decisions stop being guesswork.** Every topic so far was chosen by
   what is provable from first principles (D2), not by what anybody searches —
   defensible, but not the same thing as targeting. Queries at position 8–20 are
   where a content edit realistically moves the needle.
3. **AdSense application**, once indexed with impressions registering.
4. **Contrast checking in CI.** PR #9 shipped a real 4.15:1 regression, and D29,
   D30 and D33 each measured by hand again — four defects that every gate passed.
   Needs Playwright and a headless run, and it **must** resolve colours through a
   canvas: `getComputedStyle` returns `oklch()` in Chrome, and parsing those
   three numbers as RGB silently reports 1.29:1 for every element on the page.
5. **Affiliate plumbing** (`/go/*`) before there is anything to put in it. This
   is where the vertical actually earns; AdSense at achievable traffic is a
   legitimacy checkbox more than a revenue line.
6. **One 1200×630 PNG at `public/og.png`**, then flip `twitter:card` back to
   `summary_large_image` (D31).

**Blocked, not forgotten:** a content page on why a payoff date differs from a
statement. The existing debt-payoff FAQ claims Reg Z Appendix M1 "permits a
margin of error of two months" — that claim predates this session's work and
**has never been checked against the regulation**. Verify it before building a
page on it, and correct the FAQ if it is wrong. On a site whose entire argument
is checkability, an unverified regulatory claim is the worst kind of debt.

**Tools 4 and 5 are unassigned.** Three calculators exist. The original plan's
tool #5 (equity comp) was killed by rule B — neither operator nor agent can
verify its output. Any candidate must pass the same test: can someone with
high-school mathematics check our figure against a published third-party result?

---

## AdSense readiness

| Requirement | State |
|---|---|
| 15+ substantive pages | **15** — none to go |
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
- **Always sync `main` before branching**, with `git checkout -b name origin/main`.
  PRs are squash-merged, so a branch cut from a previous feature branch carries a
  duplicate pre-squash commit and diverges. This has now happened **three times**
  (PRs #6, #23, #26). It is the single most repeated mistake in this project's
  history. The recovery is: re-cut from `origin/main`, cherry-pick your own
  commit, open a fresh PR, close the old one — never force-push.
- **Verify in a browser, not only by the gates.** Real defects that passed every
  automated check and were found only by looking: a wrong chart axis, a dead
  null-coalesce, four separate contrast failures, 49 missing spaces, slot
  paragraphs sitting flush, and a strategy toggle that was clickable and inert.
- **Do not prefix shell commands with `cd … &&`.** It makes every call a compound
  command that no permission pattern matches, so it prompts the operator every
  time. Use `git -C <path>` and `npm --prefix <path>`. Settings in
  `.claude/settings.json` are read at session start, so editing them mid-session
  changes nothing until a restart.
- **Do not write long `node -e "…"` one-liners.** Bash ate the quoting three
  times in one session — an apostrophe inside a template literal, a `$` read as a
  variable, and a backtick executed as a command substitution that injected a
  gate's own output into a documentation file. Write the script to a file, or use
  the file-edit tools.

---

## Handoff notes for a new session

Read `CLAUDE.md`, then `docs/DECISIONS.md` (including **Superseded**), then this
file. That is the whole context; the git history and PR bodies carry the detail.

**Where the project actually is.** Feature-complete for v1 content: three
calculators, four derivation pages, five trust pages, 15 substantive pages, 153
tests, nine CI gates. Nothing is deployed. The apex serves an unrelated earlier
application from Vercel, which is retired as part of launch.

**What the next session should not do.** Not build tools 4 and 5 — they are
unassigned and any candidate must pass rule B first. Not write more content — the
threshold is met and further pages have no near-term purpose until Search Console
says which queries are landing. Not raise the JS budget again; 19.5KB has 1.23KB
of headroom and the next honest fix is structural (D10).

**What it should do.** Help the operator through launch. `docs/DNS.md` is the
runbook and it is ordered deliberately: mailbox first (so the mail test has a
known-good baseline), zone export, **deploy to `workers.dev` and prove the site
before any DNS change**, recreate every mail record in Cloudflare, then query
Cloudflare's nameservers directly before switching — that query is what makes the
one irreversible step safe. Mail is a gate on both sides of the switch. The
custom domain, Search Console and retiring Vercel come last.

**The one honest caveat to carry forward.** Every topic on this site was chosen by
what can be proved from first principles, not by search demand. That is
defensible and it is not the same as keyword targeting. Until Search Console data
exists, any claim about what will rank is inference.
