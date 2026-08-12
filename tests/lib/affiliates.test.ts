import { describe, expect, it } from 'vitest';

import { AFFILIATES, findPartner, goPath } from '../../src/lib/affiliates';

/**
 * The registry is empty today, so most of these assert nothing yet — on
 * purpose. They are written now so that the first partner added is checked by
 * something other than whoever adds it, at the moment it is added rather than
 * after it has shipped on a live page.
 */
describe('affiliate registry', () => {
  it('has a well-formed slug for every partner', () => {
    for (const partner of AFFILIATES) {
      // The slug becomes a URL path segment and a _redirects key. Anything
      // needing encoding would mean the two files could not be compared as
      // plain strings.
      expect(partner.slug, `slug "${partner.slug}"`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('has unique slugs', () => {
    const slugs = AFFILIATES.map((partner) => partner.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('sends every partner to an https destination', () => {
    for (const partner of AFFILIATES) {
      // A redirect to http is a downgrade the visitor did not ask for, from a
      // site that sets HSTS on itself.
      expect(partner.url, `url for "${partner.slug}"`).toMatch(/^https:\/\//);
    }
  });

  it('states a real relationship rather than a hedge', () => {
    for (const partner of AFFILIATES) {
      expect(partner.name.trim().length, `name for "${partner.slug}"`).toBeGreaterThan(0);
      // "We may receive compensation" is what a site writes when it does not
      // want to be understood. A disclosure has to survive being read.
      expect(
        partner.relationship.trim().length,
        `relationship for "${partner.slug}"`,
      ).toBeGreaterThan(20);
    }
  });

  it('builds the /go/ path rather than the destination', () => {
    expect(goPath('example')).toBe('/go/example');
  });

  it('returns undefined for an unknown partner', () => {
    expect(findPartner('not-a-partner')).toBeUndefined();
  });
});
