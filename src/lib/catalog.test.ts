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
      })) as typeof fetch;

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

  it("uses the default variant image for a grouped product", () => {
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
});
