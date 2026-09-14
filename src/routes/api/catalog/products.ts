import type { APIEvent } from "@solidjs/start/server";
import { loadDatabaseCatalogRows } from "~/lib/catalog-query.server";

export async function GET(event: APIEvent) {
  const url = new URL(event.request.url);
  const slug = url.searchParams.get("slug")?.trim();
  const availableOnly = url.searchParams.get("available") === "1";
  const requestedLimit = Number.parseInt(url.searchParams.get("limit") ?? "500", 10);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 500)
    : 500;
  const catalog = await loadDatabaseCatalogRows({
    slug,
    available: availableOnly,
    limit,
  });

  return Response.json(
    {
      products: catalog.products,
      managedSlugs: catalog.managedSlugs,
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
