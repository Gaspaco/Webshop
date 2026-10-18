import type { APIEvent } from "@solidjs/start/server";
import { searchCatalog } from "~/lib/catalog-search.server";

// Type-ahead suggestions for the search bars.
export async function GET(event: APIEvent) {
  const query = new URL(event.request.url).searchParams.get("q")?.trim().slice(0, 80) ?? "";
  if (query.length < 2) return Response.json({ results: [] });

  const results = await searchCatalog({ text: query });
  return Response.json(
    { results },
    { headers: { "Cache-Control": "public, max-age=30", "X-Content-Type-Options": "nosniff" } },
  );
}
