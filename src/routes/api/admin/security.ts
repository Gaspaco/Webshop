import type { APIEvent } from "@solidjs/start/server";
import { apiJson, requireAdmin } from "~/lib/admin.server";

// Compatibility for old dashboard tabs. There is no separate owner challenge.
export async function GET(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;
  return apiJson({ enabled: false, required: false });
}

export async function POST(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;
  return apiJson({ error: "Owner verification is no longer needed. Open the dashboard." }, { status: 410 });
}
