import type { ShopProduct } from "~/lib/categories";

export type DatabaseCatalogProduct = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  game: string | null;
  productType: string | null;
  imageUrls: string[];
  metadata: Record<string, unknown>;
  variantId: string;
  sku: string;
  condition: string | null;
  language: string | null;
  finish: string | null;
  priceCents: number;
  stock: number;
};

const gameNames: Record<string, string> = {
  pokemon: "Pokémon",
  yugioh: "Yu-Gi-Oh!",
  magic: "Magic: The Gathering",
  other: "Other",
};

export function databaseProductToShopProduct(
  product: DatabaseCatalogProduct,
): ShopProduct {
  const game =
    product.game === "pokemon" ||
    product.game === "yugioh" ||
    product.game === "magic"
      ? product.game
      : "pokemon";
  const metadata = product.metadata ?? {};

  return {
    id: product.slug,
    name: product.name,
    set: typeof metadata.set === "string" ? metadata.set : undefined,
    image: product.imageUrls[0] || undefined,
    theme: game,
    priceCents: product.priceCents,
    rating:
      typeof metadata.rating === "number" ? metadata.rating : undefined,
    href: `/products/${product.slug}`,
    badge: typeof metadata.badge === "string" ? metadata.badge : undefined,
    game: product.game ?? "other",
    gameName: gameNames[product.game ?? "other"] ?? "Other",
    description: product.description ?? undefined,
    productType: product.productType ?? undefined,
    condition: product.condition ?? undefined,
    language: product.language ?? undefined,
    finish: product.finish ?? undefined,
    cardNumber:
      typeof metadata.cardNumber === "string"
        ? metadata.cardNumber
        : undefined,
    rarity: typeof metadata.rarity === "string" ? metadata.rarity : undefined,
    setCode: typeof metadata.setCode === "string" ? metadata.setCode : undefined,
    illustrator:
      typeof metadata.illustrator === "string"
        ? metadata.illustrator
        : undefined,
    gradingCompany:
      typeof metadata.gradingCompany === "string"
        ? metadata.gradingCompany
        : undefined,
    grade: typeof metadata.grade === "string" ? metadata.grade : undefined,
    certificationNumber:
      typeof metadata.certificationNumber === "string"
        ? metadata.certificationNumber
        : undefined,
    stock: product.stock,
    variantId: product.variantId,
    sku: product.sku,
  };
}

export async function fetchDatabaseCatalog(slug?: string) {
  const query = slug ? `?slug=${encodeURIComponent(slug)}` : "";
  const response = await fetch(`/api/catalog/products${query}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return [];
  const data = (await response.json()) as {
    products: DatabaseCatalogProduct[];
  };
  return data.products.map(databaseProductToShopProduct);
}
