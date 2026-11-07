import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CATEGORIES, CATEGORY_LIST } from "./categories";
import { PRODUCT_GAMES } from "./product-types";
import { getGameIdentity } from "./game-storefront";
import { parseProductSpreadsheet } from "./product-spreadsheet";

describe("expanded game categories", () => {
  const requested = ["onepiece", "naruto", "vanguard", "weissschwarz", "sorcery", "battlespiritsaga", "grandarchive", "palworld"];
  it("keeps public categories and server/import validation in sync without duplicates", () => {
    assert.deepEqual(new Set(CATEGORY_LIST.map(category => category.slug)), new Set(PRODUCT_GAMES.filter(game => game !== "other")));
    assert.equal(CATEGORY_LIST.length, new Set(CATEGORY_LIST.map(category => category.slug)).size);
    for (const slug of requested) {
      const category = CATEGORIES[slug]!;
      assert.equal(category.slug, slug);
      assert.equal(category.theme, slug);
      assert.equal(category.products.length, 0, "new categories must not advertise invented stock");
      assert.ok(category.name);
      assert.ok(getGameIdentity(slug).releaseCopy.includes(category.name));
    }
  });
  it("accepts singles and sealed spreadsheet rows for all requested games", () => {
    for (const slug of requested) {
      for (const type of ["single", "sealed"] as const) {
        const parsed = parseProductSpreadsheet(`name,productType,game,sku,price,stock\nFixture,${type},${slug},TEST-${slug}-${type},10,1\n`, type);
        assert.deepEqual(parsed.issues, [], slug);
        assert.equal(parsed.rows[0]?.game, slug);
      }
    }
  });
});
