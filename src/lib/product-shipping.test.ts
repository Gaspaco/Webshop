import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { it } from "node:test";
import { calculateShipment, DEFAULT_SHIPPING_SETTINGS, productShipping, productShippingSchema, shipmentQuotes, shippingSettingsSchema } from "./product-shipping";
import { DEFAULT_STORE_PROFILE } from "./store-profile";

it("pools single quantities across products and applies editable boundary weights once", () => {
  const settings = structuredClone(DEFAULT_SHIPPING_SETTINGS);
  const single = (quantity: number) => ({ productType: "single", quantity });
  assert.equal(calculateShipment([single(1)], settings).productWeightGrams, 20);
  assert.equal(calculateShipment([single(4), single(6)], settings).weightGrams, 40);
  const eleven = calculateShipment([single(6), single(5)], settings);
  assert.equal(eleven.productWeightGrams, 50); assert.equal(eleven.singlesQuantity, 11);
  settings.singlesTiers = [{ maxQuantity: 5, weightGrams: 25 }, { maxQuantity: null, weightGrams: 80 }];
  assert.equal(calculateShipment([single(6)], settings).weightGrams, 100);
  assert.throws(() => calculateShipment([single(-1)], settings));
});

it("combines sealed quantities and packaging with editable screenshot presets and per-product overrides", () => {
  const box = DEFAULT_SHIPPING_SETTINGS.presets.find(row => row.id === "mtg-box")!;
  assert.equal(box.weightGrams, 1100); assert.equal(box.lengthCm, 21);
  const shipment = calculateShipment([{ productType: "sealed", quantity: 2, shipping: box }, { productType: "single", quantity: 10 }], DEFAULT_SHIPPING_SETTINGS);
  assert.equal(shipment.weightGrams, 2240); assert.equal(shipment.productWeightGrams, 2220);
  assert.equal(shipment.lengthCm, 22); assert.equal(shipment.widthCm, 17.3); assert.equal(shipment.heightCm, 14);
  assert.equal(shipment.estimated, false);
  const override = calculateShipment([{ productType: "sealed", quantity: 1, shipping: { ...box, weightGrams: 900, heightCm: 9 } }], DEFAULT_SHIPPING_SETTINGS);
  assert.equal(override.weightGrams, 920); assert.equal(override.heightCm, 10);
  assert.equal(DEFAULT_SHIPPING_SETTINGS.presets.find(row => row.id === "pokemon-etb")!.weightGrams, null);
  assert.equal(calculateShipment([{ productType: "sealed", quantity: 1 }], DEFAULT_SHIPPING_SETTINGS).estimated, true);
  assert.equal(calculateShipment([{ productType: "sealed", quantity: 1, shipping: { classId: "removed" } }], DEFAULT_SHIPPING_SETTINGS).estimated, true);
});

it("restricts letterbox and parcel quotes by dimensions and weight, even above the free shipping threshold", () => {
  const singles = calculateShipment([{ productType: "single", quantity: 10 }], DEFAULT_SHIPPING_SETTINGS);
  assert.ok(shipmentQuotes(singles, DEFAULT_STORE_PROFILE, "NL", 1000).some(row => row.value === "postnl_letterbox"));
  const box = DEFAULT_SHIPPING_SETTINGS.presets.find(row => row.id === "mtg-box")!;
  const shipment = calculateShipment([{ productType: "sealed", quantity: 1, shipping: box }], DEFAULT_SHIPPING_SETTINGS);
  const quotes = shipmentQuotes(shipment, DEFAULT_STORE_PROFILE, "NL", 1000);
  assert.equal(quotes.some(row => row.value === "postnl_letterbox"), false);
  assert.equal(quotes.find(row => row.value === "postnl_parcel")!.priceCents, DEFAULT_STORE_PROFILE.postnlSmallParcelCents);
  assert.equal(shipmentQuotes(shipment, DEFAULT_STORE_PROFILE, "NL", 30000).find(row => row.value === "postnl_parcel")!.priceCents, 0);
  const oversized = { ...shipment, weightGrams: 50000 };
  assert.deepEqual(shipmentQuotes(oversized, DEFAULT_STORE_PROFILE, "NL", 50000).map(row => row.value), ["local_pickup"]);
  assert.deepEqual(shipmentQuotes(oversized, DEFAULT_STORE_PROFILE, "BE", 50000), []);
});

it("supports configured parcel prices and international weight surcharges without inventing live carrier quotes", () => {
  const profile = structuredClone(DEFAULT_STORE_PROFILE);
  profile.shippingSettings.parcelBands[0]!.priceCents = 777;
  profile.shippingSettings.internationalBands = [{ weightGrams: 1000, surchargeCents: 100 }, { weightGrams: 2000, surchargeCents: 250 }];
  const shipment = calculateShipment([{ productType: "single", quantity: 1 }], profile.shippingSettings);
  assert.equal(shipmentQuotes(shipment, profile, "NL", 1000).find(row => row.value === "postnl_parcel")!.priceCents, 777);
  assert.equal(shipmentQuotes(shipment, profile, "BE", 1000)[0]!.priceCents, 1095);
  assert.deepEqual(shipmentQuotes({ ...shipment, weightGrams: 2001 }, profile, "BE", 1000), []);
  assert.deepEqual(shipmentQuotes(shipment, profile, "not-a-country", 1000), []);
});

it("rejects invalid measurements, duplicate configuration IDs and incomplete quantity rules", () => {
  for (const input of [{ weightGrams: -1 }, { heightCm: 0 }, { lengthCm: Infinity }, { widthCm: 301 }]) assert.equal(productShippingSchema.safeParse(input).success, false);
  assert.equal(productShipping({}).classId, "auto");
  const settings = structuredClone(DEFAULT_SHIPPING_SETTINGS);
  settings.classes.push(settings.classes[0]!);
  assert.equal(shippingSettingsSchema.safeParse(settings).success, false);
  settings.classes.pop(); settings.singlesTiers.pop();
  assert.equal(shippingSettingsSchema.safeParse(settings).success, false);
});

it("verifies shipping, wallet accounting and payment recovery against isolated PostgreSQL with mocked providers", { timeout: 45000 }, () => {
  const output = execFileSync("bun", ["--no-env-file", "scripts/shipping-wallet-integration.ts"], {
    env: { ...process.env, TCG_SHIPPING_WALLET_TEST: "1" }, encoding: "utf8", timeout: 40000,
  });
  assert.ok(output.includes("SHIPPING WALLET INTEGRATION PASSED"));
});
