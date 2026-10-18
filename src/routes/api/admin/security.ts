import type { APIEvent } from "@solidjs/start/server";
import { z } from "zod";
import { db } from "~/db";
import { adminSessionApprovals } from "~/db/schema";
import { apiJson, requireAdmin } from "~/lib/admin.server";
import { auth } from "~/lib/auth";
import { hasFreshAdminApproval } from "~/lib/admin-approval.server";
import { validateJsonRequest } from "~/lib/request-security.server";
import { checkRateLimit } from "~/lib/rate-limit.server";
import { logServerError } from "~/lib/server-log";

export async function GET(event: APIEvent) {
  const guard = await requireAdmin(event, { allowEnrollment: true });
  if (guard.response) return guard.response;
  return apiJson({ enabled: Boolean(guard.session!.user.twoFactorEnabled),
    fresh: await hasFreshAdminApproval(guard.session!.session.id) });
}

export async function POST(event: APIEvent) {
  const guard = await requireAdmin(event, { allowEnrollment: true });
  if (guard.response) return guard.response;
  if (!guard.session!.user.twoFactorEnabled) return apiJson({ error: "Enroll an authenticator first." }, { status: 403 });
  const invalid = await validateJsonRequest(event, { maxBytes: 2000 });
  if (invalid) return invalid;
  if (await checkRateLimit({ event, namespace: "admin-reauth", identity: guard.session!.user.id, limit: 5, windowMs: 5 * 60_000 })) {
    return apiJson({ error: "Too many verification attempts. Wait five minutes." }, { status: 429 });
  }
  try {
    const input = z.object({ password: z.string().min(1).max(128), code: z.string().regex(/^\d{6}$/) }).parse(await event.request.json());
    await auth.api.verifyPassword({ headers: event.request.headers, body: { password: input.password } });
    const verified = await auth.api.verifyTOTP({ headers: event.request.headers, body: { code: input.code } });
    if (!("token" in verified) || verified.token !== guard.session!.session.token) throw new Error("Owner authenticator verification failed.");
    const verifiedAt = new Date();
    await db.insert(adminSessionApprovals).values({ sessionId: guard.session!.session.id, verifiedAt })
      .onConflictDoUpdate({ target: adminSessionApprovals.sessionId, set: { verifiedAt } });
    return apiJson({ ok: true });
  } catch (error) {
    logServerError("Owner reauthentication failed.", error);
    return apiJson({ error: "Password or authenticator code was not accepted." }, { status: 400 });
  }
}
