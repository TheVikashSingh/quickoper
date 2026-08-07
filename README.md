# QuickOper

Verified-calculation tools for personal money decisions, at
[quickoper.com](https://quickoper.com).

Every calculation runs entirely in your browser. Nothing you type is transmitted, logged or
stored — there is no server to send it to.

## What this is

A small set of personal-finance calculators built around one idea: **show the work, and
prove the arithmetic**.

- **Verified arithmetic.** Every calculation lives in a pure, separately-tested function.
  Fixtures are checked against real published third-party schedules, not textbook formulas.
  The tests are in this repository and you are welcome to read them.
- **Privacy by construction.** Static site, no backend, no database, no accounts. Your
  numbers never leave your device.
- **Show the work.** Every result expands into the formula, the intermediate values, and a
  full period-by-period schedule you can export.

## What this is not

**We compute. We do not advise.** These tools do arithmetic and show their working. They do
not tell you what to do with your money, and nothing here is financial, tax or investment
advice.

The expertise claimed by this project is *computational*, not advisory: we are engineers who
do the arithmetic correctly and publish our tests.

## Stack

| | |
|---|---|
| Framework | Astro 7 — zero JavaScript by default |
| Islands | Preact (`compat`) — ~5KB, against React's ~45KB |
| Language | TypeScript, strict, plus `noUncheckedIndexedAccess` |
| Styling | Tailwind v4, CSS-first `@theme` tokens |
| Charts | Hand-rolled reactive SVG. No charting library. |
| Testing | Vitest over pure calculation modules |
| Hosting | Cloudflare Workers static assets |

**Client JavaScript budget: under 15KB gzipped per calculator page.** Article pages ship
zero. Enforced in CI as a byte-count assertion against the built output.

## Development

```bash
npm ci
npm run dev
```

| Command | Does |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the built output |
| `npm run test` | Vitest, calculation fixtures |
| `npm run typecheck` | `astro check` + `tsc --noEmit` |

## Contributing

This is a solo project and not open to feature contributions. **Corrections to the
mathematics are very welcome** — if a figure here disagrees with a real lender's schedule or
an official worked example, please open an issue with the source. That is the single most
useful thing anyone can contribute.

See [`CLAUDE.md`](CLAUDE.md) for the engineering contract this codebase is held to.

## Licence

The source is public for transparency and review — so that anyone can verify the arithmetic.
It is not licensed for reuse or redistribution. All rights reserved.
