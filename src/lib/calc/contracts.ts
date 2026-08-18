/**
 * The jurisdiction contract (CLAUDE.md rule 13).
 *
 * Rule 13 forbids `switch (country)` anywhere and requires jurisdiction modules
 * to register against a contract declared here. Until now no jurisdiction
 * module existed, so this file did not either — it is written the moment the
 * first one needs it rather than speculatively (rule 7's reasoning applied to
 * architecture).
 *
 * WHAT THIS DELIBERATELY IS NOT. It is not a generic plugin system, and it does
 * not try to describe a "mortgage" abstractly across countries. That abstraction
 * would be wrong: a US fixed-rate loan and a UK fixed-period deal are different
 * products, not one product with a flag. D6 already records the trap — the same
 * word meaning different things is how a compounding convention gets silently
 * misapplied.
 *
 * What it does carry is the small set of facts every jurisdiction module must
 * declare about itself, so that no caller ever has to know a country code to
 * format a figure. That is the specific thing `switch (country)` would have been
 * used for.
 */

/** Presentation facts a jurisdiction fixes. Never arithmetic. */
export interface Jurisdiction {
  /** Stable lower-case identifier: 'us', 'uk'. */
  readonly id: string;
  /** Human label for a heading or a switcher. */
  readonly label: string;
  /** ISO 4217 code passed to Intl. */
  readonly currency: string;
  /** BCP 47 tag passed to Intl. */
  readonly locale: string;
}

export const US: Jurisdiction = {
  id: 'us',
  label: 'United States',
  currency: 'USD',
  locale: 'en-US',
};

export const UK: Jurisdiction = {
  id: 'uk',
  label: 'United Kingdom',
  currency: 'GBP',
  locale: 'en-GB',
};

/**
 * Every jurisdiction the site computes for.
 *
 * A module registers by being listed here. A caller resolves by id and reads
 * `currency`/`locale` off the result — it never branches on the id itself,
 * which is the whole point of rule 13.
 */
export const JURISDICTIONS: readonly Jurisdiction[] = [US, UK];

export function jurisdiction(id: string): Jurisdiction {
  const found = JURISDICTIONS.find((j) => j.id === id);
  if (found === undefined) {
    throw new Error(`Unknown jurisdiction '${id}'.`);
  }
  return found;
}
