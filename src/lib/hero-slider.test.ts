import assert from "node:assert/strict";
import { it } from "node:test";
import { heroProductCopy, heroSlideIndex, heroSlideKey } from "./hero-slider";

it("the hero uses the actual product title and a short plain-text preview without editing source data", () => {
  const product = { name: "Magnificent Maestros Booster Box", gameName: "Yu-Gi-Oh!", description: `<p>${"A long product description. ".repeat(100)}</p>` };
  const original = { ...product };
  const copy = heroProductCopy(product);
  assert.equal(copy.title, product.name);
  assert.ok(copy.blurb.length <= 220);
  assert.ok(copy.blurb.endsWith("…"));
  assert.ok(!copy.blurb.includes("<p>"));
  assert.deepEqual(product, original);
  assert.equal(heroProductCopy({ name: "Box", gameName: "Pokémon", description: " \n " }).blurb, "Available now from our Pokémon catalogue.");
});

it("slider navigation wraps in both directions and handles keyboard controls", () => {
  assert.equal(heroSlideIndex(4, 1, 5), 0);
  assert.equal(heroSlideIndex(0, -1, 5), 4);
  assert.equal(heroSlideIndex(2, 1, 0), 0);
  assert.equal(heroSlideKey("ArrowRight", 4, 5), 0);
  assert.equal(heroSlideKey("ArrowLeft", 0, 5), 4);
  assert.equal(heroSlideKey("Home", 4, 5), 0);
  assert.equal(heroSlideKey("End", 0, 5), 4);
  assert.equal(heroSlideKey("Tab", 0, 5), undefined);
});
