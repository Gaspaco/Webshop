import type { APIEvent } from "@solidjs/start/server";
import { eq } from "drizzle-orm";
import { db } from "~/db";
import { storefrontContent } from "~/db/schema";

export async function GET(_event: APIEvent) {
  try {
    const [content] = await db
      .select({ value: storefrontContent.value })
      .from(storefrontContent)
      .where(eq(storefrontContent.key, "home"))
      .limit(1);

    return Response.json(
      {
        content: content?.value ?? null,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch {
    // Social links are optional storefront decoration. Keep public pages usable
    // while the database is temporarily unavailable, but do not cache the
    // fallback so the configured links return immediately after recovery.
    console.warn("Storefront content is temporarily unavailable; serving defaults.");
    return Response.json(
      { content: null, degraded: true },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  }
}
