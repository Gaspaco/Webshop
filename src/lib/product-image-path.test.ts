import assert from "node:assert/strict";
import { it } from "node:test";
import { imageSku, parseProductImageFilename, productImagePath } from "./product-image-path";

it("SKU filenames are bounded and reject traversal, guessed formats and header injection", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const hash = "a".repeat(32);
  const path = productImagePath("YGO/TEST EN-001", "v", id, hash);
  assert.equal(path, `/product-images/ygo-test-en-001--v-${id}--${hash}.webp`);
  assert.equal(parseProductImageFilename(path.split("/").pop()!)?.id, id);
  assert.equal(parseProductImageFilename(productImagePath("SKU", "p", id, hash, 3).split("/").pop()!)?.index, 3);
  assert.equal(imageSku("a".repeat(100)).length, 64);
  for (const filename of ["../card.webp", "%2e%2e/card.webp", `sku--v-${id}-0--${hash}.webp`, `sku--p-${id}--${hash}.webp`, `sku--p-${id}-101--${hash}.webp`, `sku--p-${id}-01--${hash}.webp`, `sku--v-${id}--${hash}.svg`, "x\r\nInjected:1.webp"]) {
    assert.equal(parseProductImageFilename(filename), null, filename);
  }
});
