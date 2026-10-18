import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { safeAccountReturnPath } from "./auth-redirect";

describe("login return destinations", () => {
  it("blocks external URLs including control-character and backslash tricks", () => {
    for (const path of ["//attacker.test", "//[", "/\n/attacker.test", "/\t/attacker.test", "/\\attacker.test", "https://attacker.test", "javascript:alert(1)"]) {
      assert.equal(safeAccountReturnPath(path), "/account");
    }
  });
  it("normalizes dot segments before rejecting login loops", () => {
    for (const path of [null, "/", "/login/", "/products/../login", "/signup?next=/", "/admin/login"]) {
      assert.equal(safeAccountReturnPath(path), "/account");
    }
  });
  it("preserves useful internal destinations and search filters", () => {
    assert.equal(safeAccountReturnPath("/checkout?step=payment#summary"), "/checkout?step=payment#summary");
  });
});
