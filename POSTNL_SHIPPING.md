# PostNL product measurements

## Configuration

The Mijn PostNL Zakelijk customer-settings link is a private management page, not an API endpoint. Use its key only in server environment variables:

- `POSTNL_API_KEY`
- `POSTNL_CUSTOMER_NUMBER`
- `POSTNL_CUSTOMER_CODE`
- `POSTNL_COLLECTION_LOCATION`
- `POSTNL_MODE`: `sandbox` or `production`

Never put the key in a public variable, browser code, committed example file or image URL. Account settings must permit the shipping services used by the integration. A configured key does not prove that PostNL has enabled a particular service for that contract.

## Checkout and label flow

1. Configure product weights, dimensions and shipping classes in the product editor. Presets fill the measurements; individual products may override them.
2. Checkout reads the saved product data on the server, multiplies per-item weights by quantities and applies the shared singles tier once across all quantity-based singles classes. Defaults are 20 g for up to 10 singles and 50 g above 10, before packaging.
3. Packaging weight and padding are added once. The package must fit the configured letterbox or parcel limits. Checkout prices come from the owner's configured rates, not a live PostNL contract-price API.
4. The resulting measurements are saved on the order. Later product edits do not change that order's measurements.
5. In the order's PostNL label section, **Use product measurements** loads the saved measurements without creating a label. Older orders without a snapshot use current product data and show an estimate warning. Missing/deleted variants fall back to the configured standard class. Historical orders are not silently rewritten.
6. Review the packed parcel and override weight/dimensions if needed. Blank fields use the calculated values. If overriding dimensions, supply all three. Label creation independently validates the measurements on the server, including letterbox/parcel limits. Partial overrides and missing configuration fail before the label is claimed or PostNL is called.
7. **Create and download label** is the separate carrier operation, available only for paid/processing orders. Production labels are announced to PostNL and may incur contract charges. The actual submitted weight, dimensions and measurement source are recorded in the admin audit log. Duplicate creation is prevented; uncertain provider results remain blocked for manual checking.
8. Use **Mark shipped and notify** to send the existing customer tracking email when the parcel is ready to dispatch.

## Current limits

- Automatic labels currently support Dutch destinations with the existing PostNL integration. International checkout rates remain available, but international labels must be made manually. Customs declarations and contract-specific international product codes are not implemented.
- The integration uses the existing shipping v2.2 and barcode v1.1 endpoints. Moving an account to PostNL's newer Shipment v4 API requires separate contract/access verification and is not silently enabled by a portal link.
- Class names are internal webshop rules. PostNL receives the resulting grams, dimensions (converted to millimetres) and service code, not the class name. Default services are 2928 for letterbox and 3085 for standard parcels.
- Multi-item dimensions use a conservative stacking estimate, not a 3D packing algorithm or automatic multi-parcel splitting. Verify the actual packed parcel before label creation.
- This change adds no database migration and does not create live labels during tests. Automated tests use isolated PostgreSQL and mocked PostNL responses; real account acceptance still requires a controlled owner-approved label test.

Official service documentation: https://developer.postnl.nl/integration-with-postnl/api-overview/send-and-track/shipping-webservice/
