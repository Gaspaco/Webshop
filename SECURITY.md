# Security guide

## Dependency security

- Install dependencies only from `https://registry.npmjs.org/`.
- The `preinstall` script blocks installs when `NPM_CONFIG_REGISTRY` or `npm_config_registry` points somewhere else.
- Run `npm run security:check` before deploys and after dependency changes.
- `esbuild` is forced to `0.28.1`.
- `brace-expansion` is forced to `5.0.9`.

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
- SMTP host, port, user, password, and sender variables must be configured together.
- SMTP is restricted to TLS ports 465 or 587 and validates the provider certificate.
- Never log verification tokens, reset tokens, session cookies, passwords, or API keys.
- Never commit real Railway, Better Auth, Mollie, or database secrets.

## Account security

- Email verification is required automatically when SMTP is configured.
- Verification and password-reset links expire after one hour.
- New passwords must contain between 12 and 128 characters.
- Password resets revoke all existing sessions.
- Sessions expire after three days and refresh after twelve hours of activity.
- Auth rate limits are stored in PostgreSQL so restarts do not reset them.
- Railway's trusted `X-Real-IP` header is used for per-client rate limiting.
- Auth pages and APIs use private, no-store caching and a no-referrer policy.

## Database safety

- Use Drizzle query builders for database access.
- Do not build SQL by joining user input into strings.
- Drizzle and postgres-js bind values as query parameters. `prepare: false` does not disable parameter binding.
- Recalculate product prices, stock, shipping, and order totals on the server before creating a payment.
- Treat browser cart data as untrusted.

## Checkout and payment safety

- The current checkout validates and trims input before sending it to the server.
- Mollie checkout happens in a server route.
- The server creates the order, creates the Mollie payment, stores the payment ID, and verifies payment status using a webhook.
- Never trust a client-supplied total.
- Run the checks in `PENTEST_CHECKLIST.md` before using live Mollie keys.

## Contact-form safety

- Valid messages are stored in PostgreSQL before optional SMTP notification.
- The endpoint checks same-origin requests, JSON content type, and request size.
- Input is normalized, length-limited, and rejected when it contains control characters.
- A honeypot and database-backed per-address and per-email rate limits reduce automated spam.
- Message HTML is escaped and customer input cannot control the email subject format or sender.
- Only authenticated administrators can read, update, or permanently delete submissions.
- Contact messages should be removed when no longer needed for customer service.

## Deploy checklist

1. Set production env vars in Railway.
2. Configure authenticated SMTP and verify SPF, DKIM, and DMARC for the sending domain.
3. Run `npm run security:check`.
4. Run `npm run typecheck`.
5. Run `npm run build`.
6. Verify Snyk or GitHub dependency scanning is clean.
