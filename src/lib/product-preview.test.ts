import assert from "node:assert/strict";
import { it } from "node:test";
import { productPreviewVariant } from "./product-preview";

it("previews the most expensive available variant, falling back through prices as stock runs out", () => {
  const variants = [{ id: "pack", priceCents: 2000, stock: 4, isDefault: true }, { id: "case", priceCents: 50000, stock: 1 }, { id: "box", priceCents: 10000, stock: 2 }];
  assert.equal(productPreviewVariant(variants)!.id, "case");
  variants[1]!.stock = 0;
  assert.equal(productPreviewVariant(variants)!.id, "box");
  variants[2]!.stock = 0;
  assert.equal(productPreviewVariant(variants)!.id, "pack");
  variants[0]!.stock = 0;
  assert.equal(productPreviewVariant(variants)!.id, "case", "sold-out products retain a consistent cover");
  assert.deepEqual(variants.map(row => row.id), ["pack", "case", "box"], "never reorder the variant selector");
});

it("handles empty and single-variant products and deterministic price ties", () => {
  assert.equal(productPreviewVariant(), undefined);
  const one = { priceCents: 100, stock: 1 };
  assert.equal(productPreviewVariant([one]), one);
  const variants = [{ id: "first", priceCents: 100, stock: 1 }, { id: "default", priceCents: 100, stock: 1, isDefault: true }];
  assert.equal(productPreviewVariant(variants)!.id, "default");
  variants[1]!.stock = 0;
  assert.equal(productPreviewVariant(variants)!.id, "first");
});
