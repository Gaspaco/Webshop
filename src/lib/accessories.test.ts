import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { it } from "node:test";
import { ACCESSORY_BRANDS, ACCESSORY_CATEGORIES, accessoryBrand, accessoryCategory, accessoryCategoryName, accessoryShopUrl } from "./accessories";
import { databaseProductToShopProduct, type DatabaseCatalogProduct } from "./catalog";

it("defines accessory categories and canonical brands without assigning a game", () => {
  assert.deepEqual(ACCESSORY_BRANDS, ["Dragon Shield", "Ultra PRO"]);
  assert.equal(accessoryBrand(" ultra pro "), "Ultra PRO");
  assert.equal(accessoryBrand("Custom brand"), "Custom brand");
  for (const category of ACCESSORY_CATEGORIES) {
    assert.equal(accessoryCategory(category.slug), category.slug);
    assert.equal(accessoryCategory(`accessories-${category.slug}`), category.slug);
    assert.equal(accessoryCategoryName(category.slug), category.name);
  }
  assert.equal(accessoryCategory(null), "other-accessories");
  assert.equal(accessoryCategory("unknown"), "other-accessories");
  assert.equal(accessoryShopUrl("sleeves", "Ultra PRO"), "/products?type=accessory&category=sleeves&brand=Ultra+PRO");
  const product = databaseProductToShopProduct({ slug: "sleeves", name: "Sleeves", productType: "accessory", brand: "ultra pro", game: "pokemon",
    categorySlug: "accessories-sleeves", imageUrls: [], metadata: {}, priceCents: 1295, stock: 4, reservedStock: 0,
  } as unknown as DatabaseCatalogProduct);
  assert.equal(product.accessoryCategory, "sleeves"); assert.equal(product.brand, "Ultra PRO"); assert.equal(product.game, "accessories");
});

it("creates, edits, duplicates and publishes accessories with separate categories and brands", { timeout: 30000 }, () => {
  const output = execFileSync("bun", ["--no-env-file", "scripts/accessories-integration.ts"], {
    env: { ...process.env, TCG_ACCESSORIES_TEST: "1" }, encoding: "utf8", timeout: 25000,
  });
  assert.ok(output.includes("ACCESSORIES INTEGRATION PASSED"));
});
