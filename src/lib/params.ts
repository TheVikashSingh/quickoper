/**
 * URL parameter parsing for calculator islands (CLAUDE.md rule 11).
 *
 * ─── Why this is hand-rolled rather than Zod ────────────────────────────────
 *
 * Zod is excellent and stays in the project — for CONTENT frontmatter, where it
 * runs at build time and costs the visitor nothing. Importing it into an island
 * put 28.64 KB of client JavaScript on a page with a 15 KB budget, roughly
 * double, and the byte-budget gate caught it.
 *
 * What a calculator actually needs from a validator is: is this string a number,
 * is it in range, and if not, what is the default. That is thirty lines. Paying
 * a full schema library for it is the kind of dependency CLAUDE.md rule 4 exists
 * to refuse.
 *
 * ─── Security ───────────────────────────────────────────────────────────────
 *
 * Query parameters are attacker-controlled. Every value is range-checked before
 * use; a malformed parameter resets to its default and is never echoed back.
 * Values are rendered as text by Preact, never interpolated into markup.
 */

/**
 * Digits, optional single leading minus, optional single decimal part.
 *
 * Deliberately narrower than `Number()`, which accepts `''` (as 0), `'0x10'`,
 * `'1e5'` and `'Infinity'`. Each of those would produce a confident,
 * plausible-looking, wrong answer rather than an obvious failure.
 */
const NUMERIC = /^-?\d+(\.\d+)?$/;

export interface NumberSpec {
  readonly min: number;
  readonly max: number;
  /** Used when the parameter is absent or fails validation. */
  readonly fallback: number;
}

export type ParamSpec = Readonly<Record<string, NumberSpec>>;

export type ParamValues<S extends ParamSpec> = { readonly [K in keyof S]: number };

/** Parse one value. Returns null on any failure — never a coerced guess. */
export function parseNumber(raw: string | null, spec: NumberSpec): number | null {
  if (raw === null) return null;

  // Trimming a padded number is benign; an all-whitespace value must still fail
  // rather than collapsing to a valid zero.
  const trimmed = raw.trim();
  if (trimmed === '' || !NUMERIC.test(trimmed)) return null;

  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  if (value < spec.min || value > spec.max) return null;

  return value;
}

/** The default scenario for a spec. */
export function defaults<S extends ParamSpec>(spec: S): ParamValues<S> {
  const out: Record<string, number> = {};
  for (const [key, field] of Object.entries(spec)) out[key] = field.fallback;
  return out as ParamValues<S>;
}

/**
 * Parse a query string against a spec, falling back WHOLESALE on any failure.
 *
 * Wholesale, not per-field, and deliberately: a partially-applied state computes
 * a confident answer from half the user's inputs and half our defaults, which is
 * worse than plainly showing the default scenario.
 *
 * Unknown parameters are ignored rather than treated as failure, so a link
 * shared through anything that appends tracking parameters still restores.
 */
export function parseParams<S extends ParamSpec>(
  spec: S,
  search: string,
): ParamValues<S> {
  const params = new URLSearchParams(search);
  const out: Record<string, number> = {};

  for (const [key, field] of Object.entries(spec)) {
    const value = parseNumber(params.get(key), field);
    if (value === null) return defaults(spec);
    out[key] = value;
  }

  return out as ParamValues<S>;
}

/** Serialise state to a compact query string. */
export function encodeParams(state: Readonly<Record<string, number>>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(state)) params.set(key, String(value));
  return params.toString();
}
