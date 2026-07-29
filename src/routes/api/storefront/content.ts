import type { APIEvent } from "@solidjs/start/server";
import { eq } from "drizzle-orm";
import { db } from "~/db";
import { storefrontContent } from "~/db/schema";

export async function GET(_event: APIEvent) {
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
      },
    },
  );
}
