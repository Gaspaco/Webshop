import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ADDRESS_COUNTRIES, countryFlag, filterCountries, matchCountry } from "./countries";
import { findShippingDestination } from "./shipping";

describe("address country search", () => {
  it("uses unique supported shipping destinations in alphabetical order", () => {
    assert.equal(new Set(ADDRESS_COUNTRIES.map(country => country.code)).size, ADDRESS_COUNTRIES.length);
    assert.deepEqual(filterCountries(""), ADDRESS_COUNTRIES);
    for (const country of ADDRESS_COUNTRIES) assert.equal(findShippingDestination(country.name)?.code, country.code);
    assert.equal(ADDRESS_COUNTRIES[0]?.name, "Austria");
  });
  it("matches names, country codes, and common aliases case-insensitively", () => {
    assert.ok(filterCountries("nether").some(country => country.code === "NL"));
    assert.equal(matchCountry(" nl ")?.name, "Netherlands");
    assert.equal(matchCountry("Nederland")?.code, "NL");
    assert.equal(matchCountry("uk")?.name, "United Kingdom");
    assert.ok(filterCountries("Czech Republic").some(country => country.code === "CZ"));
    assert.deepEqual(filterCountries("not-a-country"), []);
    assert.equal(matchCountry("Neth"), undefined);
    assert.equal(matchCountry(""), undefined);
  });
  it("creates flags only for two-letter uppercase codes", () => {
    assert.equal(countryFlag("NL"), "🇳🇱");
    assert.equal(countryFlag("GB"), "🇬🇧");
    assert.equal(countryFlag("Netherlands"), "");
  });
});
