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
  legalLastUpdated: '2026-09-05',

  /**
   * The privacy policy's own date. It moved on its own for the Android app's
   * one-time purchase (machinist-calc-app roadmap 5.3), which changed nothing on
   * the other trust pages - so they keep `legalLastUpdated` rather than claim a
   * revision they did not have.
   */
  privacyLastUpdated: '2026-10-05',
} as const;

/**
 * The Android app, as every page on the site names it and links to it.
 *
 * The name is the Play listing's (machinist-calc-app `store/play/listing.md`,
 * decided 2026-10-07), so a search for it finds both. `live` is the one switch
 * for launch day (roadmap W7): false, and every mention says the app is built
 * but not yet on Google Play and links to /machining/app; true, and each links
 * to the Play listing instead, tagged with the page it came from. Set it only
 * once the listing is public: a link to a listing that is not live is a 404
 * on Google's side.
 */
export const APP = {
  name: 'CNC Calculator for Machinists',
  /** The Play build's ID: the listing lives at this address and no other. */
  packageId: 'com.quickoper.machinist',
  live: false,
} as const;

/**
 * The Play listing's address, tagged so the Play Console can tell which page
 * sent a visitor (roadmap W7).
 *
 * The UTM values go URL-encoded inside `referrer`, the form Google's own
 * example uses (developer.android.com, "User acquisition", Google Play Games
 * on PC: `...details?id=com.sample.package&referrer=utm_source%3Dsearch%26...`,
 * checked 2026-10-14). The Play Console's store listing reports filter by
 * "UTM source and campaign" (Play Console Help 9859173): the source is this
 * site, the campaign the page.
 */
export function playLink(campaign: string): string {
  if (!/^[a-z0-9-]+$/.test(campaign)) {
    throw new Error(
      `playLink: campaign "${campaign}" must be lowercase letters, digits and hyphens`,
    );
  }
  const referrer = `utm_source=quickoper&utm_medium=website&utm_campaign=${campaign}`;
  return `https://play.google.com/store/apps/details?id=${APP.packageId}&referrer=${encodeURIComponent(referrer)}`;
}
