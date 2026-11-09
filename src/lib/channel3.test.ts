import assert from "node:assert/strict";
import { it } from "node:test";
import { channel3LookupUrl } from "./channel3";

it("Channel3 lookup accepts public HTTPS product links, not private or credential-bearing URLs", () => {
  assert.equal(channel3LookupUrl(" https://retailer.com/product/item?variant=blue "), "https://retailer.com/product/item?variant=blue");
  for (const value of ["http://shop.com/item", "https://user:secret@shop.com/item", "https://shop.com:8443/item", "https://shop.com/item#secret", "https://localhost/item", "https://x.internal/item", "https://x.local/item", "https://127.0.0.1/item", "https://2130706433/item", "https://0x7f000001/item", "https://[::1]/item", "file:///etc/passwd", "javascript:alert(1)", "https://shop.com/" + "x".repeat(2000)]) {
    assert.equal(channel3LookupUrl(value), null, value);
  }
});
