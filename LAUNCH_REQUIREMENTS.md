# TCGHaven launch requirements

This file separates technical work from information and accounts that must come from the shop owner. The developer should never invent legal business details, tax rules, or commercial policies.

## Required provider APIs

### Mollie payments

Owner provides:

- An approved Mollie business account
- A live API key for `MOLLIE_API_KEY`
- Enabled payment methods and settlement bank details

Developer configures:

- Payment creation through the server
- The public `/api/payments/mollie-webhook` endpoint
- Amount verification, idempotent status changes, refunds, and inventory transitions

### Resend transactional email

Owner provides:

- Access to the sending domain
- The approved sender name and support address

Developer configures:

- `RESEND_API_KEY`
- `AUTH_EMAIL_FROM`
- SPF, DKIM, and DMARC records supplied by Resend

### Shipping carrier

Recommended first option for a Dutch webshop: MyParcel, connected to PostNL or another carrier through the owner's carrier contract.

Owner provides:

- Carrier or MyParcel business account
- API key
- Shipping countries, rates, parcel sizes, free-shipping threshold, return method, and sender address

Developer configures:

- `SHIPPING_PROVIDER`
- `SHIPPING_API_KEY`
- Label creation, tracking updates, webhook authentication, and retry handling

Do not build carrier-specific label creation until the owner chooses the provider.

### Product image storage

Recommended option: Cloudflare R2 using its S3-compatible API. Cloudinary is a valid alternative when automatic image transformations are more important.

For R2 the owner creates the Cloudflare account and bucket. The developer configures:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `R2_PUBLIC_URL`

Use a token scoped to the single product-image bucket. Never expose the parent secret to the browser.

### Error monitoring

Developer creates or is invited to the owner's Sentry project and configures:

- `SENTRY_DSN`
- A production release name
- Alerts for checkout failures, webhook failures, database errors, and elevated 5xx rates

### Google sign in

Optional. Owner provides access to the Google Cloud project and approves the consent-screen identity. Developer configures:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- Production callback URLs for the live domain

### Card catalogue data

Optional import sources:

- Pokémon TCG API, with an API key for useful rate limits
- YGOPRODeck API for Yu-Gi-Oh! catalogue data
- Scryfall API for Magic: The Gathering catalogue data

Imported data still needs owner review. Store supplier cost, actual condition, owned quantity, language, finish, grading details, and selling price in the local database. Cache imports and follow each provider's image and attribution policy.

### Search and shopping discovery

Optional after the launch blockers are closed:

- Google Search Console site verification
- Google Merchant Center account and `GOOGLE_MERCHANT_ID`
- Analytics provider selected by the owner, with a consent configuration where required

The project already includes `robots.txt`, `sitemap.xml`, canonical product URLs, and Product structured data.

## Owner information required

Request these values from the actual shop owner:

- Legal company name
- KVK number
- VAT ID
- Registered business address
- Dutch return address
- Customer-support email and phone number
- Complaints process
- Shipping zones, rates, packaging rules, and handling times
- Return costs and legally reviewed exclusions
- Standard VAT versus margin-scheme decision per product type
- Final approval of terms, privacy notice, returns text, and checkout wording

Environment placeholders:

- `BUSINESS_LEGAL_NAME`
- `BUSINESS_KVK_NUMBER`
- `BUSINESS_VAT_ID`
- `BUSINESS_ADDRESS`
- `BUSINESS_RETURN_ADDRESS`
- `BUSINESS_SUPPORT_EMAIL`

## Sign-off flags

These flags must only be set to `true` after the named work was actually completed:

- `BACKUPS_CONFIRMED`
- `VAT_RULES_CONFIRMED`
- `LEGAL_REVIEW_CONFIRMED`

The admin Launch Readiness screen reports whether a value exists, but never returns a credential or secret to the browser.
