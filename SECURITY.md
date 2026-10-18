# Security guide

## Dependency security

- Install dependencies only from `https://registry.npmjs.org/`.
- The `preinstall` script blocks installs when `NPM_CONFIG_REGISTRY` or `npm_config_registry` points somewhere else.
- Run `npm run security:check` before deploys and after dependency changes.
- `esbuild` is forced to `0.28.1`.
- `brace-expansion` is forced to `5.0.12`.

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
- New passwords must contain between 8 and 128 characters and satisfy the configured complexity rules.
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

## Durable order recovery (migration 0015)

Apply all pending Drizzle migrations (including 0014 and 0015) before deploying
the new server code. Do not run test migrations against the production database.

Required server-only deployment variables:

- `ORDER_RECOVERY_ENCRYPTION_KEY`: an independently generated random secret of
  at least 48 characters. Required for checkout. This encrypts the exact original
  payment request, including its guest access URL. Keep it stable while payment
  attempts are outstanding; it is deliberately independent of the login secret.
- `CRON_SECRET`: a separate random secret of at least 32 characters. Without it,
  `/api/jobs/order-recovery` returns 401 and scheduled recovery does not run.

Redeploy after configuring these variables. No real credentials belong in this
document or `.env.example`.

`vercel.json` includes a daily safety-net recovery job, compatible with Vercel's
Hobby scheduling limit. For timely unattended payment/email recovery, configure
an authenticated scheduler to call `GET /api/jobs/order-recovery` every five
minutes with `Authorization: Bearer <CRON_SECRET>`. Vercel Pro can use
`*/5 * * * *`; do not select that schedule on Hobby. The daily safety net is not
a five-minute delivery guarantee. See [Vercel scheduling limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)
and [cron authentication](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

The owner order tools now provide:

- Recover/check payment: reconcile an uncertain creation using its original
  idempotency key and exact request, only within 45 minutes and with the same
  API credential. Older/rotated-key attempts use read-only provider lookup.
- Resolve missing payment: only after one hour, explicit owner confirmation of
  a Mollie review, and a complete bounded provider scan finding no payment.
  An incomplete scan or an existing payment keeps reservations held.
- Retry failed confirmation emails: retries queued/failed recipients only;
  already successful recipients are not deliberately resent. SMTP is
  at-least-once: a lost delivery acknowledgement can still produce a duplicate.
- Check refunds: imports provider-portal and legacy refunds and uses Mollie's
  ledger to calculate the remaining refundable amount.
- Recover original refund: same-key recovery, never a second blind refund.
  After the safe window, an owner must inspect Mollie and explicitly resolve a
  confirmed missing request after one hour. These actions require fresh MFA.

Mollie retains idempotency keys for one hour and ties them to the API credential;
rotating that credential invalidates its key cache. See [Mollie idempotency](https://docs.mollie.com/reference/api-idempotency)
and [refund timeout handling](https://docs.mollie.com/docs/refunds).

Confirmation jobs are queued atomically with new paid transitions. Existing
historical orders do not get an automatic mass email backfill. Old orphan orders
without durable payment parameters require manual provider/accounting review;
never infer a missing payment solely from an empty local database row.

Webhook bursts are bounded by a shared global budget and database leases. Busy
requests receive retryable errors rather than a false success. This supplements,
but does not replace, edge-level traffic protection or provider credential rotation.
