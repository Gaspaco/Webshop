import assert from "node:assert/strict";
import { it } from "node:test";
import { nextProductImage, productImageCandidates, productImageDecoded } from "./product-image-fallback";

it("photo fallbacks are unique, bounded and do not restart a broken source", () => {
  const sources = productImageCandidates("/variant.webp", [" /product.webp ", "/variant.webp", undefined, "", "/back.webp"]);
  assert.deepEqual(sources, ["/variant.webp", "/product.webp", "/back.webp"]);
  const failed = new Set<string>();
  assert.equal(nextProductImage(sources, failed), "/variant.webp");
  failed.add("/variant.webp");
  assert.equal(nextProductImage(sources, failed), "/product.webp");
  failed.add("/product.webp");
  assert.equal(nextProductImage(sources, failed), "/back.webp");
  failed.add("/back.webp");
  assert.equal(nextProductImage(sources, failed), undefined);
});

it("cached successful images count as loaded, broken and pending images do not", () => {
  assert.equal(productImageDecoded({ complete: true, naturalWidth: 600 }), true);
  assert.equal(productImageDecoded({ complete: true, naturalWidth: 0 }), false);
  assert.equal(productImageDecoded({ complete: false, naturalWidth: 600 }), false);
});
