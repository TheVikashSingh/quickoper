# Project state

**Updated:** 2026-08-17, after PR #48.

Where the project actually is. Update this at the end of any pull request that
changes the answer to "what exists" or "what is next".

**New session? Read in this order:**

1. `CLAUDE.md` — the rules.
2. `docs/DECISIONS.md` — why the rules are what they are, and what has already
   been tried and disproven. Read the **Superseded** section before proposing
   any optimisation. **57 entries; the last fifteen (D43–D59) are the launch and
   everything it exposed** — read those before touching deploy config, contrast,
   or any page that states a computed figure in prose.
3. This file — what exists, what is next, what is blocked on the operator.
4. `docs/LOCAL.md` — how to run and check the site, **and this machine's tooling
   constraints**: `gh` is not on PATH, PowerShell 5.1 has no `&&`, never prefix
   with `cd … &&`, never write long `node -e` one-liners.
5. `docs/VERIFICATION.md` — how the operator independently checks the arithmetic.
6. `docs/DNS.md` — the launch runbook. Historical now, but it is where the
   registrar, zone and Cloudflare arrangement are written down.

---

## Status

| | |
|---|---|
| Live? | **Yes — `https://quickoper.com`, launched 2026-08-11.** Cloudflare Workers static assets, DNS on Cloudflare, registrar still Hostinger. |
| Pages built | 19 (18 substantive — `/404` is not) |
| Working calculators | 3 |
| Tests | 167 passing |
| CI gates | typecheck · vitest · secret scan · JS byte budget · internal links + indexability · prose spacing · STATE.md counts · island prose slots · structured data · deploy config |
| Worst-page JS | 18.51 KB of 19.5 KB (0.99 KB spare) |
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

**Derivations** — six pages, each tied to a tool that exists and each carrying
figures computed here rather than transcribed:
`/minimum-payments` · `/biweekly-mortgage-payments` · `/credit-card-interest` ·
`/monthly-return-rate` · `/withdrawal-rate` · `/coast-number`

**Engines** (`src/lib/calc/`) — `money.ts`, `debt-payoff.ts`, `coast-fire.ts`,
`mortgage.ts`. Pure, no DOM, no framework. Fixtures anchored to published
figures (D7) — the mortgage engine to calculator.net's own output, to the cent.

**Affiliate infrastructure** (D52) — `lib/affiliates.ts` (the registry, currently
**empty**), `public/_redirects` (edge 302s, no Worker and no backend),
`components/affiliate/AffiliateLink.astro` and `AffiliateDisclosure.astro`.
Rule 12 is enforced against the built HTML: known slug, `rel="sponsored
nofollow"`, disclosure above the link. Adding a partner means an entry in the
registry **and** a line in `_redirects` — the gate fails on either alone.

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
WebApplication on tool pages), `check-deploy-config.mjs` (the configuration
Cloudflare reads that no other gate sees: `public/_headers` parses and every rule
matches a real route (D45), and `wrangler.toml`'s `html_handling` agrees with
Astro's `trailingSlash` (D46) — both are consumed at deploy or request time,
which is after CI, so an error in either is a green pipeline and a broken site).

Every gate has been deliberately broken once to prove it exits non-zero. A gate
that has never failed is not a gate.

---

## Blocked on the operator

Nothing in code depends on these, but launch does.

1. ~~**Create a published mailbox.**~~ **Done.** `vikash@quickoper.com` exists on
   Hostinger Starter Business Email and receives. The site publishes the author's
   own address rather than a role address, deliberately (D44). One remaining
   operator action: send a message to it from an external account and reply back
   out, and keep the `Show original` headers as the pre-migration baseline —
   `docs/DNS.md` step 1.

2. ~~**Cloudflare DNS migration.**~~ **Done, 2026-08-11.** Nameservers moved
   Hostinger → Cloudflare, all ten records recreated, mail verified passing on
   both sides of the switch. Worker custom domains attached for the apex and
   `www`. `docs/DNS.md` is the runbook that was followed; D43, D45, D46 and D48
   record what it cost to learn.

3. ~~**Search Console.**~~ **Done.** The domain property survived the migration
   and `sitemap-index.xml` was submitted on 2026-08-11 — status Success, all 17
   URLs discovered. Six days of data are recorded in D60; the short version is 60
   impressions, 0 clicks, average position 66.9, five pages indexed, and every
   impression arriving at a single page.

   That application (`/dashboard`, `/tracker`, `/checklists`, `/pricing`,
   `/blog`) is gone. Launch was a **replacement**, so expect a 404 spike. It is
   correct behaviour and needs no redirects — none of that content has an
   equivalent here.

4. ~~**One 1200x630 PNG at `public/og.png`.**~~ **Done** (D51). Drawn by
   `scripts/og/generate.html` — a browser canvas, so no satori or sharp and no
   dependency against rule 4. The card type is now *derived* from whether the
   file exists rather than asserted, so the declaration cannot go back to
   claiming an image it does not have.

5. **Run `docs/VERIFICATION.md`** — five spreadsheet checks and one at
   investor.gov, ten minutes. It was written as a pre-launch task and launch
   happened without it, so it is now overdue rather than pending: the site is
   publicly claiming figures nobody outside this repository has checked.

