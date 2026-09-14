import type { APIEvent } from "@solidjs/start/server";
import { and, asc, desc, eq, gt, inArray } from "drizzle-orm";
import { db } from "~/db";
import { products, productVariants } from "~/db/schema";

export async function GET(event: APIEvent) {
  const url = new URL(event.request.url);
  const slug = url.searchParams.get("slug")?.trim();
  const availableOnly = url.searchParams.get("available") === "1";
  const requestedLimit = Number.parseInt(url.searchParams.get("limit") ?? "500", 10);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 500)
    : 500;
  const productWhere = and(
    eq(products.status, "active"),
    slug ? eq(products.slug, slug) : undefined,
  );
  const where = and(
    productWhere,
    availableOnly ? gt(productVariants.stock, productVariants.reservedStock) : undefined,
  );

  // Limit catalogue *products*, not joined variant rows. A product can have
  // many variants, so limiting the join hid later products (especially large
  // singles imports) even though those products were active in the database.
  const publicProducts = await db
    .selectDistinct({ id: products.id, createdAt: products.createdAt })
    .from(products)
    .innerJoin(productVariants, eq(productVariants.productId, products.id))
    .where(where)
    .orderBy(asc(products.createdAt))
    .limit(slug ? 1 : limit);
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
      .limit(slug ? 1 : 1000),
  ]);

  return Response.json(
    {
      products: rows,
      managedSlugs: managedRows.map(product => product.slug),
    },
    {
      headers: {
        // Catalogue edits need to appear immediately. Caching this endpoint
        // caused recently replaced images and slugs to remain visible after an
        // owner saved a product in the dashboard.
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
