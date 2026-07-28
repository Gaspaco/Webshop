import type { APIEvent } from "@solidjs/start/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "~/db";
import { products, productVariants } from "~/db/schema";

export async function GET(event: APIEvent) {
  const url = new URL(event.request.url);
  const slug = url.searchParams.get("slug")?.trim();
  const where = slug
    ? and(eq(products.status, "active"), eq(products.slug, slug))
    : eq(products.status, "active");

  const rows = await db
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
      sku: productVariants.sku,
      condition: productVariants.condition,
      language: productVariants.language,
      priceCents: productVariants.priceCents,
      stock: productVariants.stock,
    })
    .from(products)
    .innerJoin(productVariants, eq(productVariants.productId, products.id))
    .where(where)
    .orderBy(asc(products.createdAt))
    .limit(slug ? 1 : 250);

  return Response.json(
    { products: rows },
    {
      headers: {
        "Cache-Control": "public, max-age=30, stale-while-revalidate=120",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
