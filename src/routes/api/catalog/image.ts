import { eq } from "drizzle-orm";
import type { APIEvent } from "@solidjs/start/server";
import { db } from "~/db";
import { products, productVariants } from "~/db/schema";

const DATA_IMAGE = /^data:(image\/(?:png|jpeg|webp|gif));base64,([a-zA-Z0-9+/]+={0,2})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function imageResponse(value: string | null | undefined, requestUrl: string) {
  if (!value) return new Response("Image not found", { status: 404 });

  const dataImage = DATA_IMAGE.exec(value);
  if (dataImage) {
    return new Response(Buffer.from(dataImage[2], "base64"), {
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
        "Content-Type": dataImage[1],
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  try {
    const target = new URL(value, requestUrl);
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      throw new Error("Unsupported image protocol");
    }
    return Response.redirect(target, 302);
  } catch {
    return new Response("Invalid image", { status: 404 });
  }
}

export async function GET(event: APIEvent) {
  const url = new URL(event.request.url);
  const productId = url.searchParams.get("product")?.trim();
  const variantId = url.searchParams.get("variant")?.trim();

  if (variantId) {
    if (!UUID.test(variantId)) {
      return new Response("Invalid variant", { status: 400 });
    }
    const rows = await db
      .select({ image: productVariants.imageUrl })
      .from(productVariants)
      .where(eq(productVariants.id, variantId))
      .limit(1);
    return imageResponse(rows[0]?.image, event.request.url);
  }

  if (productId) {
    if (!UUID.test(productId)) {
      return new Response("Invalid product", { status: 400 });
    }
    const rows = await db
      .select({ images: products.imageUrls })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    return imageResponse(rows[0]?.images[0], event.request.url);
  }

  return new Response("Product or variant is required", { status: 400 });
}
