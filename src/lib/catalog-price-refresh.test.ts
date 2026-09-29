import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isWithinApiRefreshProductLimit,
  matchYgoprodeckPrices,
  positiveEuroCents,
  refreshedPriceOrCurrent,
} from "./catalog-price-refresh";

describe("catalogue API price refresh", () => {
  it("converts positive EUR references to integer cents", () => {
    assert.equal(positiveEuroCents("6.97"), 697);
    assert.equal(positiveEuroCents(0.015), 2);
    assert.equal(positiveEuroCents("0.00"), 0);
  });

  it("matches current Yu-Gi-Oh printing prices by imported SKU or label", () => {
    const prices = matchYgoprodeckPrices(
      {
        id: 46986414,
        card_sets: [
          {
            set_name: "2017 Mega-Tins",
            set_code: "CT14-EN001",
            set_rarity: "Secret Rare",
            set_price: "9.66",
          },
        ],
        card_prices: [{ cardmarket_price: "5.50" }],
      },
      [
        {
          id: "sku-match",
          sku: "YGO-46986414-CT14-EN001-SECRET-RARE",
          name: "Legacy name",
        },
        {
          id: "label-match",
          sku: "LEGACY-SKU",
          name: "2017 Mega-Tins · Secret Rare",
        },
      ],
    );

    assert.equal(prices.get("sku-match"), 966);
    assert.equal(prices.get("label-match"), 966);
  });

  it("never replaces an existing price with a missing or zero reference", () => {
    assert.equal(refreshedPriceOrCurrent(1299, undefined), 1299);
    assert.equal(refreshedPriceOrCurrent(1299, 0), 1299);
    assert.equal(refreshedPriceOrCurrent(1299, -1), 1299);
    assert.equal(refreshedPriceOrCurrent(1299, 1499), 1499);
  });

  it("allows one through twenty products per refresh", () => {
    assert.equal(isWithinApiRefreshProductLimit(1), true);
    assert.equal(isWithinApiRefreshProductLimit(20), true);
    assert.equal(isWithinApiRefreshProductLimit(0), false);
    assert.equal(isWithinApiRefreshProductLimit(21), false);
  });
});
