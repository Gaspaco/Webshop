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

For Google sign-in, create a Google OAuth web client and set
`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Add this authorized redirect URI:

```text
http://localhost:3000/api/auth/callback/google
```

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

The admin bulk-import page searches a PostgreSQL copy of YGOPRODeck rather
than calling the public API for every search. A selected card is added to the
shop as a private draft with one zero-stock variant per known set/rarity.

```bash
bun run db:sync:yugioh                 # reuse the cached snapshot when present
bun scripts/sync-ygoprodeck.ts --refresh       # intentionally download and sync a new snapshot
bun scripts/sync-ygoprodeck.ts --download-only # download once without changing the database
```

The raw snapshot is stored in `.cache/ygoprodeck/cards.json` and is excluded
from Git. YGOPRODeck remains the local source for searchable card facts,
prices, and known printings; new imports do not download its generic artwork.

#### Optional printing-specific images

The Yugipedia enrichment job can identify a curated scan for an exact set and
rarity while keeping YGOPRODeck as the source for card facts, prices, and set
printings. It is deliberately bounded, cached for 30 days, and throttled to
less than one request per second:

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

## Railway

1. Create a Railway project and add a PostgreSQL service.
2. Add this repository as an application service.
3. Set `DATABASE_URL` from the PostgreSQL service reference.
4. Set `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `PUBLIC_APP_URL`,
   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SMTP_HOST`, `SMTP_PORT`,
   `SMTP_USER`, `SMTP_PASS`, `AUTH_EMAIL_FROM`, and `MOLLIE_API_KEY`.
5. Deploy. `railway.toml` builds the app, applies migrations before deploy, and
   checks `/api/health`.

## Checks

```bash
npm run typecheck
npm run build
npm run security:check
```
