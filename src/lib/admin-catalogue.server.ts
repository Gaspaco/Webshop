import { asc, desc, inArray } from "drizzle-orm";
import { db } from "~/db";
import { products, productVariants } from "~/db/schema";
import { adminProductImages, adminVariantImage, embeddedProductImageCount, variantHasEmbeddedImage } from "~/lib/admin-images.server";

/** Images stay in PostgreSQL. Each paged HTTP response contains only handles. */
export async function loadAdminCatalogue(options: { limit?: number; offset?: number } = {}) {
  const limit = options.limit === undefined ? undefined : Math.min(100, Math.max(1, options.limit));
  const pageIds = limit === undefined ? undefined : db.select({ id: products.id }).from(products)
    .orderBy(desc(products.updatedAt), desc(products.id)).limit(limit + 1).offset(options.offset ?? 0);
  const productRows = await db.select({
    id: products.id, name: products.name, slug: products.slug, description: products.description,
    brand: products.brand, game: products.game, productType: products.productType, status: products.status,
    imageUrls: adminProductImages, embeddedImages: embeddedProductImageCount, metadata: products.metadata,
    createdAt: products.createdAt, updatedAt: products.updatedAt,
  }).from(products).where(pageIds ? inArray(products.id, pageIds) : undefined)
    .orderBy(desc(products.updatedAt), desc(products.id));
  const hasMore = limit !== undefined && productRows.length > limit;
  const page = limit === undefined ? productRows : productRows.slice(0, limit);
  const ids = page.map(product => product.id);
  const variants = ids.length ? await db.select({
    id: productVariants.id, productId: productVariants.productId, sku: productVariants.sku, barcode: productVariants.barcode,
    name: productVariants.name, condition: productVariants.condition, language: productVariants.language,
    finish: productVariants.finish, imageUrl: adminVariantImage, embeddedImage: variantHasEmbeddedImage,
    isDefault: productVariants.isDefault, priceCents: productVariants.priceCents,
    compareAtPriceCents: productVariants.compareAtPriceCents, cardmarketProductId: productVariants.cardmarketProductId,
    cardmarketPriceType: productVariants.cardmarketPriceType, stock: productVariants.stock,
    reservedStock: productVariants.reservedStock, trackInventory: productVariants.trackInventory,
  }).from(productVariants).where(inArray(productVariants.productId, ids))
    .orderBy(desc(productVariants.isDefault), asc(productVariants.createdAt), asc(productVariants.id)) : [];
  type Variant = Omit<(typeof variants)[number], "productId" | "embeddedImage">;
  const grouped = new Map<string, Variant[]>();
  for (const { productId, embeddedImage: _embedded, ...variant } of variants) {
    const group = grouped.get(productId) ?? [];
    group.push(variant); grouped.set(productId, group);
  }
  const catalogue = page.map(({ embeddedImages: _embedded, ...product }) => {
    const group = grouped.get(product.id) ?? [];
    const first = group[0];
    return { ...product, variantId: first?.id ?? null, sku: first?.sku ?? null,
      barcode: first?.barcode ?? null, variantName: first?.name ?? null, condition: first?.condition ?? null,
      language: first?.language ?? null, finish: first?.finish ?? null, variantImageUrl: first?.imageUrl ?? null,
      isDefault: first?.isDefault ?? false, priceCents: first?.priceCents ?? null,
      compareAtPriceCents: first?.compareAtPriceCents ?? null, stock: first?.stock ?? null,
      reservedStock: first?.reservedStock ?? null, trackInventory: first?.trackInventory ?? true,
      cardmarketProductId: first?.cardmarketProductId ?? null, cardmarketPriceType: first?.cardmarketPriceType ?? "normal",
      variants: group };
  });
  return { products: catalogue, hasMore, nextOffset: hasMore ? (options.offset ?? 0) + limit! : null,
    embeddedImageCount: page.reduce((count, product) => count + Number(product.embeddedImages), 0) + variants.filter(variant => variant.embeddedImage).length };
}
