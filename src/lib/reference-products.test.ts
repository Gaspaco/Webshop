import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { execFileSync } from "node:child_process";
import { onePieceProducts, grandArchiveProducts, vanguardProducts, channel3Products, remoteImage } from "./reference-products";
import { productSets, matchesSetFilter, productForSet, setFilterOptions } from "./product-sets";
import { groupProductsBySet } from "./game-storefront";
import type { ShopProduct } from "./categories";

describe("new reference libraries and expansion filters", () => {
  it("keeps One Piece parallel images and source IDs distinct without treating USD as EUR", () => {
    const raw = { card_name: "Zoro", card_set_id: "OP01-001", set_name: "Romance Dawn", set_id: "OP-01", rarity: "L", market_price: 500 };
    const rows = onePieceProducts([{ ...raw, card_image_id: "OP01-001", card_image: "https://optcgapi.com/base.jpg" }, { ...raw, card_image_id: "OP01-001_p1", card_image: "https://optcgapi.com/parallel.jpg" }]);
    assert.equal(rows.length, 2); assert.notEqual(rows[0]!.id, rows[1]!.id); assert.notEqual(rows[0]!.image, rows[1]!.image);
    assert.equal(rows[0]!.variants[0]!.priceCents, 0); assert.match(rows[0]!.referencePriceLabel, /USD/);
  });
  it("uses Grand Archive matching editions, actual circulations and stamped images", () => {
    const rows = grandArchiveProducts({ data: [{ name: "Lorraine", types: ["CHAMPION"], result_editions: [
      { uuid: "edition-A", set: { name: "Dawn of Ashes First Edition", prefix: "DOA 1st", language: "EN" }, image: "/cards/images/A.jpg", rarity: 4,
        circulations: [{ foil: false, variants: [] }, { foil: true, variants: [{ description: "Winner stamp", image: "/cards/images/stamp.jpg", kind: "FOIL" }] }] },
      { uuid: "edition-B", orientation: "back", image: "/cards/images/back.jpg" },
    ] }] }, { rarity: [{ value: "4", text: "Super Rare" }] });
    assert.equal(rows.length, 1); assert.equal(rows[0]!.image, "https://api.gatcg.com/cards/images/A.jpg");
    assert.equal(rows[0]!.variants.length, 3); assert.equal(rows[0]!.variants[2]!.image, "https://api.gatcg.com/cards/images/stamp.jpg");
    assert.equal(rows[0]!.rarity, "Super Rare"); assert.equal(remoteImage(undefined, "https://api.gatcg.com"), null);
    assert.equal(remoteImage("http://unsafe.test/a"), null);
  });
  it("imports Vanguard EUR references, not TCGPlayer USD, and excludes sealed entries", () => {
    const data = { results: [{ id: "cfv_abc", card_info: { name: "Blaster Blade", set_name: "First set", set_code: "BT01", product_type: "card", variants: ["Normal"] },
      tcgplayer: { prices: [{ market_price: 900 }] }, cardmarket: { prices: [{ variant_type: "normal", trend: 1.29 }] } },
      { id: "box", card_info: { name: "Box", product_type: "sealed" } }] };
    const rows = vanguardProducts(data); assert.equal(rows.length, 1); assert.equal(rows[0]!.variants[0]!.priceCents, 129);
    assert.equal(rows[0]!.image, null);
  });
  it("handles merchandise as references, not retailer stock or imaginary option combinations", () => {
    const data = { products: [{ id: "funko-1", title: "Funko Pop", brands: [{ name: "Funko" }], images: [{ url: "https://images.example.test/pop.jpg" }],
      variants: { selected: [{ name: "Color", label: "Blue" }], options: [{ name: "Color", values: [{ label: "Blue" }, { label: "Red" }] }, { name: "Size", values: [{ label: "S" }, { label: "L" }] }] },
      offers: [{ availability: "InStock", price: { currency: "EUR", price: 20 } }] }] };
    const rows = channel3Products(data, "funko"); assert.equal(rows[0]!.productType, "figurine");
    assert.equal(rows[0]!.variants.length, 1); assert.equal(rows[0]!.variants[0]!.priceCents, 0);
    assert.deepEqual(rows[0]!.variants[0]!.attributes, { colour: "Blue" });
    assert.equal(channel3Products(data, "plush")[0]!.attributes.merchandiseType, "Plushie");
    assert.equal(channel3Products(data, "beyblade")[0]!.attributes.collectibleType, "Beyblade");
  });
  it("finds all legacy printing sets, deduplicates them and keeps selected-set previews together", () => {
    const product = { id: "card", name: "Card", href: "/products/card", game: "yugioh", gameName: "Yu-Gi-Oh!", theme: "yugioh", catalogSource: "yugipedia", set: "First set",
      variants: [
        { id: "a", sku: "A", name: "First set · Common", priceCents: 100, stock: 4, image: "a.jpg" },
        { id: "b", sku: "B", name: "Second set · Secret", priceCents: 9000, stock: 1, image: "b.jpg" },
        { id: "c", sku: "C", name: "Second set · Rare", priceCents: 10000, stock: 0, image: "c.jpg" },
      ] } as ShopProduct;
    assert.deepEqual(productSets(product).map(set => set.name), ["First set", "Second set"]);
    assert.equal(groupProductsBySet([product])[1]!.count, 1);
    assert.equal(matchesSetFilter(product, "yugioh:second-set"), true); assert.equal(matchesSetFilter(product, "pokemon:second-set"), false);
    const selected = productForSet(product, "second-set"); assert.equal(selected.variantId, "b"); assert.equal(selected.image, "b.jpg");
    assert.equal(selected.priceCents, 9000); assert.match(selected.href, /variant=b/); assert.equal(selected.variants!.length, 2);
    assert.equal(setFilterOptions([product, { ...product, game: "magic" }]).length, 4);
    assert.deepEqual(productSets({ setCode: "CHAO", game: "yugioh" }), [{ name: "CHAO", code: "CHAO" }]);
    assert.deepEqual(productSets({ catalogSource: "custom", variants: [{ name: "Blue · L" }] }), []);
  });
  it("checks provider guards, cache reuse, quotas and imports against isolated PostgreSQL", { timeout: 45000 }, () => {
    const output = execFileSync("bun", ["--no-env-file", "scripts/reference-providers-integration.ts"], { env: { ...process.env, TCG_REFERENCE_TEST: "1" }, encoding: "utf8", timeout: 40000 });
    assert.ok(output.includes("REFERENCE PROVIDERS INTEGRATION PASSED"));
  });
});
