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

## Before launch

Run all five spreadsheet checks and the investor.gov one. It takes ten minutes
and converts "an AI wrote this" from a worry into a documented, repeatable
verification you can point at — including on the methodology page, which is the
site's whole pitch.
