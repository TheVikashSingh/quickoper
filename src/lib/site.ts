/**
 * Site-wide constants.
 *
 * Build-time only — never imported by an island. These appear across the trust
 * pages, the structured data and the footer, and a contact address that differs
 * between two pages is the kind of small incoherence that costs trust on a site
 * whose entire pitch is carefulness.
 */

export const SITE = {
  name: 'QuickOper',
  url: 'https://quickoper.com',
  tagline: 'Calculators that show their working.',

  /**
   * Sits under the wordmark in the masthead.
   *
   * The name is a contraction of "quickly operate", and without saying so it
   * reads as an arbitrary coinage — which costs a little trust on a site whose
   * whole argument is that nothing here is arbitrary. One line is enough.
   *
   * It is NOT the value proposition and should not be asked to do that job:
   * a visitor deciding whether to stay reads the H1, not the strapline.
   */
  strapline: 'Quickly operate',

  /**
   * The author's own address, not a role address like `hello@`, and that is
   * deliberate (D44). This site's credibility rests on a named person being
   * answerable for the arithmetic — the Person entity in the structured data
   * exists for exactly that reason (D31). A role address is the anonymous
   * option, and anonymity is the thing the site argues against.
   *
   * It is a real, working mailbox on Hostinger. Publishing an address that
   * bounces is worse than publishing none, and AdSense checks the contact route.
   */
  email: 'vikash@quickoper.com',

  author: {
    name: 'Vikash Singh',
    github: 'https://github.com/TheVikashSingh',
  },

  repo: 'https://github.com/TheVikashSingh/quickoper',

  /** Bumped when the trust pages are substantively revised. */
  legalLastUpdated: '2026-08-07',
} as const;
