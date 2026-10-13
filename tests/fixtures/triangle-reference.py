"""
Writes tests/fixtures/triangle-reference.csv: triangles solved to 60
significant digits, for `tests/calc/triangle.test.ts` to hold
`src/lib/calc/triangle.ts` against.

Independent of the TypeScript: Python's decimal module at 70 digits, with pi,
sine and cosine from the recipes in its own documentation and the inverse
functions by Newton's method from a floating-point start. Run with
`python -I tests/fixtures/triangle-reference.py` from the repository root; the
seed is fixed, so the file comes out the same each time.

A tie is a value exactly halfway between two shown figures, and only a
rational value can be one. The series give a rational value to 60 digits, not
exactly, so a value within 1e-40 of halfway is taken as exactly halfway
before it is rounded half to even. Nothing irrational comes that close.

Each row: the three sides in nanometres and the three angles as typed
(blank where unknown), then the number of triangles that fit and, for each,
a, b and c in millimetres, alpha, beta and gamma in degrees, and the area in
mm², each to four places.
"""

import csv
import math
import random
from decimal import Decimal, ROUND_FLOOR, getcontext

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
DEG = PI / 180


def sin_d(deg):
    return sin(deg * DEG)


def cos_d(deg):
    return cos(deg * DEG)


def acos_d(x):
    """Degrees whose cosine is x, by Newton's method from math.acos."""
    t = Decimal(math.acos(max(-1.0, min(1.0, float(x)))))
    for _ in range(8):
        t = t + (cos(t) - x) / sin(t)
    return t / DEG


def asin_d(x):
    t = Decimal(math.asin(max(-1.0, min(1.0, float(x)))))
    for _ in range(8):
        t = t - (sin(t) - x) / cos(t)
    return t / DEG


TIE = Decimal("1e-40")


def steps(value, step):
    """Half to even, to whole steps, with a near-tie taken as a tie."""
    x = value / step
    floor = x.to_integral_value(rounding=ROUND_FLOOR)
    rest = x - floor
    if abs(rest - Decimal("0.5")) < TIE:
        return int(floor) + (int(floor) % 2)
    return int(floor) + (1 if rest > Decimal("0.5") else 0)


def fixed(count, places=4):
    sign = "-" if count < 0 else ""
    count = abs(count)
    return f"{sign}{count // 10**places}.{count % 10**places:0{places}d}"


def shown(tri):
    sides, angles = tri
    a, b, c = sides
    area = a * b * sin_d(angles[2]) / 2
    return (
        [fixed(steps(s, Decimal(100))) for s in sides]
        + [fixed(steps(x, Decimal("0.0001"))) for x in angles]
        + [fixed(steps(area, Decimal(10) ** 8))]
    )


def solve(sides, angles):
    """Every triangle that fits, or [] if none does."""
    known_s = [i for i in range(3) if sides[i] is not None]
    known_a = [i for i in range(3) if angles[i] is not None]
    if len(known_a) == 2:
        k = next(i for i in range(3) if i not in known_a)
        ang = list(angles)
        ang[k] = 180 - ang[known_a[0]] - ang[known_a[1]]
        if ang[k] <= 0:
            return []
        i = known_s[0]
        s = [sides[i] * sin_d(ang[j]) / sin_d(ang[i]) for j in range(3)]
        s[i] = sides[i]
        return [(s, ang)]
    if len(known_a) == 0:
        a, b, c = sides
        if max(sides) * 2 >= a + b + c:
            return []
        A = acos_d((b * b + c * c - a * a) / (2 * b * c))
        B = acos_d((a * a + c * c - b * b) / (2 * a * c))
        return [(list(sides), [A, B, 180 - A - B])]
    g = known_a[0]
    p, q = [i for i in range(3) if i != g]
    theta = angles[g]
    if sides[g] is None:
        x, y = sides[p], sides[q]
        z = (x * x + y * y - 2 * x * y * cos_d(theta)).sqrt()
        s = [None] * 3
        s[g], s[p], s[q] = z, x, y
        ang = [None] * 3
        ang[g] = theta
        ang[p] = acos_d((y * y + z * z - x * x) / (2 * y * z))
        ang[q] = 180 - theta - ang[p]
        return [(s, ang)]
    t_idx = p if sides[p] is not None else q
    u_idx = q if t_idx == p else p
    s_len, t_len = sides[g], sides[t_idx]
    sine = t_len * sin_d(theta) / s_len
    if sine > 1 + TIE:
        return []
    out = []
    if abs(sine - 1) < TIE:
        candidates = [Decimal(90)]
    else:
        t1 = asin_d(sine)
        candidates = [t1, 180 - t1]
    for T in candidates:
        U = 180 - theta - T
        if U <= TIE:
            continue
        s = [None] * 3
        s[g], s[t_idx] = s_len, t_len
        s[u_idx] = s_len * sin_d(U) / sin_d(theta)
        ang = [None] * 3
        ang[g], ang[t_idx], ang[u_idx] = theta, T, U
        out.append((s, ang))
    return out


