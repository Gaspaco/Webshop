import type { APIEvent } from "@solidjs/start/server";
import { apiJson, requireAdmin } from "~/lib/admin.server";

// Enrollment uses Better Auth's password-protected two-factor endpoints.
export async function GET(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;
  return apiJson({ enabled: Boolean(guard.session.user.twoFactorEnabled), required: false });
}

export async function POST(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;
  return apiJson({ error: "Owner verification is no longer needed. Open the dashboard." }, { status: 410 });
}
