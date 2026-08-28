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
  variantName: string;
  sku: string;
  condition: string | null;
  language: string | null;
  finish: string | null;
  priceCents: number;
  stock: number;
  reservedStock: number;
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
  const availableStock = Math.max(product.stock - product.reservedStock, 0);

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
    stock: availableStock,
    variantId: product.variantId,
    sku: product.sku,
    variants: [
      {
        id: product.variantId,
        name: product.variantName,
        sku: product.sku,
        condition: product.condition ?? undefined,
        language: product.language ?? undefined,
        finish: product.finish ?? undefined,
        priceCents: product.priceCents,
        stock: availableStock,
      },
    ],
  };
}

export type DatabaseCatalogState = {
  products: ShopProduct[];
  managedSlugs: string[];
};

export async function fetchDatabaseCatalogState(
  slug?: string,
): Promise<DatabaseCatalogState> {
  const query = slug ? `?slug=${encodeURIComponent(slug)}` : "";
  const response = await fetch(`/api/catalog/products${query}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return { products: [], managedSlugs: [] };
  const data = (await response.json()) as {
    products: DatabaseCatalogProduct[];
    managedSlugs?: string[];
  };
  const grouped = new Map<string, ShopProduct>();
  for (const databaseProduct of data.products) {
    const mapped = databaseProductToShopProduct(databaseProduct);
    const existing = grouped.get(mapped.id);
    if (!existing) {
      grouped.set(mapped.id, mapped);
      continue;
    }

    const variants = [...(existing.variants ?? []), ...(mapped.variants ?? [])];
    const firstAvailable = variants.find(variant => variant.stock > 0) ?? variants[0];
    grouped.set(mapped.id, {
      ...existing,
      priceCents: Math.min(...variants.map(variant => variant.priceCents)),
      stock: variants.reduce((total, variant) => total + variant.stock, 0),
      variantId: firstAvailable?.id,
      sku: firstAvailable?.sku,
      condition: firstAvailable?.condition,
      language: firstAvailable?.language,
      finish: firstAvailable?.finish,
      variants,
    });
  }
  return {
    products: [...grouped.values()],
    managedSlugs: data.managedSlugs ?? data.products.map(product => product.slug),
  };
}

export async function fetchDatabaseCatalog(slug?: string) {
  return (await fetchDatabaseCatalogState(slug)).products;
}