SPECIAL = [30, 45, 60, 90, 120, 150]


def angle(rng):
    if rng.random() < 0.3:
        return str(rng.choice(SPECIAL))
    places = rng.randrange(0, 5)
    v = rng.randrange(1, 179 * 10**places) if places else rng.randrange(1, 179)
    return str(v) if places == 0 else f"{v // 10**places}.{v % 10**places:0{places}d}"


def side(rng):
    return rng.randrange(1, 10 ** rng.choice([5, 6, 7, 8, 9]))


def random_case(rng):
    kind = rng.choice(["SSS", "SAS", "ASA", "AAS", "SSA", "SSA"])
    sides = [None] * 3
    angles = [None] * 3
    if kind == "SSS":
        a, b = side(rng), side(rng)
        # Mostly a triangle that closes; now and then one that does not.
        lo, hi = abs(a - b), a + b
        sides = [a, b, rng.randrange(lo + 1, hi) if rng.random() < 0.95 and hi - lo > 1 else hi]
    elif kind == "SAS":
        g = rng.randrange(3)
        angles[g] = angle(rng)
        for i in range(3):
            if i != g:
                sides[i] = side(rng)
    elif kind in ("ASA", "AAS"):
        k = rng.randrange(3)
        x, y = [i for i in range(3) if i != k]
        angles[x] = angle(rng)
        # The second angle mostly leaves room for a third.
        room = 180 - Decimal(angles[x])
        angles[y] = angle(rng) if rng.random() < 0.1 or room <= 1 else str(
            (room * Decimal(rng.randrange(1, 10_000)) / 10_000).quantize(Decimal("0.0001"))
        )
        sides[k if kind == "ASA" else rng.choice([i for i in range(3) if i != k])] = side(rng)
    else:
        g = rng.randrange(3)
        angles[g] = angle(rng)
        sides[g] = side(rng)
        t = rng.choice([i for i in range(3) if i != g])
        sides[t] = max(1, int(sides[g] * rng.uniform(0.3, 2.5)))
    return sides, angles


def tie_cases():
    """Triangles built to put a figure exactly halfway between two shown ones."""
    rows = []
    for k in range(1, 40):
        s = 20 * k + 10  # the hypotenuse 5s ends in 50 nm
        rows.append(([3 * s, 4 * s, None], [None, None, "90"]))
        rows.append(([None, 12 * s, 13 * s], [None, None, "90"]))  # a = 5s, by SSA at 90°
        c = 200 * k + 100  # a = c sin 30° ends in 50 nm
        rows.append(([None, None, c], ["30", None, "90"]))
        rows.append(([None, 2 * c, None], [None, "90", "60"]))
        a = 100 * k + 50  # equilateral by SAS at 60°
        rows.append(([a, a, None], [None, None, "60"]))
        rows.append(([15000 * (2 * k - 1), 20000 * (2 * k - 1), 25000 * (2 * k - 1)], [None, None, None]))
    return rows


def main():
    rng = random.Random(20261013)
    cases = tie_cases() + [random_case(rng) for _ in range(3000)]
    with open("tests/fixtures/triangle-reference.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["a_nm", "b_nm", "c_nm", "alpha", "beta", "gamma", "n", "first", "second"])
        for sides, angles in cases:
            ds = [Decimal(s) if s is not None else None for s in sides]
            da = [Decimal(a) if a is not None else None for a in angles]
            tris = solve(ds, da)
            row = [s if s is not None else "" for s in sides] + [a or "" for a in angles]
            row.append(str(len(tris)))
            for tri in tris[:2]:
                row.append(" ".join(shown(tri)))
            while len(row) < 9:
                row.append("")
            w.writerow(row)


if __name__ == "__main__":
    main()
