import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  databaseCatalogRowsToState,
  databaseProductToShopProduct,
  fetchDatabaseCatalogState,
  type DatabaseCatalogProduct,
} from "./catalog";

const originalFetch = globalThis.fetch;

function makeProduct(index: number): DatabaseCatalogProduct {
  return {
    id: `product-${index}`,
    slug: `card-${index}`,
    name: `Card ${index}`,
    description: null,
    game: "pokemon",
    productType: "single",
    imageUrls: [],
    metadata: {},
    variantId: `variant-${index}`,
    variantName: "Normal",
    sku: `SKU-${index}`,
    condition: "Near Mint",
    language: "English",
    finish: "Normal",
    variantImageUrl: null,
    isDefault: true,
    priceCents: 100,
    compareAtPriceCents: null,
    stock: 1,
    reservedStock: 0,
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("fetchDatabaseCatalogState", () => {
  it("loads every catalogue page instead of silently stopping", async () => {
    const products = Array.from({ length: 590 }, (_, index) => makeProduct(index));
    const requestedOffsets: number[] = [];

    globalThis.fetch = (async input => {
      const rawUrl =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const url = new URL(rawUrl, "http://localhost");
      const offset = Number(url.searchParams.get("offset"));
      const limit = Number(url.searchParams.get("limit"));
      const page = products.slice(offset, offset + limit);
      const hasMore = offset + page.length < products.length;
      requestedOffsets.push(offset);

      return Response.json({
        products: page,
        managedSlugs: page.map(product => product.slug),
        hasMore,
        nextOffset: hasMore ? offset + limit : null,
      });
    }) as typeof fetch;

    const catalogue = await fetchDatabaseCatalogState();

    assert.equal(catalogue.products.length, 590);
    assert.equal(catalogue.managedSlugs.length, 590);
    assert.deepEqual(requestedOffsets, [0, 200, 400]);
  });

  it("fails clearly when an API page does not advance", async () => {
    globalThis.fetch = (async () =>
      Response.json({
        products: [makeProduct(0)],
        managedSlugs: ["card-0"],
        hasMore: true,
        nextOffset: 0,
      })) as unknown as typeof fetch;

    await assert.rejects(
      fetchDatabaseCatalogState(),
      /Catalogue pagination did not advance\./,
    );
  });
});

describe("catalogue image selection", () => {
  it("uses a variant-only image as the product card cover", () => {
    const row = makeProduct(1);
    row.variantImageUrl = "https://images.example.test/variant.webp";

    const product = databaseProductToShopProduct(row);

    assert.equal(product.image, row.variantImageUrl);
    assert.equal(product.variants?.[0]?.image, row.variantImageUrl);
  });

  it("uses the highest-priced available variant image for a grouped product", () => {
    const lower = makeProduct(1);
    lower.slug = "shared-card";
    lower.id = "shared-product";
    lower.isDefault = false;
    lower.priceCents = 100;
    lower.variantImageUrl = "https://images.example.test/lower.webp";

    const main = makeProduct(2);
    main.slug = "shared-card";
    main.id = "shared-product";
    main.isDefault = true;
    main.priceCents = 500;
    main.variantImageUrl = "https://images.example.test/main.webp";

    const state = databaseCatalogRowsToState([lower, main], []);

    assert.equal(state.products[0]?.image, main.variantImageUrl);
    assert.equal(state.products[0]?.priceCents, 500);
    assert.equal(state.products[0]?.variantId, main.variantId);
  });

  it("skips more expensive sold-out and fully reserved variants, keeping price and photo together", () => {
    const rows = [makeProduct(1), makeProduct(2), makeProduct(3), makeProduct(4)];
    for (const row of rows) { row.id = "shared"; row.slug = "shared"; row.isDefault = false; row.variantImageUrl = `https://images.example.test/${row.variantId}.webp`; }
    rows[0]!.isDefault = true; rows[0]!.priceCents = 100;
    rows[1]!.priceCents = 50000; rows[1]!.stock = 0;
    rows[2]!.priceCents = 30000; rows[2]!.reservedStock = 1;
    rows[3]!.priceCents = 20000; rows[3]!.condition = "Sealed"; rows[3]!.language = "Japanese";
    const [product] = databaseCatalogRowsToState(rows, []).products;
    assert.equal(product!.variantId, rows[3]!.variantId); assert.equal(product!.priceCents, 20000);
    assert.equal(product!.image, rows[3]!.variantImageUrl); assert.equal(product!.sku, rows[3]!.sku);
    assert.equal(product!.condition, "Sealed"); assert.equal(product!.language, "Japanese"); assert.equal(product!.stock, 2);
    assert.equal(product!.variants?.find(row => row.isDefault)?.id, rows[0]!.variantId, "preview selection must not rewrite the owner's main flag");
  });

  it("uses product artwork when the chosen available option has no photo", () => {
    const cheap = makeProduct(1), expensive = makeProduct(2);
    cheap.id = expensive.id = "shared"; cheap.slug = expensive.slug = "shared";
    cheap.priceCents = 100; expensive.priceCents = 20000; expensive.isDefault = false;
    cheap.variantImageUrl = "https://images.example.test/cheap.webp";
    expensive.variantImageUrl = ""; expensive.imageUrls = ["/images/product.webp"];
    assert.equal(databaseCatalogRowsToState([cheap, expensive], []).products[0]!.image, "/images/product.webp");
  });
});
