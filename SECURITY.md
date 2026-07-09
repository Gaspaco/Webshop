# Security guide

## Dependency security

- Install dependencies only from `https://registry.npmjs.org/`.
- The `preinstall` script blocks installs when `NPM_CONFIG_REGISTRY` or `npm_config_registry` points somewhere else.
- Run `npm run security:check` before deploys and after dependency changes.
- `esbuild` is forced to `0.28.1`.
- `brace-expansion` is forced to `5.0.7`.

## Runtime headers

The app sets security headers in `app.config.ts`:

- Content Security Policy
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- Referrer policy
- Permissions policy
- Cross-origin opener and resource policies
- HSTS in production

## Secrets

- `BETTER_AUTH_SECRET` must be at least 48 characters.
- Production `BETTER_AUTH_URL` must use HTTPS.
- Never commit real Railway, Better Auth, Mollie, or database secrets.

## Database safety

- Use Drizzle query builders for database access.
- Do not build SQL by joining user input into strings.
- Recalculate product prices, stock, shipping, and order totals on the server before creating a payment.
- Treat browser cart data as untrusted.

## Checkout and payment safety

- The current checkout validates and trims input before sending it to the server.
- Mollie checkout happens in a server route.
- The server creates the order, creates the Mollie payment, stores the payment ID, and verifies payment status using a webhook.
- Never trust a client-supplied total.
- Run the checks in `PENTEST_CHECKLIST.md` before using live Mollie keys.

## Deploy checklist

1. Set production env vars in Railway.
2. Run `npm run security:check`.
3. Run `npm run typecheck`.
4. Run `npm run build`.
5. Verify Snyk or GitHub dependency scanning is clean.
