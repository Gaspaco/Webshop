import assert from "node:assert/strict";
import { it } from "node:test";
import { printingAlreadyListed } from "./yugipedia-import";

it("printing identity includes the set number and rarity, not just the card or expansion name", () => {
  const printing = { setName: "Magnificent Maestros", setCode: "MAMS-EN125", rarity: "Ultra Rare" };
  const variant = { name: "Magnificent Maestros · Ultra Rare", sku: "YGO-1-MAMS-EN100-ULTRA-RARE", finish: "Ultra Rare", attributes: { setCode: "MAMS-EN100" } };
  assert.equal(printingAlreadyListed(printing, [variant]), false);
  assert.equal(printingAlreadyListed(printing, [{ ...variant, attributes: { setCode: "MAMS-EN125" } }]), true);
  assert.equal(printingAlreadyListed({ ...printing, rarity: "Starlight Rare" }, [{ ...variant, attributes: { setCode: "MAMS-EN125" } }]), false);
  assert.equal(printingAlreadyListed(printing, [{ ...variant, sku: "YGO-1-MAMS-EN125-ULTRA-RARE", attributes: {} }]), true);
});