6. ~~**Canonical hostname and scheme.**~~ **Done, 2026-08-17.** Both the apex and
   `www` were serving `200`, as was plain `http://` on each — four addresses for
   one site, against a crawl budget of one GoogleBot visit a day. Fixed with a
   Redirect Rule and *Always Use HTTPS* (D60). **Both are Cloudflare zone
   settings that no file in this repository can see**, so `docs/DNS.md` carries
   their exact values and the commands that prove them.

7. **AdSense.** Every criterion is now met, including the last one — indexed with
   impressions registering. The operator has deliberately deferred applying until
   there is more traffic. Recorded as a decision rather than an outstanding task.

---

## Next

**The content threshold is met.** The build produces 19 pages, of which 18 are
substantive. None more needed for AdSense.

**Launched 2026-08-11.** The site is live, deploys on merge, and carries the
affiliate plumbing and the share image. What is left is mostly waiting.

1. ~~**Launch.**~~ Done. ~~**Affiliate plumbing.**~~ Done (D52).
   ~~**`public/og.png`.**~~ Done (D51).
2. **Export Search Console data** once there is any, to `.gsc/` (gitignored),
   and tell the next session. **This is the first point in the project where
   keyword decisions stop being guesswork.** Every topic so far was chosen by
   what is provable from first principles (D2), not by what anybody searches —
   defensible, but not the same thing as targeting. Queries at position 8–20 are
   where a content edit realistically moves the needle.
3. **AdSense application**, once indexed with impressions registering. Seven of
   the plan's eight pre-application criteria are met; the outstanding one is
   impressions, which is time rather than work. `ads.txt` waits on a publisher
   ID that does not exist yet.
4. **Contrast checking in CI.** PR #9 shipped a real 4.15:1 regression, and D29,
   D30, D33, D50 and D54 each measured by hand again — six defects that every
   gate passed. Needs Playwright and a headless run, and it **must** resolve
   colours through a canvas: `getComputedStyle` returns `oklch()` in Chrome, and
   parsing those three numbers as RGB silently reports 1.29:1 for every element
   on the page. It must also **composite translucent layers over the page colour
   first** — D54 measured 1.06:1 on a panel that was actually 8.82:1, because a
   translucent fill on a bare canvas composites over transparent black.
5. **More derivation pages, not encyclopedia pages** (D57). The format that
   works here computes something and shows its working. "What is an FHA loan"
   is the most contested informational query class on the internet, resolves on
   the SERP most of the time, and carries none of this site's advantage.

~~**Blocked, not forgotten:** the Reg Z "two months" claim has never been
checked.~~ **Checked on 2026-08-12 and it is correct** (D56). Regulation Z
Appendix M1 (b)(5) states a repayment estimate "shall be considered accurate if
it is not more than 2 months above or below" the figure its own guidance
produces. Read at
[consumerfinance.gov/rules-policy/regulations/1026/m1](https://www.consumerfinance.gov/rules-policy/regulations/1026/m1/),
which is the regulation text published by the agency that administers it. Both
places the site made the claim now **quote** the regulation rather than
paraphrasing it. eCFR was the intended second source and bot-blocks automated
fetches; that is a gap in the check, not a disagreement between sources.

**Tools 4 and 5 are unassigned.** Three calculators exist. The original plan's
tool #5 (equity comp) was killed by rule B — neither operator nor agent can
verify its output. Any candidate must pass the same test: can someone with
high-school mathematics check our figure against a published third-party result?

---

## AdSense readiness

| Requirement | State |
|---|---|
| 15+ substantive pages | **18** — none to go |
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
calculators, seven derivation pages, five trust pages, 18 substantive pages, 172
tests, ten CI gates. **The site is live at `https://quickoper.com`** as of
2026-08-11 — Cloudflare Workers static assets, DNS on Cloudflare, registrar
still Hostinger, mail still Hostinger and verified working after the move.

Deploying before touching DNS found three defects nothing else could have
(D45, D46, D47), which is exactly what that ordering is for. Every one of them
would have been debugged against a live domain otherwise.

**What the next session should not do.** Not build tools 4 and 5 — they are
unassigned and any candidate must pass rule B first. Not write more content — the
threshold is met and further pages have no near-term purpose until Search Console
says which queries are landing. Not raise the JS budget again; 19.5KB has 0.99KB
of headroom and the next honest fix is structural (D10).

**What it should do.** Launch is done, and so are the operator items that were
outstanding at PR #46: the sitemap was submitted on 2026-08-11 (Success, 17 URLs
discovered), the Vercel account is retired, the `workers.dev` route is off, and
`public/og.png` exists (D51). What remains for the operator is running
`docs/VERIFICATION.md` and the AdSense application, which the operator has
deliberately deferred until there is more traffic. Neither is code.

**Search Console data now exists, and it is thin.** Six days in: 60 impressions,
0 clicks, average position 66.9, and **every impression from one page**
(D60). Five pages are indexed of seventeen. Every topic on this site was chosen
by what is provable from first principles (D2), never by what anyone searches;
that is defensible and it is not targeting. Queries landing at position 8–20 are
where a content edit actually moves something, and nothing here is close to that
band yet. The clock started on 2026-08-11.

**The one honest caveat to carry forward.** Every topic on this site was chosen by
what can be proved from first principles, not by search demand. That is
defensible and it is not the same as keyword targeting. Until Search Console data
exists, any claim about what will rank is inference.
