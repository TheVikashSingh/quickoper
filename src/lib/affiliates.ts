/**
 * The affiliate partner registry — the single source of truth for rule 12.
 *
 * IT IS EMPTY, AND THAT IS THE POINT. The plan says to build this before there
 * is anything to put in it, because a disclosure convention and a redirect
 * indirection are five minutes now and a genuine problem to retrofit across a
 * grown site. Nothing here earns anything until there is traffic; the cost of
 * having it is zero and the cost of not having it is paid later, on every page
 * at once.
 *
 * ── How a link reaches a visitor ─────────────────────────────────────────────
 *
 *   1. A partner is added to AFFILIATES below.
 *   2. The matching line is added to `public/_redirects`.
 *   3. Pages link with <AffiliateLink partner="slug"> — never to the
 *      destination directly.
 *
 * Steps 1 and 2 must agree, and `scripts/check-deploy-config.mjs` fails the
 * build if they do not. Two files that have to say the same thing and no check
 * between them is exactly what shipped every page as a 307 (D46).
 *
 * ── Why the indirection exists at all ────────────────────────────────────────
 *
 * A raw outbound affiliate URL on the page means the tracking parameters are in
 * the markup, the destination cannot be changed without a rebuild of every page
 * that mentions it, and a dead programme becomes a dead link. `/go/<slug>` is
 * one line to change.
 *
 * ── Why there is still no backend ────────────────────────────────────────────
 *
 * The redirect is a `_redirects` line served by Cloudflare's static asset
 * handler at the edge. No Worker script, no `lib/ports/`, no request logging,
 * nothing stateful. CLAUDE.md permits a Worker route for this; it turns out not
 * to need one, which is strictly better — the site stays deployable anywhere as
 * a directory of files (D52).
 */

export interface AffiliatePartner {
  /** URL segment: /go/<slug>. Lower-case, hyphens, nothing else. */
  readonly slug: string;
  /** Shown to the reader. The real company name, never a euphemism. */
  readonly name: string;
  /** Destination, including whatever tracking the programme requires. */
  readonly url: string;
  /**
   * What the commercial relationship actually is, in plain words.
   *
   * Rendered in the disclosure. "We are paid a commission if you open an
   * account" is a disclosure; "we may receive compensation from our partners"
   * is a hedge, and the site does not do hedges.
   */
  readonly relationship: string;
}

export const AFFILIATES: readonly AffiliatePartner[] = [];

/** Lookup by slug. Returns undefined for an unknown partner. */
export function findPartner(slug: string): AffiliatePartner | undefined {
  return AFFILIATES.find((partner) => partner.slug === slug);
}

/** The path a page must link to for a given partner. Never the destination. */
export function goPath(slug: string): string {
  return `/go/${slug}`;
}
