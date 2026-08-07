# DNS records for the Cloudflare migration

`quickoper.com` is registered at Hostinger and carries **live email**. Moving DNS
to Cloudflare means recreating every mail record first. Miss one and mail breaks
quietly — no bounce you will see, no error, just messages that stop arriving,
often not noticed for days.

`docs/STATE.md` used to point at "the project charter §13" for this list. The
charter is not in the repository, so that reference resolved to nothing. This
file replaces it.

---

## Provenance — read before trusting the table

**These values were supplied by the operator, not read from the zone by anything
in this repository, and nothing here has verified them.** Treat the table as a
checklist to compare against the real export, not as the source of truth.

The authority is the **zone export from Hostinger**, taken immediately before the
migration. Export it first. If the export and this table disagree, the export is
right and this file is stale — fix this file.

That ordering is not pedantry. A DKIM CNAME differing by one character still
resolves, still looks correct in a dashboard, and silently fails signing.

---

## Recreate in Cloudflare *before* changing nameservers

| Type | Name | Value | Notes |
|---|---|---|---|
| MX | `@` | `mx1.hostinger.com` | priority 5, TTL 14400 |
| MX | `@` | `mx2.hostinger.com` | priority 10, TTL 14400 |
| TXT | `@` | `v=spf1 include:_spf.mail.hostinger.com ~all` | TTL 3600 |
| TXT | `_dmarc` | `v=DMARC1; p=none` | TTL 3600 |
| CNAME | `hostingermail-a._domainkey` | `hostingermail-a.dkim.mail.hostinger.com` | TTL 300 |
| CNAME | `hostingermail-b._domainkey` | `hostingermail-b.dkim.mail.hostinger.com` | TTL 300 |
| CNAME | `hostingermail-c._domainkey` | `hostingermail-c.dkim.mail.hostinger.com` | TTL 300 |
| CNAME | `autodiscover` | `autodiscover.mail.hostinger.com` | TTL 300 |
| CNAME | `autoconfig` | `autoconfig.mail.hostinger.com` | TTL 300 |
| TXT | `@` | `google-site-verification=QrWqvXMiSI_pmA5-aYVgZ6bsYI1PZHVxcbekLA4NO8I` | Search Console |

## Drop — these point at the previous host

Replaced by the Worker custom domain.

| Type | Name | Value |
|---|---|---|
| A | `@` | `216.198.79.1` |
| CNAME | `www` | `b9782e7f2b1b3c9c.vercel-dns-017.com` |

---

## Procedure

1. **Export the live Hostinger zone.** This is the rollback artefact and the
   authority. Do not skip it because the table above looks complete.
2. **Add the domain in Cloudflare.** Review the auto-imported zone against the
   export and add anything missing **before** touching nameservers. Cloudflare's
   import is good but not exhaustive, and it has no way to know what matters.
3. **Switch nameservers at Hostinger.** Registration stays there; only DNS moves.
4. **Send and receive a real email.** This is a **gate, not a step**. Do not
   proceed until it passes in both directions.
5. Only then: attach the Worker custom domain, confirm Search Console still
   verifies, submit the sitemap.

Step 4 exists because every other step is reversible in minutes and this one is
not: mail that bounces while the MX records are wrong is gone, and the sender
gets a failure you never see.

## Why the site's DNS moves at all

Cloudflare Workers static assets serve the site, and a Worker custom domain
needs the zone on Cloudflare. Nothing about the *mail* wants to move — it is
moving only because DNS is not separable from it. That is the whole risk of this
migration in one sentence, and it is why mail is the gate rather than an
afterthought.
