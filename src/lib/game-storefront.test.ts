import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ShopProduct } from "./categories";
import {
  formatReleaseCountdown,
  isActivePreorder,
  isUpcoming,
  releaseTime,
} from "./game-storefront";

describe("pre-order release state", () => {
  const release = { preorder: true, releaseDate: "2026-10-10" } as ShopProduct;

  it("keeps the pre-order active before release and expires it on release", () => {
    assert.equal(isActivePreorder(release, Date.parse("2026-10-09T00:00:00Z")), true);
    assert.equal(isActivePreorder(release, releaseTime(release)), false);
  });

  it("does not create a permanent pre-order without a release date", () => {
    assert.equal(isActivePreorder({ preorder: true }, Date.now()), false);
  });

  it("formats a stable countdown and removes it after release", () => {
    assert.equal(
      formatReleaseCountdown(release, Date.parse("2026-10-08T20:00:00Z")),
      "1d 4h",
    );
    assert.equal(formatReleaseCountdown(release, releaseTime(release)), "");
  });

  it("keeps future dated products in upcoming releases", () => {
    assert.equal(isUpcoming(release, Date.parse("2026-10-09T00:00:00Z")), true);
    assert.equal(isUpcoming(release, releaseTime(release)), false);
  });
});
