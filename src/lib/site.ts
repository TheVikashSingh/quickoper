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
   * MUST exist before launch. The domain already carries Hostinger mail (MX,
   * SPF, DKIM), so this is a mailbox to create rather than infrastructure to
   * build — but publishing an address that bounces is worse than publishing
   * none, and AdSense checks that the contact route works.
   */
  email: 'hello@quickoper.com',

  author: {
    name: 'Vikash Singh',
    github: 'https://github.com/TheVikashSingh',
  },

  repo: 'https://github.com/TheVikashSingh/quickoper',

  /** Bumped when the trust pages are substantively revised. */
  legalLastUpdated: '2026-08-07',
} as const;
