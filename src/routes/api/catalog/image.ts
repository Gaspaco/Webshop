import { and, asc, desc, eq, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import type { APIEvent } from "@solidjs/start/server";
import { db } from "~/db";
import { products, productVariants } from "~/db/schema";
import { safeApiResponse } from "~/lib/request-security.server";
import { allowedProductImageSource } from "~/lib/product-image-cache.server";
import { productImagePath } from "~/lib/product-image-path";

const DATA_IMAGE = /^data:(image\/(?:png|jpeg|webp|gif));base64,([a-zA-Z0-9+/]+={0,2})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Recheck publication on every request. Otherwise a cached image can remain
// accessible after the owner unpublishes it. External image storage has its
// own lifecycle; this endpoint does not promise to revoke external URLs.
const imageHeaders = {
  "Cache-Control": "private, no-store",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
const notFound = () => new Response("Image not found", { status: 404, headers: imageHeaders });

function imageResponse(value: string | null | undefined, requestUrl: string, namedPath?: string) {
  if (!value) return notFound();

  const dataImage = DATA_IMAGE.exec(value);
  if (dataImage) {
    return new Response(Buffer.from(dataImage[2], "base64"), {
      headers: {
        ...imageHeaders,
        "Content-Type": dataImage[1],
      },
    });
  }

  try {
    if (namedPath && (allowedProductImageSource(value) || value.startsWith("/card-images/yugipedia/"))) {
      return new Response(null, { status: 302, headers: { ...imageHeaders, Location: namedPath } });
    }
    const target = new URL(value, requestUrl);
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      throw new Error("Unsupported image protocol");
    }
    return new Response(null, { status: 302, headers: { ...imageHeaders, Location: target.toString() } });
  } catch {
    return notFound();
  }
}

export async function GET(event: APIEvent) {
  return safeApiResponse(async () => {
    const url = new URL(event.request.url);
    const productId = url.searchParams.get("product")?.trim();
    const variantId = url.searchParams.get("variant")?.trim();

    if (variantId) {
      if (!UUID.test(variantId)) {
        return new Response("Invalid variant", { status: 400, headers: imageHeaders });
      }
      const rows = await db
        .select({ image: productVariants.imageUrl, sku: productVariants.sku })
        .from(productVariants)
        .innerJoin(products, eq(productVariants.productId, products.id))
        .where(and(eq(productVariants.id, variantId), eq(products.status, "active")))
        .limit(1);
      const row = rows[0];
      return imageResponse(row?.image, event.request.url, row?.image
        ? productImagePath(row.sku, "v", variantId, createHash("md5").update(row.image).digest("hex")) : undefined);
    }

    if (productId) {
      if (!UUID.test(productId)) {
        return new Response("Invalid product", { status: 400, headers: imageHeaders });
      }
      const index = Number(url.searchParams.get("image") ?? 0);
      if (!Number.isSafeInteger(index) || index < 0 || index > 100) return notFound();
      const rows = await db
        .select({ image: sql<string | null>`${products.imageUrls} ->> ${index}::int`, sku: sql<string>`coalesce(${productVariants.sku}, ${products.slug})` })
        .from(products)
        .leftJoin(productVariants, eq(productVariants.productId, products.id))
        .where(and(eq(products.id, productId), eq(products.status, "active")))
        .orderBy(desc(productVariants.isDefault), asc(productVariants.createdAt), asc(productVariants.id))
        .limit(1);
      const row = rows[0];
      return imageResponse(row?.image, event.request.url, row?.image
        ? productImagePath(row.sku, "p", productId, createHash("md5").update(row.image).digest("hex"), index) : undefined);
    }

    return new Response("Product or variant is required", { status: 400, headers: imageHeaders });
  });
}
