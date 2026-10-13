"""
Writes tests/fixtures/convert-length-reference.csv and
tests/fixtures/convert-angle-reference.csv: lengths and angles worked with
exact fractions and 70-digit decimals, for `tests/calc/convert.test.ts` to
hold `src/lib/calc/convert.ts` against.

Independent of the TypeScript: Python's fractions module for lengths, and its
decimal module, with pi from the recipe in its own documentation, for angles.
Run with `python -I tests/fixtures/convert-reference.py` from the repository
root; the seed is fixed, so the files come out the same each time.

Lengths. Each row is a length as a person types it, in one unit, and what the
page must print: the length on the whole-nanometre grid (half to even), each
unit rounded once from that, half to even (mm and in to 4 places, thou and µm
to 1), and the nearest 64th, 32nd and 16th of an inch as a numerator, half to
even.

Angles. Each row is an angle as a person types it, in degrees (decimal, or
degrees minutes seconds) or in radians, and what the page must print: decimal
degrees to 6 places, radians to 8, and the angle as a whole count of
hundredths of an arc-second, each rounded once, half to even, from the exact
value.
"""

import csv
import random
from decimal import Decimal, ROUND_HALF_EVEN, getcontext
from fractions import Fraction

getcontext().prec = 70


def pi():
    getcontext().prec += 2
    three = Decimal(3)
    lasts, t, s, n, na, d, da = 0, three, 3, 1, 0, 0, 24
    while s != lasts:
        lasts = s
        n, na = n + na, na + 8
        d, da = d + da, da + 32
        t = (t * n) / d
        s += t
    getcontext().prec -= 2
    return +s


PI = pi()

NM_PER = {"mm": 1_000_000, "in": 25_400_000, "thou": 25_400, "um": 1_000}
STEP_NM = {"mm": 100, "in": 2_540, "thou": 2_540, "um": 100}
PLACES = {"mm": 4, "in": 4, "thou": 1, "um": 1}


def half_even(x: Fraction) -> int:
    """Half to even, to a whole number, exactly."""
    floor = x.numerator // x.denominator
    rest = x - floor
    if rest > Fraction(1, 2) or (rest == Fraction(1, 2) and floor % 2 == 1):
        return floor + 1
    return floor


def fixed(count: int, places: int) -> str:
    sign = "-" if count < 0 else ""
    count = abs(count)
    if places == 0:
        return f"{sign}{count}"
    unit = 10**places
    return f"{sign}{count // unit}.{count % unit:0{places}d}"


def typed_length(rng: random.Random, unit: str) -> tuple[str, Fraction]:
    """A length as typed, and its exact value in that unit."""
    if unit == "in" and rng.random() < 0.3:
        bottom = rng.choice([2, 4, 8, 16, 32, 64, 128, 3, 10, 7])
        top = rng.randrange(1, bottom)
        whole = rng.choice([0, 0, 1, 2, 12])
        if whole == 0:
            return f"{top}/{bottom}", Fraction(top, bottom)
        sep = rng.choice([" ", "-"])
        return f"{whole}{sep}{top}/{bottom}", whole + Fraction(top, bottom)
    places = rng.randrange(0, 8)
    top = {"mm": 2_000, "in": 80, "thou": 80_000, "um": 2_000_000}[unit]
    # Mostly small: a shop length is more often 6 mm than 1.6 m.
    return decimal_text(rng, max(1, top // rng.choice([1, 10, 100, 1000])), places)


def lengths(rng: random.Random, count: int):
    rows = []
    for _ in range(count):
        unit = rng.choice(list(NM_PER))
        text, value = typed_length(rng, unit)
        nm = half_even(value * NM_PER[unit])
        row = [unit, text, str(nm)]
        for u in ("mm", "in", "thou", "um"):
            row.append(fixed(half_even(Fraction(nm, STEP_NM[u])), PLACES[u]))
        for den in (64, 32, 16):
            row.append(str(half_even(Fraction(nm * den, NM_PER["in"]))))
        rows.append(row)
    return rows


def decimal_text(rng: random.Random, top: int, places: int) -> tuple[str, Fraction]:
    value = Fraction(rng.randrange(0, top * 10**places), 10**places)
    whole, rest = divmod(value.numerator * (10**places // value.denominator), 10**places)
    text = f"{whole}.{rest:0{places}d}" if places else f"{whole}"
    return text, value


def angles(rng: random.Random, count: int):
    rows = []
    for _ in range(count):
        kind = rng.choice(["decimal", "dms", "rad"])
        negative = rng.random() < 0.2
        if kind == "decimal":
            text, deg = decimal_text(rng, 3600, rng.randrange(0, 8))
            unit = "deg"
        elif kind == "dms":
            d = rng.randrange(0, 3600)
            m = rng.randrange(0, 60)
            s_text, s = decimal_text(rng, 60, rng.randrange(0, 4))
            form = rng.randrange(3)
            text = (
                f"{d} {m} {s_text}"
                if form == 0
                else f"{d}°{m}′{s_text}″"
                if form == 1
                else f"{d}d {m}m {s_text}s"
            )
            deg = d + Fraction(m, 60) + s / 3600
            unit = "deg"
        else:
            text, rad = decimal_text(rng, 62, rng.randrange(0, 10))
            unit = "rad"
        if negative:
            text = "-" + text
        if unit == "deg":
            deg_f = -deg if negative else deg
            deg_d = Decimal(deg_f.numerator) / Decimal(deg_f.denominator)
            rad_d = deg_d * PI / 180
            deg6 = fixed(half_even(deg_f * 10**6), 6)
            hundredths = half_even(deg_f * 360_000)
            rad8 = fixed(int((rad_d * 10**8).to_integral_value(ROUND_HALF_EVEN)), 8)
        else:
            rad_f = -rad if negative else rad
            rad_d = Decimal(rad_f.numerator) / Decimal(rad_f.denominator)
            deg_d = rad_d * 180 / PI
            if abs(deg_d) > 3600:
                continue
            deg6 = fixed(int((deg_d * 10**6).to_integral_value(ROUND_HALF_EVEN)), 6)
            hundredths = int((deg_d * 360_000).to_integral_value(ROUND_HALF_EVEN))
            rad8 = fixed(half_even(rad_f * 10**8), 8)
        rows.append([unit, text, deg6, rad8, str(hundredths)])
    return rows


def main():
    rng = random.Random(20261013)
    with open("tests/fixtures/convert-length-reference.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["unit", "typed", "nm", "mm", "in", "thou", "um", "n64", "n32", "n16"])
        w.writerows(lengths(rng, 3000))
    with open("tests/fixtures/convert-angle-reference.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["unit", "typed", "deg6", "rad8", "hundredths"])
        w.writerows(angles(rng, 3000))


if __name__ == "__main__":
    main()
