import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { it } from "node:test";
import { productImageInputValue, validProductImageSource } from "./product-image-input";

it("accepts existing relative/API images, HTTPS sources, uploaded photos and optional empty values", () => {
  for (const value of ["", "  ", "https://images.example.test/card.png", "/images/card.webp", "/api/catalog/image?variant=fixture", "/api/yugipedia/card/1234", "/api/admin/product-image?variant=fixture", "data:image/png;base64,aGVsbG8="]) assert.equal(validProductImageSource(value), true, value);
  for (const value of ["not a URL", "http://images.example.test/card.png", "https://", "javascript:alert(1)", "//example.test/card.png", "/\\example.test/card.png", "data:text/html;base64,AA=="]) assert.equal(validProductImageSource(value), false, value);
});

it("does not require a replacement URL for an uploaded or privately served photo", () => {
  assert.equal(productImageInputValue("/api/admin/product-image?variant=fixture"), "");
  assert.equal(productImageInputValue("data:image/png;base64,aGVsbG8="), "");
  assert.equal(productImageInputValue("/api/yugipedia/card/1234"), "/api/yugipedia/card/1234");
});

it("preserves saved photos through product and variant updates against isolated PostgreSQL", { timeout: 30000 }, () => {
  const output = execFileSync("bun", ["--no-env-file", "scripts/preview-images-integration.ts"], {
    env: { ...process.env, TCG_PREVIEW_IMAGES_TEST: "1" }, encoding: "utf8", timeout: 25000,
  });
  assert.ok(output.includes("PREVIEW IMAGES INTEGRATION PASSED"));
});
