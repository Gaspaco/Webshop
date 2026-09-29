import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isShippingMethodAllowed,
  usesPostnlFulfilment,
} from "./shipping";

describe("shipping method safeguards", () => {
  it("allows pickup only for a Dutch destination", () => {
    assert.equal(isShippingMethodAllowed("Netherlands", "local_pickup"), true);
    assert.equal(isShippingMethodAllowed("NL", "local_pickup"), true);
    assert.equal(isShippingMethodAllowed("Belgium", "local_pickup"), false);
    assert.equal(isShippingMethodAllowed("Unknown", "local_pickup"), false);
  });

  it("keeps international and Dutch PostNL methods destination-specific", () => {
    assert.equal(isShippingMethodAllowed("Belgium", "postnl_international"), true);
    assert.equal(isShippingMethodAllowed("Netherlands", "postnl_international"), false);
    assert.equal(isShippingMethodAllowed("Germany", "postnl_parcel"), false);
  });

  it("rejects PostNL fulfilment actions for pickup orders", () => {
    assert.equal(usesPostnlFulfilment("local_pickup"), false);
    assert.equal(usesPostnlFulfilment("postnl_parcel"), true);
    assert.equal(usesPostnlFulfilment("postnl_international"), true);
  });
});
