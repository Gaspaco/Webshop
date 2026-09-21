import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
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
