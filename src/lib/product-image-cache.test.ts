import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { it } from "node:test";

it("SKU image caching, isolation, provider limits and capacity accounting pass against isolated PostgreSQL", { timeout: 30000 }, () => {
  const output = execFileSync("bun", ["--no-env-file", "scripts/product-image-cache-integration.ts"], {
    env: { ...process.env, TCG_PRODUCT_IMAGE_TEST: "1" }, encoding: "utf8", timeout: 25000,
  });
  assert.ok(output.includes("PRODUCT IMAGE CACHE INTEGRATION PASSED"));
});
