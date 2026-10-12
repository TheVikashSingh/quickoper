"""
Writes tests/fixtures/cone-reference.csv: cones worked to 60 significant
digits, for `tests/calc/cone.test.ts` to hold `src/lib/calc/cone.ts` against.

Independent of the TypeScript: Python's decimal module, with pi, sine and
cosine from the recipes in its own documentation, at 70 digits. Run with
`python tests/fixtures/cone-reference.py` from the repository root; the seed
is fixed, so the file comes out the same each time.

Each row is one cone and the four-decimal figure the page must print for it,
in millimetres and in inches, rounded once, half to even, from the exact
value:

    kind      depth: (outer - inner) / (2 tan(angle / 2))
              diameter: inner + 2 depth tan(angle / 2)
    a_nm      depth: the outer diameter; diameter: the inner diameter
    b_nm      depth: the inner diameter; diameter: the depth
"""

import csv
import random
from decimal import Decimal, ROUND_HALF_EVEN, getcontext

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


def cos(x):
    getcontext().prec += 2
    i, lasts, s, fact, num, sign = 0, 0, 1, 1, 1, 1
    while s != lasts:
        lasts = s
        i += 2
        fact *= i * (i - 1)
        num *= x * x
        sign *= -1
        s += num / fact * sign
    getcontext().prec -= 2
    return +s


def sin(x):
    getcontext().prec += 2
    i, lasts, s, fact, num, sign = 1, 0, x, 1, x, 1
    while s != lasts:
        lasts = s
        i += 2
        fact *= i * (i - 1)
        num *= x * x
        sign *= -1
        s += num / fact * sign
    getcontext().prec -= 2
    return +s


PI = pi()


def half_tan(angle_text):
    # tan 45° is exactly 1. The series would give 1 to 70 digits, not 1, and
    # a depth that is a true tie would then round by the noise.
    if Decimal(angle_text) == 90:
        return Decimal(1)
    half = Decimal(angle_text) / 2 * PI / 180
    return sin(half) / cos(half)


def shown(nm, step):
    """Whole display steps, rounded once, half to even, then the figure."""
    steps = (nm / step).quantize(Decimal(1), rounding=ROUND_HALF_EVEN)
    whole, frac = divmod(int(steps), 10_000)
    return f"{whole}.{frac:04d}"


def main():
    rng = random.Random(20261012)
    common = ['60', '82', '90', '100', '110', '118', '120', '135', '140', '142']
    rows = []
    for i in range(3000):
        angle = rng.choice(common) if i % 2 == 0 else f"{rng.uniform(1, 179):.2f}"
        t = half_tan(angle)
        # Half the lengths as typed on a page (whole micrometres or tenths of
        # a thou), half any whole number of nanometres up to 1 m.
        def a_length():
            if rng.random() < 0.5:
                return rng.choice([1_000, 2_540]) * rng.randint(1, 200_000)
            return rng.randint(1, 1_000_000_000)
        if i % 3 == 2:
            inner = rng.choice([0, a_length()])
            depth = a_length()
            exact = Decimal(inner) + 2 * Decimal(depth) * t
            rows.append(['diameter', angle, inner, depth, shown(exact, 100), shown(exact, 2540)])
        else:
            x, y = a_length(), rng.choice([0, a_length()])
            outer, inner = max(x, y), min(x, y)
            if outer == inner:
                continue
            exact = (Decimal(outer) - Decimal(inner)) / (2 * t)
            rows.append(['depth', angle, outer, inner, shown(exact, 100), shown(exact, 2540)])
    with open('tests/fixtures/cone-reference.csv', 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f, lineterminator='\n')
        w.writerow(['kind', 'angle', 'a_nm', 'b_nm', 'mm', 'in'])
        w.writerows(rows)
    print(len(rows), 'rows')


if __name__ == '__main__':
    main()
