# The launch runbook: Hostinger DNS to Cloudflare

`quickoper.com` is registered at Hostinger and carries **live email**. Moving DNS
to Cloudflare means recreating every mail record first. Miss one and mail breaks
quietly — no bounce you will see, no error, just messages that stop arriving,
often not noticed for days.

Hostinger stays the **registrar**. Only DNS moves. Cloudflare hosts the site.

---

## The one irreversible step

Everything in this procedure undoes in minutes. Nameservers switch back at
Hostinger. A Worker deploy is replaced by another deploy. A custom domain
detaches. The Hostinger zone stays in place as a rollback for as long as you
leave it there.

**The single unrecoverable failure is mail that bounces while the MX records are
wrong.** The message is gone, and the sender gets a rejection you never see.

So the ordering below exists to isolate that one risk: the site is deployed and
proven on a throwaway hostname *before* any DNS changes, and the Cloudflare zone
is queried directly *before* the world is pointed at it. By the time nameservers
move, both the site and the zone have already been verified.

---

## The records

**Verified against the live zone on 2026-08-09** by querying Google's resolver
(`8.8.8.8`) for every name below. All ten answers matched what is written here.

That verification found one defect, and it is worth stating because it is the
exact failure this file warns about: the `google-site-verification` token
previously recorded here carried a capital `I` (U+0049) at index 25 where the
zone has a lowercase `l` (U+006C). Visually identical in most fonts. Copying it
would have silently dropped Search Console verification.

**The authority is still the zone export from Hostinger**, taken immediately
before the migration. Export it first. If the export and this table disagree,
the export is right and this file is stale — fix this file.

### Recreate in Cloudflare *before* changing nameservers

| Type | Name | Value | Notes |
|---|---|---|---|
| MX | `@` | `mx1.hostinger.com` | priority 5, TTL 14400 |
| MX | `@` | `mx2.hostinger.com` | priority 10, TTL 14400 |
| TXT | `@` | `v=spf1 include:_spf.mail.hostinger.com ~all` | TTL 3600 |
| TXT | `_dmarc` | `v=DMARC1; p=none` | TTL 3600 |
| CNAME | `hostingermail-a._domainkey` | `hostingermail-a.dkim.mail.hostinger.com` | TTL 300, **DNS-only** |
| CNAME | `hostingermail-b._domainkey` | `hostingermail-b.dkim.mail.hostinger.com` | TTL 300, **DNS-only** |
| CNAME | `hostingermail-c._domainkey` | `hostingermail-c.dkim.mail.hostinger.com` | TTL 300, **DNS-only** |
| CNAME | `autodiscover` | `autodiscover.mail.hostinger.com` | TTL 300, **DNS-only** |
| CNAME | `autoconfig` | `autoconfig.mail.hostinger.com` | TTL 300, **DNS-only** |
| TXT | `@` | `google-site-verification=QrWqvXMiSI_pmA5-aYVgZ6bsYl1PZHVxcbekLA4NO8I` | Search Console |

**DNS-only means the grey cloud, not the orange one.** A proxied CNAME answers
with Cloudflare's own addresses, so a DKIM lookup resolves to the wrong thing and
signing fails. Proxying is for the website; mail records must pass through
untouched.

### Do not recreate — these were the previous host

The apex served an unrelated earlier application from Vercel. That deployment is
being retired and nothing about it carries over.

| Type | Name | Value |
|---|---|---|
| A | `@` | `216.198.79.1` |
| CNAME | `www` | `b9782e7f2b1b3c9c.vercel-dns-017.com` |

Both are replaced automatically when the Worker custom domain is attached
(step 8). Do not create them by hand in Cloudflare.

**Delete them at step 8, not here — this was got wrong (D48).** Removing the old
address record before the Worker is attached leaves the name with *no answer*,
and every resolver that asks during that window caches the emptiness for the
zone's negative-cache TTL: **1800 seconds**. The site then stays dark for up to
half an hour after it is actually working, and the obvious reaction — detach and
re-attach the custom domain — restarts the clock while fixing nothing.

Leave them in place, DNS-only, until step 8 replaces them.

---

## Procedure

### 1. Baseline the mailbox, while DNS is still at Hostinger

`vikash@quickoper.com` already exists on Hostinger Starter Business Email and is
what the site publishes (D44). Nothing to create.

Test it *before* the migration. This is deliberate: it establishes a **known-good
baseline**, so that if mail breaks after the nameserver switch, the switch caused
it. Without the baseline, two possible causes are being debugged at once.

**Gate:** send a message to `vikash@quickoper.com` from an external account, and
reply from it back out. In Gmail, open the reply → ⋮ → **Show original** and
confirm `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`. Keep that screenshot. It is the
reference the post-migration test is compared against.

### 2. Export the live Hostinger zone

Hostinger → Domains → `quickoper.com` → DNS / Nameservers → export. Save it
outside the repository.

This is the rollback artefact and the authority for the table above. Do not skip
it because the table looks complete.

### 3. Deploy to Workers and prove the site on `workers.dev`

Before any DNS change. The site has never been deployed, and a first deploy
should not be debugged with the real domain pointed at it.

```
npx wrangler login
```

```
npm run verify
```

```
npx wrangler deploy
```

`wrangler` is not a project dependency and should not become one — it is a
deployment tool, not something the site imports. `npx` fetches it per invocation.

