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

## Railway

1. Create a Railway project and add a PostgreSQL service.
2. Add this repository as an application service.
3. Set `DATABASE_URL` from the PostgreSQL service reference.
4. Set `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `PUBLIC_APP_URL`, and
   `MOLLIE_API_KEY`.
5. Deploy. `railway.toml` builds the app, applies migrations before deploy, and
   checks `/api/health`.

## Checks

```bash
npm run typecheck
npm run build
npm run security:check
```
