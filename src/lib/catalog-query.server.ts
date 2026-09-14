import { and, asc, desc, eq, gt, inArray } from "drizzle-orm";
import { db } from "~/db";
import { products, productVariants } from "~/db/schema";
import type { DatabaseCatalogProduct } from "~/lib/catalog";

export type CatalogQueryOptions = {
  slug?: string;
  available?: boolean;
  limit?: number;
};

export async function loadDatabaseCatalogRows(
  options: CatalogQueryOptions = {},
): Promise<{ products: DatabaseCatalogProduct[]; managedSlugs: string[] }> {
  const limit = Math.min(Math.max(options.limit ?? 500, 1), 500);
  const productWhere = and(
    eq(products.status, "active"),
    options.slug ? eq(products.slug, options.slug) : undefined,
  );
  const where = and(
    productWhere,
    options.available
      ? gt(productVariants.stock, productVariants.reservedStock)
      : undefined,
  );

  const publicProducts = await db
    .selectDistinct({ id: products.id, createdAt: products.createdAt })
    .from(products)
    .innerJoin(productVariants, eq(productVariants.productId, products.id))
    .where(where)
    .orderBy(asc(products.createdAt))
    .limit(options.slug ? 1 : limit);
  const publicProductIds = publicProducts.map(product => product.id);

  const [rows, managedRows] = await Promise.all([
    publicProductIds.length
      ? db
          .select({
            id: products.id,
            slug: products.slug,
            name: products.name,
            description: products.description,
            game: products.game,
            productType: products.productType,
            imageUrls: products.imageUrls,
            metadata: products.metadata,
            variantId: productVariants.id,
            variantName: productVariants.name,
            sku: productVariants.sku,
            condition: productVariants.condition,
            language: productVariants.language,
            finish: productVariants.finish,
            variantImageUrl: productVariants.imageUrl,
            isDefault: productVariants.isDefault,
            priceCents: productVariants.priceCents,
            compareAtPriceCents: productVariants.compareAtPriceCents,
            stock: productVariants.stock,
            reservedStock: productVariants.reservedStock,
          })
          .from(products)
          .innerJoin(productVariants, eq(productVariants.productId, products.id))
          .where(inArray(products.id, publicProductIds))
          .orderBy(
            asc(products.createdAt),
            desc(productVariants.isDefault),
            asc(productVariants.createdAt),
          )
      : Promise.resolve([]),
    db
      .select({ slug: products.slug })
      .from(products)
      .where(productWhere)
      .limit(options.slug ? 1 : 1000),
  ]);

  return {
    products: rows,
    managedSlugs: managedRows.map(product => product.slug),
  };
}
