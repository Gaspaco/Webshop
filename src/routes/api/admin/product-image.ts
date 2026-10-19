import type { APIEvent } from "@solidjs/start/server";
import { requireAdmin, apiJson } from "~/lib/admin.server";
import { resolveAdminImage, ADMIN_IMAGE_PATH } from "~/lib/admin-images.server";
import { logServerError } from "~/lib/server-log";

export async function GET(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;
  try {
    const url = new URL(event.request.url);
    const source = await resolveAdminImage(`${ADMIN_IMAGE_PATH}${url.search}`);
    const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([a-zA-Z0-9+/]+={0,2})$/.exec(source);
    const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
    if (match) return new Response(Buffer.from(match[2]!, "base64"), { headers: { ...headers, "Content-Type": match[1]! } });
    const target = new URL(source, url.origin);
    if (!["https:", "http:"].includes(target.protocol) || target.pathname === ADMIN_IMAGE_PATH) return apiJson({ error: "Invalid image." }, { status: 404 });
    return new Response(null, { status: 302, headers: { ...headers, Location: target.toString() } });
  } catch (error) {
    logServerError("Owner image request failed.", error);
    return apiJson({ error: "Image not found." }, { status: 404 });
  }
}
