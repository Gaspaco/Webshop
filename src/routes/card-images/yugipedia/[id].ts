import type { APIEvent } from "@solidjs/start/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import { yugiohPrintings } from "~/db/schema";
import { serveYugipediaImage } from "~/lib/yugipedia-image.server";

const printingIdSchema = z.string().uuid();

export async function GET(event: APIEvent) {
  const parsedId = printingIdSchema.safeParse(event.params.id);
  if (!parsedId.success) return new Response(null, { status: 404 });
  return serveYugipediaImage(event, async () => {
    const [printing] = await db
      .select({
        sourceUrl: yugiohPrintings.imageSourceUrl,
        provider: yugiohPrintings.imageProvider,
      })
      .from(yugiohPrintings)
      .where(eq(yugiohPrintings.id, parsedId.data))
      .limit(1);

    return printing?.provider === "yugipedia" ? printing.sourceUrl : null;
  }, 12_000_000);
}
