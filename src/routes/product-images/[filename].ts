import type { APIEvent } from "@solidjs/start/server";
import { serveProductImage } from "~/lib/product-image-cache.server";

export function GET(event: APIEvent) { return serveProductImage(event); }

export async function HEAD(event: APIEvent) {
  const response = await serveProductImage(event);
  return new Response(null, { status: response.status, headers: response.headers });
}
