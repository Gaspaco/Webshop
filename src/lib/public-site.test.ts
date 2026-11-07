import assert from "node:assert/strict";
import { it } from "node:test";
import { canonicalProductUrl, publicProductImageUrl } from "./public-site";

it("product SEO uses the public shop domain and crawlable absolute image URLs", () => {
  assert.equal(canonicalProductUrl("blue-eyes"), "https://www.tcghaven.com/products/blue-eyes");
  assert.equal(canonicalProductUrl("../../attacker"), "https://www.tcghaven.com/products/..%2F..%2Fattacker");
  assert.equal(publicProductImageUrl("/product-images/sku.webp"), "https://www.tcghaven.com/product-images/sku.webp");
  assert.equal(publicProductImageUrl("https://cdn.example.test/sku.webp"), "https://cdn.example.test/sku.webp");
  for (const source of [undefined, "data:image/png;base64,abcd", "javascript:alert(1)", "http://example.test/a.png", "https://user:pass@example.test/a.png"]) assert.equal(publicProductImageUrl(source), undefined);
});