**Gate:** on the `quickoper.<subdomain>.workers.dev` URL —

- all three calculators load and compute
- `/finance/mortgage-overpayment-calculator` is reachable *and linked* from the
  homepage and `/finance` (D41)
- print preview on a calculator produces a **light** document (D33)
- the security headers from `public/_headers` are actually present:

```
curl -sI https://quickoper.SUBDOMAIN.workers.dev
```

Look for `strict-transport-security`, `x-content-type-options` and
`x-frame-options`. If they are absent, Workers static assets is not applying
`_headers` and that is worth resolving now rather than after cutover.

### 4. Add the zone to Cloudflare — do not switch nameservers yet

Cloudflare dashboard → Add a site → `quickoper.com` → Free plan. Cloudflare
scans and imports what it can find.

Review every record against the export. The scan is good but not exhaustive, and
it has no way to know which records matter. Add anything missing. Set every mail
record to **DNS-only**.

### 5. Query Cloudflare's nameservers directly — this is the pre-switch gate

Cloudflare assigns two nameservers. They will answer queries for the zone
*before* the registrar points anyone at them, which means the zone can be tested
in production conditions while Hostinger is still live.

This is stronger than reviewing the dashboard. A visual review confirms what was
typed; this confirms what will be **served**.

Replace `NAME.ns.cloudflare.com` with an assigned nameserver:

```
nslookup -type=MX quickoper.com NAME.ns.cloudflare.com
```

```
nslookup -type=TXT quickoper.com NAME.ns.cloudflare.com
```

```
nslookup -type=TXT _dmarc.quickoper.com NAME.ns.cloudflare.com
```

```
nslookup -type=CNAME hostingermail-a._domainkey.quickoper.com NAME.ns.cloudflare.com
```

Repeat the last one for `hostingermail-b`, `hostingermail-c`, `autodiscover`
and `autoconfig`.

**Gate:** every answer is byte-identical to what the live zone returns today.
Compare against the same query without the trailing nameserver argument, which
asks the current resolver:

```
nslookup -type=MX quickoper.com 8.8.8.8
```

Do not switch nameservers until this is clean. This gate is what converts the
irreversible step into a safe one.

### 6. Switch nameservers at Hostinger

Hostinger → Domains → `quickoper.com` → Nameservers → Change → Custom → enter
Cloudflare's two.

Registration stays at Hostinger. **Do not delete the Hostinger DNS zone** — it
is the rollback and it costs nothing to leave in place.

Cloudflare emails when the zone goes active. Usually under an hour, occasionally
up to 48.

### 7. Mail test — the gate that matters

Repeat step 1's test in both directions once the zone is active, including
`Show original` and the three `PASS` lines.

**Do not proceed until this passes.** If it fails, revert the nameservers at
Hostinger and diagnose with mail working. Reverting restores the previous state
completely, which is why the Vercel account is not closed until the end.

### 8. Attach the Worker custom domain

Cloudflare → Workers & Pages → `quickoper` → Settings → Domains & Routes → Add
custom domain → `quickoper.com`. Repeat for `www.quickoper.com`.

Cloudflare creates the records and issues the certificate — a few minutes,
occasionally fifteen.

Now delete the previous host's `A` and `www` records, if they are still there.
Doing it in this order means the name never has a moment with no answer (D48).

**Gate:** `https://quickoper.com` serves the site, `www` resolves, and the mail
test still passes. Attaching a custom domain does not touch MX, but confirming it
takes seconds.

**If the apex returns `NXDOMAIN` after this, do not detach anything.** Ask two
questions instead:

```
nslookup quickoper.com NAME.ns.cloudflare.com
```

```
curl -sS "https://dns.google/resolve?name=quickoper.com&type=A"
```

If Cloudflare's own nameserver has the record and a public resolver does not,
that is **negative caching**, not misconfiguration — wait for the TTL in the SOA
to expire (up to 1800s) and flush locally with `ipconfig /flushdns`. Changing
configuration at that point only restarts the clock.

This step is reversible: detach the custom domain and the site is off the
apex again.

### 9. Search Console

The domain property is already verified by the TXT record in the table above,
which is why that record's exact value matters.

- Confirm the `quickoper.com` property still shows verified.
- Submit `https://quickoper.com/sitemap-index.xml`.
- Remove the previous `/sitemap.xml` submission. It belonged to the retired
  application and will 404.
- Request indexing on `/`, `/finance`, and the three calculator pages.

**Expect a 404 spike.** The retired application had `/dashboard`, `/tracker`,
`/checklists`, `/reminders`, `/settings`, `/features`, `/pricing`, `/blog` and
`/changelog` indexed or crawled. Those URLs are gone by design. This is correct
behaviour, not a regression, and it does not need redirects — none of that
content has an equivalent here.

`/about` and `/contact` exist on both, with entirely different content. Google
will re-crawl and replace them.

### 10. Close Vercel — last

Only once the site is live on the apex, mail has passed twice, and Search Console
is verified. Until then it is a free rollback target.

Export anything from the retired project that is worth keeping before closing the
account; closing it removes the deployments and their source.

---

## Why the site's DNS moves at all

Cloudflare Workers static assets serve the site, and a Worker custom domain
requires the zone on Cloudflare. Nothing about the *mail* wants to move — it is
moving only because DNS is not separable from it. That is the whole risk of this
migration in one sentence, and it is why mail is a gate in two places rather than
an afterthought.
