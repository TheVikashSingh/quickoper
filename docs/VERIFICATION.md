# Verifying the numbers yourself

Written for the operator, who reasonably asked: *how do I know an AI-generated
codebase with no human reviewer produces correct figures?*

The honest answer is that you should not take anyone's word for it, including
mine. So here is how to check every published figure against tools that were
built by other people, decades ago, and are trusted by accountants worldwide.

Every check below takes under two minutes. Do them before launch, and again
whenever a calculation module changes.

---

## The best independent reference is a spreadsheet

Excel and Google Sheets ship the same set of financial functions — `PMT`,
`NPER`, `FV`, `PV`. They implement the standard formulas, they have been
scrutinised for thirty years, and they were not written by us or by any AI.
If our engine agrees with them, that is real evidence.

Open a blank sheet and paste these in.

### Debt payoff — the monthly payment

```
=PMT(0.06/12, 60, -10000)
```

**Expect `193.3280…`** — the $193.33 our test fixture uses for $10,000 at 6.00%
over 60 months.

### Debt payoff — the term

```
=NPER(0.06/12, -193.33, 10000)
```

**Expect `59.99…`**, i.e. 60 months. Our engine reports exactly 60. The fraction
below 60 exists because $193.33 is a rounded-up payment, which is also why our
final payment is $193.21 rather than the full amount.

### Debt payoff — the total interest

```
=193.33*60 - 10000
```

**Expect `1,599.80`.** Our engine reports **$1,599.68**, twelve cents lower,
because it charges the *reduced* final payment rather than a full one. Subtract
the $0.12 difference between $193.33 and $193.21 and the two agree exactly.

That is the kind of small discrepancy worth understanding rather than
explaining away — it has a specific cause, and if it were ever a different
number the cause would be something else.

### Coast FIRE — growth

```
=FV(0.07, 30, 0, -100000)
```

**Expect `761,225.50`.** Our `coastOnly` projection walks 360 monthly steps and
lands within **42 cents** of that figure. The gap is 360 successive roundings to
the cent — about five parts per billion.

### Coast FIRE — the coast number

```
=1000000/1.05^30
```

**Expect `231,377.45`.** That is exactly what the calculator shows for a
$1,000,000 target 30 years out at a 5% real return.

---

## A second, independent source

**investor.gov compound interest calculator** — run by the US Securities and
Exchange Commission, so it is about as disinterested a source as exists.

<https://www.investor.gov/financial-tools-calculators/calculators/compound-interest-calculator>

Enter $100,000 initial, $0 monthly, 30 years, 7% interest, compounded annually.
It should return **$761,225.50**. Same figure, third independent implementation.

---

## What to do when a figure disagrees

**Do not assume the calculator is right.** Do not assume the spreadsheet is
right either. Find out *why* they differ, because there is always a reason and
it is usually a stated assumption.

The three that account for nearly every discrepancy:

1. **Compounding convention.** Our debt tool divides the annual rate by twelve
   (how lenders quote APR); the investment tool uses `(1+r)^(1/12) − 1` (how a
   stated annual return actually compounds). Excel's `PMT` uses the first,
   `FV` the second. Comparing across the two will disagree, correctly.
2. **When rounding happens.** We round to the cent every period, as a statement
   does. Spreadsheets carry full precision to the end. Over 360 periods this
   produces cents of difference, never dollars.
3. **The final payment.** Ours is reduced to exactly what remains. Most
   closed-form answers assume every payment is identical.

If a difference is larger than a few cents and none of those three explain it,
that is a bug. Open an issue with the inputs.

---

## What this does and does not prove

**It proves** the arithmetic matches independent, long-established
implementations of the same formulas.

**It does not prove** the formula is the right one for a person's situation,
that the assumptions match their lender's contract, or that the projection will
resemble reality. Nothing can prove those, which is why every page states its
assumptions and why the site
[computes rather than advises](../CLAUDE.md).

## The structural safeguards

Beyond spot-checking, four things make a silently wrong figure unlikely:

- **The calculation is isolated.** `src/lib/calc/` has no DOM access and no
  framework. It can only be wrong arithmetically, not through a rendering
  accident.
