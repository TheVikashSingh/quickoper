## What changed

<!-- One paragraph. What this PR does, not a file list. -->

## Trade-offs

<!-- Required by CLAUDE.md. What was considered and rejected, and why. -->

---

### Checklist

- [ ] No new npm dependency — or, if there is one: what it does and why hand-rolling is worse
- [ ] Nothing in `src/lib/calc/**` imports from `components/` or touches the DOM
- [ ] Every new exported calc function has a Vitest fixture with its source cited in a comment
- [ ] Rounding policy stated where money arithmetic was added or changed
- [ ] Client JS still under 15KB gzipped per calculator page
- [ ] No calculator input is transmitted, logged, or attached to an analytics event
- [ ] URL params are Zod-validated and rendered as text, never interpolated into markup

### If this adds or changes a calculation

- [ ] At least one fixture matches a **real published third-party schedule**, linked here:
- [ ] `lastVerified` and `sources[]` updated

### If this adds a jurisdiction variant

- [ ] The **rule** that differs is named and cited here:
- [ ] No `switch (country)` was introduced — the rules module registers against the contract
