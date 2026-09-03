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
  variantImageUrl: string | null;
  isDefault: boolean;
  priceCents: number;
  compareAtPriceCents: number | null;
  stock: number;
  reservedStock: number;
};

const gameNames: Record<string, string> = {
  pokemon: "Pokémon",
  yugioh: "Yu-Gi-Oh!",
  magic: "Magic: The Gathering",
  lorcana: "Disney Lorcana",
  riftbound: "Riftbound",
  digimon: "Digimon Card Game",
  cyberpunk: "Cyberpunk",
  other: "Other",
};

export function databaseProductToShopProduct(
  product: DatabaseCatalogProduct,
): ShopProduct {
  const game =
    product.game === "pokemon" ||
    product.game === "yugioh" ||
    product.game === "magic" ||
    product.game === "lorcana" ||
    product.game === "riftbound" ||
    product.game === "digimon" ||
    product.game === "cyberpunk"
      ? product.game
      : "pokemon";
  const productType =
    product.productType === "single" ||
    product.productType === "sealed" ||
    product.productType === "graded" ||
    product.productType === "accessory"
      ? product.productType
      : undefined;
  const metadata = product.metadata ?? {};
  const availableStock = Math.max(product.stock - product.reservedStock, 0);

  return {
    id: product.slug,
    name: product.name,
    set: typeof metadata.set === "string" ? metadata.set : undefined,
    image: product.imageUrls[0] || undefined,
    theme: game,
    priceCents: product.priceCents,
    compareAtPriceCents: product.compareAtPriceCents ?? undefined,
    rating:
      typeof metadata.rating === "number" ? metadata.rating : undefined,
    href: `/products/${product.slug}`,
    badge: typeof metadata.badge === "string" ? metadata.badge : undefined,
    game: product.game ?? "other",
    gameName: gameNames[product.game ?? "other"] ?? "Other",
    description: product.description ?? undefined,
    productType,
    condition: product.condition ?? undefined,
    language: product.language ?? undefined,
    finish: product.finish ?? undefined,
    cardNumber:
      typeof metadata.cardNumber === "string"
        ? metadata.cardNumber
        : undefined,
    rarity: typeof metadata.rarity === "string" ? metadata.rarity : undefined,
    setCode: typeof metadata.setCode === "string" ? metadata.setCode : undefined,
    trailerUrl:
      typeof metadata.trailerUrl === "string"
        ? metadata.trailerUrl
        : undefined,
    releaseDate:
      typeof metadata.releaseDate === "string"
        ? metadata.releaseDate
        : undefined,
    preorder: metadata.preorder === true,
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
    shipsFrom:
      typeof metadata.shipsFrom === "string" ? metadata.shipsFrom : undefined,
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
        image: product.variantImageUrl ?? undefined,
        isDefault: product.isDefault,
        priceCents: product.priceCents,
        compareAtPriceCents: product.compareAtPriceCents ?? undefined,
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
    cache: "no-store",
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
    const mainVariant =
      variants.find(variant => variant.isDefault) ??
      variants.find(variant => variant.stock > 0) ??
      variants[0];
    grouped.set(mapped.id, {
      ...existing,
      // The product image is the canonical catalogue artwork. A variant image
      // only replaces it when that variant explicitly has its own artwork.
      // Keeping the product fallback prevents an empty/stale variant field
      // from making an uploaded product image disappear.
      image: mainVariant?.image || existing.image,
      priceCents: mainVariant?.priceCents,
      compareAtPriceCents: mainVariant?.compareAtPriceCents,
      stock: variants.reduce((total, variant) => total + variant.stock, 0),
      variantId: mainVariant?.id,
      sku: mainVariant?.sku,
      condition: mainVariant?.condition,
      language: mainVariant?.language,
      finish: mainVariant?.finish,
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
