import type { APIEvent } from "@solidjs/start/server";
import { searchCatalog } from "~/lib/catalog-search.server";
import { limitCatalogRead } from "~/lib/catalog-rate-limit.server";
import { safeApiResponse } from "~/lib/request-security.server";

// Type-ahead suggestions for the search bars.
export async function GET(event: APIEvent) {
  return safeApiResponse(async () => {
  const query = new URL(event.request.url).searchParams.get("q")?.trim().slice(0, 80) ?? "";
  if (query.length < 2) return Response.json({ results: [] });
  const limited = await limitCatalogRead(event, "search");
  if (limited) return limited;

  const results = await searchCatalog({ text: query });
  return Response.json(
    { results },
    { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } },
  );
  });
}
