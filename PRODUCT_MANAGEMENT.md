# Category-based product management

The Add Product form starts with **Product category**. Existing `single`, `sealed`, `graded` and `accessory` values are retained. The new types are `set` (a complete set sold as a product, not an expansion), `figurine`, `collectible` and `merchandise`.

TCG products use a game. Non-TCG products use a brand and have no game association. Accessories retain their Sleeves, Deck Boxes, Binders, Playmats and Other subcategories. Figurines, collectibles and merchandise have their own catalogue category rows.

Product specifications live in `products.metadata.attributes`. Variation-specific overrides live in `product_variants.attributes`, independently of the image, SKU, price and stock. For example, a merchandise listing can have a shared material and separate colour/size options. Shop and dashboard filters use the same field definitions. Combined variation filters must match a single real option.

## Inventory files

The dashboard's **Inventory files** tab contains export options and a template selector for every product type. Files are Excel-compatible CSV, not native `.xlsx`. Open in Excel, keep the header row, then save as CSV UTF-8. Comma and semicolon delimiters and decimal-comma EUR prices are accepted. Native `.xlsx`/`.xls` uploads are not supported.

- One row per variation, at most 1,000 rows per import. A blank template contains no sample stock.
- Every variation requires a unique SKU. Matching SKUs update existing variants without duplicating them. Ambiguous case-insensitive SKU matches are rejected.
- A shared `slug` groups new variations into one listing. Different SKUs with different or blank slugs create separate products. Do not change the slug of an existing SKU through import.
- Product-level fields must agree on rows sharing a slug. `variant_colour`, `variant_size`, `variant_scale`, etc. describe that row's option. Other attributes describe the shared product.
- Blank optional cells keep existing values. They do not clear a gallery, brand or attribute. Use the product/variation editor to explicitly remove values.
- Category exports include applicable product, variation and shipping fields. Enable images to include the original gallery and individual variation sources. Embedded uploads can make files large; image-free files can still update prices and stock while preserving photos.
- Export visibility is informational. Before importing, choose Publish in shop or Keep as private drafts; this applies to the reviewed batch, including existing listings. Archived listings can therefore be republished if Publish is chosen.
- A batch is transactional. Invalid category/SKU relationships, reserved-stock conflicts, database conflicts and other failures roll back all product/inventory changes. The import job still records a failure.
- The existing all-products export and legacy TCG CSV columns remain available. Choose a specific category for its richer import-compatible layout.

## Deployment and extension

Apply migration `0021_product_variant_attributes.sql` before deploying code that reads the new variant column. The migration only adds a JSONB column with an empty-object default; no existing catalogue data is rewritten. This task does not apply production migrations or deploy changes.

`src/lib/product-types.ts` is the shared configuration for types, groups, fields and variation fields. Add a definition there to extend the selector, generic attribute editor, CSV columns, validation and filters. New type definitions do not require another database schema change. This is a developer-managed registry, not an owner-editable schema builder.

Legacy game/set/card fields and shipping/provider integrations retain their existing behavior. New non-TCG types use the standard shipping fallback until the owner assigns measurements or a preset. A type change does not automatically convert supplier IDs or reinterpret old card-specific data.
