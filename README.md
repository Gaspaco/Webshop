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
