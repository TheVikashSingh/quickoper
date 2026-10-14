import { describe, expect, it } from 'vitest';
import { APP, playLink } from '../../src/lib/site';

/**
 * The tagged link to the app's Play listing (roadmap W7).
 *
 * The form is Google's own example (developer.android.com, "User acquisition"
 * for Google Play Games on PC, checked 2026-10-14):
 * `https://play.google.com/store/apps/details?id=com.sample.package&referrer=utm_source%3Dsearch%26utm_medium%3Dcpc%26utm_campaign%3Dsummerpromo`
 * — the UTM values URL-encoded inside `referrer`, which must be 512
 * characters or less.
 */
describe('playLink', () => {
  it('points at the Play build’s own listing, tagged with the site and the page', () => {
    expect(playLink('tap-drill-calculator')).toBe(
      'https://play.google.com/store/apps/details?id=com.quickoper.machinist&referrer=utm_source%3Dquickoper%26utm_medium%3Dwebsite%26utm_campaign%3Dtap-drill-calculator',
    );
  });

  it('reads back as the three UTM values, inside a referrer under 512 characters', () => {
    const url = new URL(playLink('machining-hub'));
    expect(url.searchParams.get('id')).toBe(APP.packageId);
    const referrer = url.searchParams.get('referrer') ?? '';
    expect(referrer.length).toBeLessThanOrEqual(512);
    expect(Object.fromEntries(new URLSearchParams(referrer))).toEqual({
      utm_source: 'quickoper',
      utm_medium: 'website',
      utm_campaign: 'machining-hub',
    });
  });

  it('refuses a campaign that would need encoding of its own', () => {
    expect(() => playLink('Tap Drill')).toThrow('lowercase letters, digits and hyphens');
    expect(() => playLink('a&b')).toThrow();
  });

  it('is not live until the listing is public', () => {
    // Flipped on launch day only (docs/STATE.md, "Launch day"); a test that
    // fails then is a reminder to update llms.txt and the decision record too.
    expect(APP.live).toBe(false);
  });
});
