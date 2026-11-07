import type { APIEvent } from "@solidjs/start/server";
import { eq, sql } from "drizzle-orm";
import { db } from "~/db";
import { productImageCache, productImageCacheUsage } from "~/db/schema";
import { apiJson, requireAdmin } from "~/lib/admin.server";
import { productImageCacheLimit } from "~/lib/product-image-cache.server";
import { safeApiResponse } from "~/lib/request-security.server";

export async function GET(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;
  return safeApiResponse(async () => {
    const [images] = await db.select({ count: sql<number>`count(*)::int` }).from(productImageCache);
    const [usage] = await db.select({ bytes: productImageCacheUsage.bytes }).from(productImageCacheUsage).where(eq(productImageCacheUsage.key, "catalogue")).limit(1);
    const usedBytes = usage?.bytes ?? 0;
    const limitBytes = productImageCacheLimit();
    return apiJson({ images: images?.count ?? 0, usedBytes, limitBytes, full: usedBytes >= limitBytes,
      mode: "database", population: "on first view of a published product image" });
  });
}
