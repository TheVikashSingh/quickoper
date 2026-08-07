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

/** Pick a value from a fixed set, or fall back. Used for strategy toggles. */
export function parseEnum<T extends string>(
  raw: string | null,
  allowed: readonly T[],
  fallback: T,
): T {
  return raw !== null && (allowed as readonly string[]).includes(raw)
    ? (raw as T)
    : fallback;
}

// ── Debt lists ───────────────────────────────────────────────────────────────

export interface DebtParam {
  readonly balance: number;
  readonly rate: number;
  readonly minimum: number;
}

/** Hard cap. Bounds the work a crafted URL can make a browser do. */
export const MAX_DEBTS = 12;

const DEBT_FIELD_SEPARATOR = '-';
const DEBT_SEPARATOR = ',';

const BALANCE: NumberSpec = { min: 1, max: 10_000_000, fallback: 0 };
const RATE: NumberSpec = { min: 0, max: 200, fallback: 0 };
const MINIMUM: NumberSpec = { min: 0, max: 1_000_000, fallback: 0 };

/**
 * Encode debts as `balance-rate-minimum,balance-rate-minimum`.
 *
 * NAMES ARE DELIBERATELY NOT ENCODED.
 *
 * A shared link carrying "Barclaycard" or "Mum's loan" leaks something about
 * the person who shared it, to everyone who ever sees the URL — in a forum
 * post, a support ticket, a screenshot. The numbers are the useful part of a
 * shared scenario; the lender names are not. Restoring a link therefore
 * produces "Debt 1", "Debt 2", and the site can say plainly that sharing a
 * scenario shares the figures and never who you owe them to.
 */
export function encodeDebts(debts: readonly DebtParam[]): string {
  return debts
    .slice(0, MAX_DEBTS)
    .map((d) => [d.balance, d.rate, d.minimum].join(DEBT_FIELD_SEPARATOR))
    .join(DEBT_SEPARATOR);
}

/**
 * Parse an encoded debt list. Returns null on ANY malformation.
 *
 * Wholesale rejection, consistent with parseParams: a partially-recovered debt
 * list would compute a confident answer about debts the user does not have.
 */
export function parseDebts(raw: string | null): DebtParam[] | null {
  if (raw === null || raw.trim() === '') return null;

  const chunks = raw.split(DEBT_SEPARATOR);
  if (chunks.length === 0 || chunks.length > MAX_DEBTS) return null;

  const debts: DebtParam[] = [];

  for (const chunk of chunks) {
    const fields = chunk.split(DEBT_FIELD_SEPARATOR);
    if (fields.length !== 3) return null;

    const balance = parseNumber(fields[0] ?? null, BALANCE);
    const rate = parseNumber(fields[1] ?? null, RATE);
    const minimum = parseNumber(fields[2] ?? null, MINIMUM);
    if (balance === null || rate === null || minimum === null) return null;

    debts.push({ balance, rate, minimum });
  }

  return debts;
}
