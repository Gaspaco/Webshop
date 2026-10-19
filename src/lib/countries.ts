import { INTERNATIONAL_POSTNL_DESTINATIONS, NETHERLANDS } from "./shipping";

// Use the same destinations as checkout; saving an address must not imply that
// delivery to an unconfigured country is available.
export const ADDRESS_COUNTRIES = [NETHERLANDS, ...INTERNATIONAL_POSTNL_DESTINATIONS]
  .map(({ code, name }) => ({ code, name }))
  .sort((a, b) => a.name.localeCompare(b.name, "en"));

export type AddressCountry = (typeof ADDRESS_COUNTRIES)[number];

export function countryFlag(code: string) {
  if (!/^[A-Z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...[...code].map(char => 0x1f1e6 + char.charCodeAt(0) - 65));
}

function normalize(value: string) {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").trim().toLowerCase();
}

const aliases: Record<string, string[]> = {
  NL: ["Nederland", "Holland"],
  GB: ["UK", "Great Britain", "Britain"],
  CZ: ["Czech Republic"],
};

export function filterCountries(query: string) {
  const search = normalize(query);
  return ADDRESS_COUNTRIES.filter(country =>
    [country.name, country.code, ...(aliases[country.code] ?? [])]
      .some(value => normalize(value).includes(search)),
  );
}

export function matchCountry(value: string) {
  const search = normalize(value);
  return ADDRESS_COUNTRIES.find(country =>
    [country.name, country.code, ...(aliases[country.code] ?? [])]
      .some(candidate => normalize(candidate) === search),
  );
}