- **Fixtures are anchored outside the codebase.** A test comparing our code to
  our own expectations proves self-consistency, not correctness. Each engine is
  checked against a published figure (D7 in `DECISIONS.md`).
- **Assertions are exact, not tolerant.** Two drafts used loose bounds that were
  50× wider than reality and would have absorbed a genuine regression.
- **`CODEOWNERS` routes every change under `src/lib/calc/` to a human merge.**
  CI can prove the code matches the fixture. It cannot prove the fixture matches
  reality — that is the merge click, and it is the reason for it.

## The run of 2026-09-10

Every check below was run and every one passed. Recorded here because a
verification document nobody has executed is a plan, not a verification.

**Read the two columns of provenance carefully — they are not equally strong.**

| # | Check | Expected | Got | Source of the "expected" |
|---|---|---|---|---|
| 1 | `PMT(0.06/12, 60, -10000)` | 193.3280… | **193.328015** | re-derived |
| 2 | `NPER(0.06/12, -193.33, 10000)` | 59.99… | **59.999282** | re-derived |
| 3 | `193.33*60 - 10000` | 1,599.80 | **1,599.80** | re-derived |
| 4 | `FV(0.07, 30, 0, -100000)` | 761,225.50 | **761,225.50** | re-derived |
| 5 | `1000000/1.05^30` | 231,377.45 | **231,377.45** | re-derived |
| 6 | **investor.gov compound interest calculator** | 761,225.50 | **761,225.50** | **third party (SEC)** |

And the engines, run on the same scenarios:

| Figure | Engine | Note |
|---|---|---|
| Months to clear $10,000 at 6% paying $193.33 | **60** | exactly, as the document predicts |
| Total interest | **$1,599.68** | 12 cents under the closed form |
| Final payment | **$193.21** | 12 cents under a full payment — the same 12 cents |
| $100,000 at 7% for 30 years | **$761,225.08** | 42 cents under the SEC figure |
| Coast number, $1,000,000 at 5% for 30 years | **$231,377.45** | exact |

Both documented discrepancies reproduce precisely. The twelve cents is the
difference between `$193.33` and `$193.21`; the forty-two cents is 360
successive roundings to the cent, about five parts per billion.

### What checks 1–5 do and do not prove

They were **re-derived from the standard definitions in a clean-room script that
imports nothing from this repository** — not typed into Excel. That makes them a
second independent implementation, which is worth something: it would catch a
transcription error, a wrong sign, or a misremembered formula.

It is **not** the check this document actually asks for. The value of the
spreadsheet version is that Excel's `PMT` was written by other people decades
ago and has been scrutinised since; a re-derivation shares an author with the
thing it is checking. **Running these five in a real spreadsheet is still worth
ten minutes**, and it remains the operator's to do.

### What check 6 proves, and it is the one that mattered

**D63 recorded that `coast-fire.ts` had no third-party anchor** — that rule 3
was satisfied by `mortgage.ts` alone, and that this module and
`debt-payoff.ts` were anchored to formulas, which cannot adjudicate a
convention.

The SEC's own calculator now supplies one. Run 2026-09-10 with $100,000 initial,
$0 monthly, 30 years, 7%, compounded Annually, it answered verbatim: *"In 30
years, you will have $761,225.50"* — and printed the ladder $100,000 → $107,000
→ $114,490 → $122,504.30, which confirms the compounding convention and not just
the total.

That figure is now cited as the anchor in `tests/calc/coast-fire.test.ts`,
replacing the formula that was there. **Two of three engines are externally
anchored.** `debt-payoff.ts` is still not, and that is the remaining gap.

## Before launch

Run all five spreadsheet checks and the investor.gov one. It takes ten minutes
and converts "an AI wrote this" from a worry into a documented, repeatable
verification you can point at — including on the methodology page, which is the
site's whole pitch.

**This was written before launch and run afterwards, on 2026-09-10** — see the
run above. The investor.gov check is done and its output is now a fixture's
cited source. The five spreadsheet checks have been re-derived but not yet done
in a spreadsheet, which is the part only a human with Excel or Sheets open can
actually close.
