import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterSelectOptions, nextSelectOption } from "./select-options";

describe("searchable dark menus", () => {
  const options = [
    { value: "", label: "All sets" },
    { value: "onepiece:romance-dawn", label: "Romance Dawn", detail: "OP-01 · One Piece · 12 products" },
    { value: "pokemon:celebration", label: "Pokémon Celebration", detail: "30TH · 8 products" },
  ];
  it("finds set names, codes with or without punctuation, and accented names", () => {
    assert.equal(filterSelectOptions(options, "romance")[0]?.value, options[1]!.value);
    assert.equal(filterSelectOptions(options, "op01")[0]?.value, options[1]!.value);
    assert.equal(filterSelectOptions(options, "pokemon")[0]?.value, options[2]!.value);
    assert.equal(filterSelectOptions(options, "30th")[0]?.value, options[2]!.value);
    assert.equal(filterSelectOptions(options, "unknown").length, 0);
    assert.equal(filterSelectOptions(options, " ").length, 3);
  });
  it("keeps sold-out variations searchable without altering their availability", () => {
    const variants = [{ value: "rare", label: "Secret Rare", detail: "€12 · Out of stock", available: false }];
    assert.equal(filterSelectOptions(variants, "secret")[0]?.available, false);
  });
  it("supports keyboard wraparound and resets invalid positions after filtering", () => {
    assert.equal(nextSelectOption(-1, 3, 1), 0);
    assert.equal(nextSelectOption(-1, 3, -1), 2);
    assert.equal(nextSelectOption(2, 3, 1), 0);
    assert.equal(nextSelectOption(0, 3, -1), 2);
    assert.equal(nextSelectOption(12, 2, 1), 0);
    assert.equal(nextSelectOption(0, 0, 1), -1);
  });
});
