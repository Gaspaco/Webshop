import type { APIEvent } from "@solidjs/start/server";
import { loadDatabaseCatalogRows } from "~/lib/catalog-query.server";

export async function GET(event: APIEvent) {
  const url = new URL(event.request.url);
  const slug = url.searchParams.get("slug")?.trim();
  const availableOnly = url.searchParams.get("available") === "1";
  const requestedLimit = Number.parseInt(url.searchParams.get("limit") ?? "200", 10);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 500)
    : 200;
  const requestedOffset = Number.parseInt(url.searchParams.get("offset") ?? "0", 10);
  const offset = Number.isFinite(requestedOffset)
    ? Math.min(Math.max(requestedOffset, 0), 100_000)
    : 0;
  const catalog = await loadDatabaseCatalogRows({
    slug,
    available: availableOnly,
    limit,
    offset,
    includeManagedSlugs: false,
  });

  const compactProducts = catalog.products.map(product => ({
    ...product,
    imageUrls: product.imageUrls.length
      ? [`/api/catalog/image?product=${encodeURIComponent(product.id)}`]
      : [],
    variantImageUrl: product.variantImageUrl
      ? `/api/catalog/image?variant=${encodeURIComponent(product.variantId)}`
      : null,
  }));

  return Response.json(
    {
      products: compactProducts,
      managedSlugs: [...new Set(compactProducts.map(product => product.slug))],
      hasMore: catalog.hasMore,
      nextOffset: catalog.hasMore ? offset + limit : null,
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
