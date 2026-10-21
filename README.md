# My Little TCG Haven

SolidStart webshop foundation using TypeScript, SCSS, PostgreSQL, Drizzle,
Better Auth, TanStack Query/Table, Mollie, and Zod.

## Local setup

Requirements: Node.js 22+ and PostgreSQL.

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run dev
```

Set a unique `BETTER_AUTH_SECRET` of at least 48 characters in `.env`.
Use a Mollie test key (`test_...`) while developing.

## Database

The initial migration includes Better Auth tables plus products, variants,
categories, inventory movements, carts, wishlists, orders, payments, and bulk
import jobs.

```bash
npm run db:generate  # generate a migration after schema changes
npm run db:migrate   # apply pending migrations
npm run db:studio    # open Drizzle Studio
```

Schema: `src/db/schema.ts`

### Administrator setup

Run `bun run admin:create owner@example.com "Owner name"` in a terminal.
The script asks for a password twice with input hidden. It never accepts a
password as a command-line argument. For automation, use `--password-stdin`
and pipe one password line from your secret manager; do not type a password
into a shell command. Existing accounts have their password reset, admin access
enabled, and sessions revoked, so only run this when you intend those changes.

### Password and recovery protection

Password sign-in retains its per-IP limit and also allows at most ten attempts
per normalized account email before a 15-minute cooldown. Successful sign-in
clears that account counter. The limits apply to both customer and owner
accounts, without requiring two-factor authentication for owners.

Reset emails are limited independently of client IP: one per recipient per
minute, three per recipient per hour, thirty across the shop per hour, and two
hundred per UTC day. Suppressed, unknown-recipient, busy, and SMTP-failure
requests receive the same generic response. Suppressed/unsent tokens are
discarded; tokens, passwords and recipient emails are not logged by these
controls. Counter identities are hashed.

Reset-link issuance, resets, normal password changes and the admin setup script
share a per-account database lease. A valid reset revokes all other outstanding
reset links before the password write, and a normal password change revokes all
reset links after verifying the current password. The used reset link remains
one-time, and sessions are revoked on reset. Existing role and two-factor
settings are unchanged. If an unexpected server failure prevents releasing a
lease, it expires after 90 seconds. No additional migration is required.

### Guest returns, catalogue images, and card scanning

Signed-in customers can submit returns only for orders they own. Guests receive
a neutral response and must explicitly confirm a one-time email link before a
return is created. Links expire after 15 minutes, are stored as hashes in the
existing verification table, and are consumed transactionally. Resending replaces
the old link. Opening a link alone never creates a return. Pending requests retain
their original submission time when confirmed. Email challenges are limited per
order and across the shop; no refund or stock change happens automatically.

The public catalogue image endpoint serves only active products and variants
whose parent product is active. Responses are not cached so unpublishing takes
effect on the next request. Owners can still preview private images through the
authenticated admin image endpoint. This cannot revoke copies already downloaded
or independent external image URLs.

Google Vision scanning has shared, database-backed limits, in addition to the
per-visitor limits. Defaults are 20 provider attempts/minute, 200/day (UTC), and
two concurrent scans, including image processing. These optional server-only
variables can override the defaults:

```dotenv
CARD_SCAN_MINUTE_LIMIT=20
CARD_SCAN_DAILY_LIMIT=200
CARD_SCAN_MAX_CONCURRENT=2
```

Failed or timed-out provider calls still count towards the budget because they
may have been billed. Database outages fail closed; busy and limited responses
include `Retry-After`. These are application request caps, not a guarantee about
the provider bill; provider-side quotas should also be configured. No new
database migration is needed for these protections.

### Yu-Gi-Oh reference catalogue

The owner card library uses Yugipedia for card facts, English set lists, and
printing images. Apply migration `0017_yugipedia_cache` before enabling this
release. Successful lookups are cached in PostgreSQL for 30 days; empty results
for 10 minutes. The **Refresh from Yugipedia** button bypasses cached results
for the current query (limited to once per minute). No full-library crawl or
background polling runs automatically.

Imports create private drafts with zero stock. Refreshing reference data never
changes existing products, stock, prices, or uploaded photos. Yugipedia has no
market-price feed: missing prices are flagged for review, not invented. Existing
reference prices and owner-managed prices are retained.

```bash
bun run db:sync:yugioh --set="Chaos Origins"
bun run db:sync:yugioh --set="Chaos Origins" --refresh
bun run db:sync:yugioh --card="Dark Magician"
```

Requests identify the shop and contact email, batch pages, and use a shared
database lease to stay below one API request per second across server instances.
Provider throttling pauses further requests. Only Yugipedia HTTPS image hosts
are accepted, with bounded download sizes and no redirects. The old YGOPRODeck
route remains an alias for existing dashboard tabs, not a data source.

#### Optional printing-specific images

The separate, optional image-enrichment job can fill additional exact-printing
scans for existing reference cards. It is deliberately bounded, cached for 30
days, and throttled to less than one request per second. Do not run the separate
legacy enrichment script concurrently with a library refresh:

```bash
bun run db:sync:yugioh-images --card="Dark Magician" --limit=1
bun run db:sync:yugioh-images --set="Rarity Collection 5" --limit=20
bun run db:sync:yugioh-images --catalogue --limit=500
bun run db:sync:yugioh-images --catalogue --offset=250 --limit=250
```

Matched images are exposed through a validated same-origin route and cached at
the CDN for 30 days. The sync also updates matching existing catalogue products
and variants. The storefront never receives a Yugipedia source URL, and
ambiguous set/rarity matches are skipped rather than guessed.

Both public Yugipedia image routes share a 240-download/minute origin budget
and a 16-download concurrency limit across server instances. Requests from one
client are limited to 180/minute at the origin. Duplicate downloads are combined
within an instance and locked across instances; temporary failures return
`Retry-After` and are never cached. Image bodies are streamed with enforced
size limits (2 MB for card previews, 12 MB for printing scans), a timeout, an
exact HTTPS host allowlist, and redirects disabled. Cached CDN hits do not
consume the origin download budget.

Permanent optimized object storage is optional. To convert matched scans to
WebP and upload them to the shop's R2 bucket, first obtain permission covering
commercial use, rehosting, and image optimization. Then configure the R2
variables, set `YUGIPEDIA_IMAGE_USE_AUTHORIZED=true`, and add `--upload`:

```bash
bun run db:sync:yugioh-images --set="Rarity Collection 5" --limit=20 --upload
```

When R2 is configured, the importer prefers the owner-controlled R2 URL. When
it is not, it uses the same-origin cached route. Products for which Yugipedia
has no exact scan keep their existing manually managed image.

### Digimon and Riftbound catalogue imports

The owner dashboard can search DigimonCard and Scrydex, then save selected
cards to PostgreSQL as private, zero-stock drafts. Customer-facing pages never
call either provider. DigimonCard requests are throttled below the provider's
published limit, while Scrydex responses are cached in the server process for
six hours.

DigimonCard does not allow its images to be hotlinked, so Digimon drafts need
an owner-hosted image before publication. Riftbound uses the image URL returned
by Scrydex and keeps variant-specific artwork where available. Configure these
server-only variables locally and in Railway to enable Riftbound search:

```bash
SCRYDEX_API_KEY=replace-with-scrydex-api-key
SCRYDEX_TEAM_ID=replace-with-scrydex-team-id
```

Scrydex prices that are not explicitly denominated in EUR are kept as reference
metadata; the shop price remains zero for manual review rather than treating a
USD value as euros.

### Cardmarket price files

The owner dashboard accepts Cardmarket product-catalogue and price-guide JSON
files. Variants store the exact Cardmarket `idProduct` and whether they use the
normal or foil price column. The importer previews every change and updates only
the selling price for exact ID matches; images, inventory, visibility, and
variant details are left unchanged. Automatic ID linking is deliberately
limited to globally unique Cardmarket names that match exactly one local
single-variant product. Ambiguous printings must be linked in the variant
editor instead of being guessed.

## Railway

1. Create a Railway project and add a PostgreSQL service.
2. Add this repository as an application service.
3. Set `DATABASE_URL` from the PostgreSQL service reference.
4. Set `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `PUBLIC_APP_URL`,
   `SMTP_HOST`, `SMTP_PORT`,
   `SMTP_USER`, `SMTP_PASS`, `AUTH_EMAIL_FROM`, and `MOLLIE_API_KEY`.
5. Deploy. `railway.toml` builds the app, applies migrations before deploy, and
   checks `/api/health`.

## Checks

```bash
npm run typecheck
npm run build
npm run security:check
```
