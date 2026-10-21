import type { APIEvent } from "@solidjs/start/server";
import { eq } from "drizzle-orm";
import { db } from "~/db";
import { yugiohCards } from "~/db/schema";
import { serveYugipediaImage } from "~/lib/yugipedia-image.server";

export async function GET(event: APIEvent) {
  const id = Number(event.params.id);
  if (!Number.isSafeInteger(id) || !id || Math.abs(id) > 2147483647) return new Response(null, { status: 404 });
  return serveYugipediaImage(event, async () => {
    const [card] = await db.select({ url: yugiohCards.imageSourceUrl }).from(yugiohCards).where(eq(yugiohCards.id, id)).limit(1);
    return card?.url;
  });
}
