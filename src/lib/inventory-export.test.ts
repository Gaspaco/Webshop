import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";
import {
  INVENTORY_EXPORT_SCOPES, inventoryCsvLine, inventoryExportFilename, inventoryExportHeaders,
  inventoryExportUrl, inventoryExportValues, parseInventoryExportOptions, type InventoryExportRow,
} from "./inventory-export";

describe("inventory CSV options", () => {
  it("preserves the original all-products, no-images export by default", () => {
    const options = parseInventoryExportOptions(new URLSearchParams());
    assert.deepEqual(options, { scope: "all", images: false });
    assert.equal(inventoryExportFilename(options), "tcghaven-inventory.csv");
    assert.equal(inventoryExportHeaders(false).length, 11);
  });
  it("round trips every product filter and image setting", () => {
    for (const { value: scope } of INVENTORY_EXPORT_SCOPES) for (const images of [false, true]) {
      const options = { scope, images };
      assert.deepEqual(parseInventoryExportOptions(new URL(inventoryExportUrl(options), "https://shop.test").searchParams), options);
      assert.ok(inventoryExportFilename(options).endsWith(".csv"));
    }
  });
  it("rejects invalid filters instead of silently exporting the entire catalogue", () => {
    for (const query of ["scope=unknown", "scope=", "images=1", "images=yes", "images="]) {
      assert.throws(() => parseInventoryExportOptions(new URLSearchParams(query)));
    }
  });
  it("only includes image data on request, with variant-first fallback", () => {
    const row: InventoryExportRow = { name: "Card", slug: "card", game: "yugioh", type: "single", status: "active",
      sku: "CARD", condition: "Near Mint", language: "English", priceCents: 1234, stock: 0, reserved: 0,
      imageUrls: ["https://images.test/a.jpg", "data:image/png;base64,abc"], variantImage: "https://images.test/b.jpg" };
    assert.equal(inventoryExportValues(row, false).length, 11);
    assert.equal(inventoryExportValues(row, false)[8], 12.34);
    assert.deepEqual(inventoryExportValues(row, true).slice(11), [row.variantImage, JSON.stringify(row.imageUrls), row.variantImage]);
    assert.equal(inventoryExportValues({ ...row, variantImage: null }, true)[11], row.imageUrls![0]);
    assert.deepEqual(inventoryExportValues({ ...row, imageUrls: [], variantImage: null }, true).slice(11), ["", "[]", ""]);
    assert.equal(inventoryExportValues({ ...row, priceCents: null }, false)[8], null);
  });
  it("escapes quotes, newlines and formulas without damaging image data", () => {
    assert.equal(inventoryCsvLine(['=HYPERLINK("bad")', 'A,"B"\nC', "data:image/png;base64,abc"]),
      '"\t=HYPERLINK(""bad"")","A,""B""\nC","data:image/png;base64,abc"\r\n');
  });
  it("exports the correct database rows and enforces owner access", { timeout: 30000 }, () => {
    const output = execFileSync("bun", ["--no-env-file", "scripts/inventory-export-integration.ts"], {
      env: { ...process.env, TCG_INVENTORY_EXPORT_TEST: "1" }, encoding: "utf8", timeout: 25000,
    });
    assert.ok(output.includes("INVENTORY EXPORT INTEGRATION PASSED"));
  });
});
