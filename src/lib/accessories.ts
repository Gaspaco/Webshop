export const ACCESSORY_CATEGORIES = [
  { slug: "sleeves", name: "Sleeves" },
  { slug: "deck-boxes", name: "Deck Boxes" },
  { slug: "binders", name: "Binders" },
  { slug: "playmats", name: "Playmats" },
  { slug: "other-accessories", name: "Other accessories" },
] as const;

export type AccessoryCategory = (typeof ACCESSORY_CATEGORIES)[number]["slug"];
export const ACCESSORY_BRANDS = ["Dragon Shield", "Ultra PRO"] as const;

export function accessoryCategory(value: unknown): AccessoryCategory {
  const slug = typeof value === "string" ? value.replace(/^accessories-/, "") : "";
  return ACCESSORY_CATEGORIES.find(category => category.slug === slug)?.slug ?? "other-accessories";
}

export function accessoryCategoryName(value: unknown) {
  return ACCESSORY_CATEGORIES.find(category => category.slug === accessoryCategory(value))!.name;
}

export function accessoryBrand(value: string) {
  const trimmed = value.trim();
  return ACCESSORY_BRANDS.find(brand => brand.toLowerCase() === trimmed.toLowerCase()) ?? trimmed;
}

export function accessoryShopUrl(category?: string, brand?: string) {
  const params = new URLSearchParams({ type: "accessory" });
  if (category) params.set("category", accessoryCategory(category));
  if (brand) params.set("brand", brand);
  return `/products?${params}`;
}
