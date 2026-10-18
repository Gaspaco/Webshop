import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { csvCell } from "./csv";
import { makeGuestOrderToken, hashGuestOrderToken, verifyGuestOrderToken } from "./guest-order-access";
import { nextFulfilmentStatus } from "./payment-state";

describe("spreadsheet export safety", () => {
  it("neutralizes formulas including leading whitespace and Unicode variants", () => {
    for (const value of ["=1+1", "+SUM(A1)", "-1+1", "@SUM(A1)", "  =1", "\r\n=1", "＝1+1"]) {
      assert.ok(csvCell(value).startsWith('"\t'));
    }
    assert.equal(csvCell('safe, "quoted"'), '"safe, ""quoted"""');
    assert.equal(csvCell(-10), '"-10"');
  });
});
describe("guest order tokens", () => {
  it("uses independent, high-entropy tokens and stores only a digest", () => {
    const token = makeGuestOrderToken();
    assert.equal(token.length, 43);
    assert.notEqual(token, makeGuestOrderToken());
    const hash = hashGuestOrderToken(token);
    assert.ok(verifyGuestOrderToken(token, hash));
    for (const wrong of [null, "", makeGuestOrderToken(), "x".repeat(1000)]) assert.equal(verifyGuestOrderToken(wrong, hash), false);
    assert.equal(verifyGuestOrderToken(token, null), false);
  });
});
describe("payment notifications preserve fulfilment", () => {
  it("cannot reset fulfilled or manually closed orders", () => {
    for (const status of ["processing", "shipped", "completed", "refunded", "cancelled"]) {
      for (const payment of ["paid", "pending", "failed", "cancelled", "expired"]) {
        assert.equal(nextFulfilmentStatus(status, payment), status);
      }
    }
    assert.equal(nextFulfilmentStatus("pending", "paid"), "paid");
    assert.equal(nextFulfilmentStatus("pending", "expired"), "cancelled");
  });
});
