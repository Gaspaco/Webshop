/** The shared catalogue contract. Add a type here to extend forms and CSV templates. */
export type AttributeField = { key: string; label: string; placeholder?: string; variation?: boolean };
const field = (key: string, label: string, variation = false): AttributeField => ({ key, label, variation });
const accessoryFields = [field("colour", "Colour", true), field("size", "Size", true), field("material", "Material")];
const figureFields = [field("series", "Series"), field("character", "Character", true), field("scale", "Scale", true), field("material", "Material"), field("edition", "Edition", true)];
export const PRODUCT_TYPES = [
  { value: "single", label: "Single cards", group: "Trading card games", game: true, fields: [field("cardType", "Card type")] },
  { value: "sealed", label: "Sealed products", group: "Trading card games", game: true, fields: [field("format", "Product format", true)] },
  { value: "graded", label: "Graded cards", group: "Trading card games", game: true, fields: [field("cardType", "Card type")] },
  { value: "set", label: "Complete card sets", group: "Trading card games", game: true, fields: [field("cardCount", "Number of cards")] },
  { value: "accessory", label: "Accessories", group: "Accessories", game: false, fields: accessoryFields },
  { value: "figurine", label: "Figurines", group: "Figurines", game: false, fields: figureFields },
  { value: "collectible", label: "Collectibles", group: "Collectibles", game: false, fields: [field("collectibleType", "Collectible type"), field("collection", "Collection"), field("character", "Character", true), field("edition", "Edition", true), field("material", "Material")] },
  { value: "merchandise", label: "Merchandise", group: "Merchandise", game: false, fields: [field("merchandiseType", "Merchandise type"), field("series", "Series"), ...accessoryFields] },
] as const satisfies ReadonlyArray<{ value: string; label: string; group: string; game: boolean; fields: readonly AttributeField[] }>;
export type ProductType = (typeof PRODUCT_TYPES)[number]["value"];
export type ProductAttributes = Record<string, string>;
export type AttributeFilterProduct = { attributes?: ProductAttributes; variants?: Array<{ attributes?: ProductAttributes }> };
export function matchesAttributeFilters(product: AttributeFilterProduct, filters: ProductAttributes) {
  // The selected values must occur on one actual variation, not separate options.
  const candidates = product.variants?.length ? product.variants : [{}];
  return candidates.some(variant => Object.entries(filters).every(([key, value]) => !value || (variant.attributes?.[key] || product.attributes?.[key]) === value));
}
export const PRODUCT_TYPE_VALUES = PRODUCT_TYPES.map(type => type.value) as [ProductType, ...ProductType[]];
export const PRODUCT_GAMES = ["pokemon", "yugioh", "magic", "lorcana", "riftbound", "digimon", "cyberpunk", "onepiece", "grandarchive", "vanguard", "other"] as const;
export function productTypeConfig(value: unknown) { return PRODUCT_TYPES.find(type => type.value === value); }
export function isTcgType(value: unknown) { return productTypeConfig(value)?.game === true; }
export function hasCardFields(value: unknown) { return value === "single" || value === "graded"; }
export function variationFields(value: unknown): AttributeField[] {
  return [...(isTcgType(value) ? [field("setName", "Printing set", true), field("setCode", "Printing set code", true)] : []),
    ...(productTypeConfig(value)?.fields ?? []).filter(field => field.variation)];
}
export function typeAttributes(type: unknown, value: unknown, variant = false): ProductAttributes {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: ProductAttributes = {};
  for (const field of variant ? variationFields(type) : productTypeConfig(type)?.fields ?? []) {
    if (variant && !field.variation) continue;
    const text = (value as Record<string, unknown>)[field.key];
    if (typeof text === "string" && text.trim()) result[field.key] = text.trim().slice(0, 160);
  }
  return result;
}
