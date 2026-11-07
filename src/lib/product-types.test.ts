import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { execFileSync } from "node:child_process";
import { PRODUCT_TYPES, isTcgType, typeAttributes, matchesAttributeFilters } from "./product-types";
import { parseProductSpreadsheet, productTemplate, readCsvRecords, spreadsheetHeaders } from "./product-spreadsheet";
import { categoryExportHeaders, categoryExportValues, inventoryCsvLine } from "./inventory-export";
import { productAttributesSchema, validateTypeAttributes } from "./product-attributes";

describe("category-based product workflow", () => {
  it("gives every type a relevant template, with no importable sample products", () => {
    for (const type of PRODUCT_TYPES) {
      const headers = spreadsheetHeaders(type.value);
      assert.equal(headers.includes("game"), type.game);
      assert.equal(headers.includes("accessoryCategory"), type.value === "accessory");
      assert.equal(headers.includes("gradingCompany"), type.value === "graded");
      assert.equal(headers.includes("rarity"), ["single", "graded"].includes(type.value));
      assert.equal(new Set(headers).size, headers.length);
      assert.equal(parseProductSpreadsheet(productTemplate(type.value)).rows.length, 0);
    }
    assert.equal(isTcgType("figurine"), false);
    assert.equal(isTcgType("set"), true);
  });
  it("validates type-specific fields and blocks unsafe attribute keys", () => {
    assert.deepEqual(typeAttributes("figurine", { character: "  Miku  ", game: "pokemon" }), { character: "Miku" });
    assert.deepEqual(typeAttributes("accessory", { material: "PVC", colour: "Blue" }, true), { colour: "Blue" });
    assert.throws(() => validateTypeAttributes("single", { scale: "1:7" }));
    assert.equal(productAttributesSchema.safeParse(JSON.parse('{"__proto__":"unsafe"}')).success, false);
  });
  it("requires combined variation filters to match one real option", () => {
    const product = { attributes: { material: "Cotton" }, variants: [{ attributes: { colour: "Blue", size: "S" } }, { attributes: { colour: "Red", size: "L" } }] };
    assert.equal(matchesAttributeFilters(product, { material: "Cotton", colour: "Blue", size: "S" }), true);
    assert.equal(matchesAttributeFilters(product, { colour: "Blue", size: "L" }), false);
  });
  it("round-trips every category including variations, shipping and multiple images", () => {
    for (const type of PRODUCT_TYPES) {
      const attributes = Object.fromEntries(type.fields.map(field => [field.key, "Fixture"]));
      const variants = Object.fromEntries(type.fields.filter(field => field.variation).map(field => [field.key, "Variant"]));
      const row = { name: "Product, with quotes \"and\" lines\ncontinued", slug: "fixture", type: type.value, game: type.game ? "yugioh" : null,
        brand: "Fixture brand", status: "active", sku: `TEST-${type.value}`, priceCents: 1295, stock: 5, reserved: 1, condition: type.game ? "Near Mint" : "New", language: type.game ? "English" : null,
        metadata: { attributes, accessoryCategory: "binders", set: "Test set", shipping: { classId: "standard", weightGrams: 500, lengthCm: 15, widthCm: 14, heightCm: 5, presetId: "yugioh-box" } },
        attributes: variants, imageUrls: ["https://images.test/product.png", "https://images.test/back.png"], variantImage: "https://images.test/variant.png", variantName: "Blue edition" };
      const csv = inventoryCsvLine(categoryExportHeaders(type.value, true)) + inventoryCsvLine(categoryExportValues(row, type.value, true));
      const parsed = parseProductSpreadsheet(csv, type.value);
      assert.deepEqual(parsed.issues, [], type.value);
      assert.equal(parsed.rows[0]!.priceCents, 1295);
      assert.deepEqual(parsed.rows[0]!.attributes, attributes);
      assert.deepEqual(parsed.rows[0]!.variantAttributes ?? {}, variants);
      assert.equal(parsed.rows[0]!.shipping?.classId, "standard");
      assert.deepEqual(parsed.rows[0]!.productImages, row.imageUrls);
      assert.equal(parsed.rows[0]!.variantImage, row.variantImage);
    }
  });
  it("rejects malformed CSV, blank numeric cells, mixed templates and duplicate SKUs", () => {
    assert.throws(() => readCsvRecords('name,"unfinished'));
    const header = 'name,productType,game,sku,price,stock\n';
    assert.ok(parseProductSpreadsheet(header + 'Card,single,yugioh,A,,1').issues.length);
    assert.ok(parseProductSpreadsheet(header + 'Card,single,yugioh,A,1,').issues.length);
    assert.ok(parseProductSpreadsheet(header + 'Card,single,yugioh,A,1,1', "figurine").issues.length);
    assert.ok(parseProductSpreadsheet(header + 'Card,single,yugioh,A,1,1\nCard,single,yugioh,a,2,1').issues.length);
    assert.ok(parseProductSpreadsheet('name,name,productType,sku,price,stock\n').issues.length);
  });
  it("preserves compatibility with old imports and makes game optional outside TCGs", () => {
    assert.deepEqual(parseProductSpreadsheet('name,game,productType,set,sku,price,stock,image\nPikachu,pokemon,single,Set,PK1,12.95,3,').issues, []);
    assert.deepEqual(parseProductSpreadsheet('name,brand,productType,sku,price,stock,scale\nFigure,Good Smile,figurine,FG1,99,1,1:7').issues, []);
    assert.ok(parseProductSpreadsheet('name,game,productType,sku,price,stock\nCard,,single,A,1,1').issues.length);
    const dutch = parseProductSpreadsheet('name;brand;productType;sku;price;stock\nFigure;Good Smile;figurine;FG1;12,95;1');
    assert.deepEqual(dutch.issues, []); assert.equal(dutch.rows[0]!.priceCents, 1295);
  });
  it("creates, edits, duplicates and round-trips products in isolated PostgreSQL", { timeout: 40000 }, () => {
    const output = execFileSync("bun", ["--no-env-file", "scripts/product-types-integration.ts"], { env: { ...process.env, TCG_PRODUCT_TYPES_TEST: "1" }, encoding: "utf8", timeout: 35000 });
    assert.ok(output.includes("PRODUCT TYPES INTEGRATION PASSED"));
  });
});
