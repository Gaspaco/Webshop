import { and, asc, eq, or, sql } from "drizzle-orm";
import { db } from "~/db";
import { categories, products, productVariants } from "~/db/schema";
import {
  inventoryCsvLine, inventoryExportFilename, inventoryExportHeaders, inventoryExportValues,
  type InventoryExportOptions,
} from "./inventory-export";
import { logServerError } from "./server-log";

function scopeFilter(scope: InventoryExportOptions["scope"]) {
  const type = sql<string>`lower(trim(coalesce(${products.productType}, '')))`;
  // Expansion membership (metadata.set/setCode) is not a complete set product.
  // Explicit sealed products remain sealed, even inside a category named Sets.
  const set = sql<boolean>`(${type} <> 'sealed' and (
    ${type} in ('set', 'sets') or
    lower(trim(coalesce(${categories.slug}, ''))) in ('set', 'sets', 'complete-sets', 'complete-card-sets') or
    lower(trim(coalesce(${categories.name}, ''))) in ('set', 'sets', 'complete sets', 'complete card sets')
  ))`;
  const single = and(eq(type, "single"), sql`not ${set}`);
  switch (scope) {
    case "singles": return single;
    case "sealed": return eq(type, "sealed");
    case "sets": return set;
    case "singles-and-sets": return or(single, set);
    case "all": return undefined;
  }
}

export async function inventoryExportResponse(options: InventoryExportOptions, signal?: AbortSignal) {
  // Fetch bounded pages, especially when images are stored as large data URIs.
  // Image columns are not even selected unless explicitly requested.
  const limit = options.images ? 16 : 500;
  const page = (offset: number) => db.select({
    name: products.name, slug: products.slug, game: products.game, type: products.productType,
    status: products.status, sku: productVariants.sku, condition: productVariants.condition,
    language: productVariants.language, priceCents: productVariants.priceCents,
    stock: productVariants.stock, reserved: productVariants.reservedStock,
    ...(options.images ? { imageUrls: products.imageUrls, variantImage: productVariants.imageUrl } : {}),
  }).from(products)
    .leftJoin(productVariants, eq(productVariants.productId, products.id))
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(scopeFilter(options.scope))
    .orderBy(asc(products.id), asc(productVariants.id)).limit(limit).offset(offset);

  // Surface initial database failures as a normal API error, not a CSV download.
  let rows = await page(0);
  let offset = 0;
  let finished = false;
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(encoder.encode(inventoryCsvLine(inventoryExportHeaders(options.images)))); },
    async pull(controller) {
      if (finished || signal?.aborted) { controller.close(); return; }
      try {
        controller.enqueue(encoder.encode(rows.map(row => inventoryCsvLine(inventoryExportValues(row, options.images))).join("")));
        if (rows.length < limit) { finished = true; controller.close(); return; }
        offset += rows.length;
        rows = await page(offset);
      } catch (error) {
        finished = true;
        logServerError("Inventory CSV export failed.", error);
        controller.error(new Error("The export was interrupted. Please download it again."));
      }
    },
    cancel() { finished = true; rows = []; },
  });
  return new Response(body, { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${inventoryExportFilename(options)}"`,
    "Cache-Control": "private, no-store",
    "CDN-Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  } });
}
