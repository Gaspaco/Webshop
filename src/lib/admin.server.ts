import type { APIEvent } from "@solidjs/start/server";
import { db } from "~/db";
import { adminAuditLog } from "~/db/schema";
import { auth } from "~/lib/auth";
import { limitJsonBody } from "~/lib/request-security.server";
import { hasAdminApproval, hasFreshAdminApproval } from "~/lib/admin-approval.server";
import { logServerError } from "~/lib/server-log";

export function apiJson(data: unknown, init?: ResponseInit) {
  return Response.json(data, {
    ...init,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      ...(init?.headers ?? {}),
    },
  });
}

type AdminOptions = { allowEnrollment?: boolean; fresh?: boolean };
export async function requireAdmin(event: APIEvent, options: AdminOptions = {}) {
  try { return await checkAdmin(event, options); }
  catch (error) {
    logServerError("Owner authorization service failed.", error);
    return { session: null, response: apiJson({ error: "Owner access is temporarily unavailable." }, { status: 503 }) };
  }
}

async function checkAdmin(event: APIEvent, options: AdminOptions) {
  if (!["GET", "HEAD", "OPTIONS"].includes(event.request.method)) {
    const origin = event.request.headers.get("origin");
    const requestOrigin = new URL(event.request.url).origin;

    if (!origin || origin !== requestOrigin) {
      return {
        session: null,
        response: apiJson(
          { error: "The request origin could not be verified." },
          { status: 403 },
        ),
      };
    }
  }

  const session = await auth.api.getSession({
    headers: event.request.headers,
  });

  if (!session) {
    return {
      session: null,
      response: apiJson({ error: "Authentication required." }, { status: 401 }),
    };
  }

  if ((session.user as { role?: string }).role !== "admin") {
    return {
      session: null,
      response: apiJson(
        { error: "This account does not have owner access." },
        { status: 403 },
      ),
    };
  }

  if (!options.allowEnrollment && !(session.user as { twoFactorEnabled?: boolean }).twoFactorEnabled) {
    return { session: null, response: apiJson({ code: "ADMIN_MFA_REQUIRED", error: "Set up owner two-factor authentication first." }, { status: 403 }) };
  }
  if (options.fresh && !await hasFreshAdminApproval(session.session.id)) {
    return { session: null, response: apiJson({ code: "ADMIN_REAUTH_REQUIRED", error: "Verify your password and authenticator code before this action." }, { status: 403 }) };
  }
  if (!options.allowEnrollment && !await hasAdminApproval(session.session.id)) {
    return { session: null, response: apiJson({ code: "ADMIN_REAUTH_REQUIRED", error: "Verify owner access on this session." }, { status: 403 }) };
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(event.request.method)) {
    const bounded = await limitJsonBody(event.request, 4_000_000);
    if (bounded instanceof Response) return { session: null, response: bounded };
    event.request = bounded;
  }
  return { session, response: null };
}

export function toSlug(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

export async function writeAuditLog(input: {
  event: APIEvent;
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(adminAuditLog).values({
    actorId: input.actorId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    summary: input.summary,
    metadata: input.metadata ?? {},
    ipAddress:
      input.event.request.headers.get("x-real-ip") ??
      input.event.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      null,
  });
}
