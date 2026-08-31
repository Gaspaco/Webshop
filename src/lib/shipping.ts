export const NETHERLANDS = {
  code: "NL",
  name: "Netherlands",
} as const;

export const INTERNATIONAL_POSTNL_DESTINATIONS = [
  { code: "BE", name: "Belgium", zone: "EUR 1", priceCents: 995 },
  { code: "DE", name: "Germany", zone: "EUR 1", priceCents: 995 },
  { code: "FR", name: "France", zone: "EUR 1", priceCents: 1095 },
  { code: "AT", name: "Austria", zone: "EUR 1", priceCents: 1095 },
  { code: "IT", name: "Italy", zone: "EUR 1", priceCents: 1095 },
  { code: "ES", name: "Spain", zone: "EUR 1", priceCents: 1095 },
  { code: "DK", name: "Denmark", zone: "EUR 1", priceCents: 1095 },
  { code: "SE", name: "Sweden", zone: "EUR 1", priceCents: 1195 },
  { code: "LU", name: "Luxembourg", zone: "EUR 1", priceCents: 995 },
  { code: "GR", name: "Greece", zone: "EUR 2", priceCents: 1395 },
  { code: "PL", name: "Poland", zone: "EUR 2", priceCents: 1295 },
  { code: "CZ", name: "Czechia", zone: "EUR 2", priceCents: 1295 },
  { code: "HU", name: "Hungary", zone: "EUR 2", priceCents: 1295 },
  { code: "RO", name: "Romania", zone: "EUR 2", priceCents: 1395 },
  { code: "PT", name: "Portugal", zone: "EUR 2", priceCents: 1395 },
  { code: "FI", name: "Finland", zone: "EUR 2", priceCents: 1395 },
  { code: "IE", name: "Ireland", zone: "EUR 2", priceCents: 1395 },
  { code: "HR", name: "Croatia", zone: "EUR 2", priceCents: 1395 },
  { code: "SK", name: "Slovakia", zone: "EUR 2", priceCents: 1295 },
  { code: "SI", name: "Slovenia", zone: "EUR 2", priceCents: 1295 },
  { code: "BG", name: "Bulgaria", zone: "EUR 2", priceCents: 1395 },
  { code: "EE", name: "Estonia", zone: "EUR 2", priceCents: 1395 },
  { code: "LV", name: "Latvia", zone: "EUR 2", priceCents: 1395 },
  { code: "LT", name: "Lithuania", zone: "EUR 2", priceCents: 1395 },
  { code: "CY", name: "Cyprus", zone: "EUR 2", priceCents: 1695 },
  { code: "MT", name: "Malta", zone: "EUR 2", priceCents: 1695 },
  { code: "GB", name: "United Kingdom", zone: "EUR 1", priceCents: 1595 },
  { code: "CH", name: "Switzerland", zone: "EUR 2", priceCents: 1595 },
  { code: "NO", name: "Norway", zone: "EUR 2", priceCents: 1595 },
] as const;

export type InternationalDestination =
  (typeof INTERNATIONAL_POSTNL_DESTINATIONS)[number];

export type InternationalPostnlRates = Record<string, number>;

export const DEFAULT_INTERNATIONAL_POSTNL_RATES: InternationalPostnlRates =
  Object.fromEntries(
    INTERNATIONAL_POSTNL_DESTINATIONS.map(destination => [
      destination.code,
      destination.priceCents,
    ]),
  );

export function findShippingDestination(country: string) {
  const normalized = country.trim().toLowerCase();
  if (
    normalized === NETHERLANDS.code.toLowerCase() ||
    normalized === NETHERLANDS.name.toLowerCase()
  ) {
    return NETHERLANDS;
  }

  return INTERNATIONAL_POSTNL_DESTINATIONS.find(
    destination =>
      destination.code.toLowerCase() === normalized ||
      destination.name.toLowerCase() === normalized ||
      (destination.code === "GB" && normalized === "uk"),
  );
}

export function getInternationalPostnlPrice(
  country: string,
  rates: InternationalPostnlRates,
) {
  const destination = findShippingDestination(country);
  if (!destination || destination.code === "NL") return null;
  return rates[destination.code] ?? destination.priceCents;
}
