import type { APIEvent } from "@solidjs/start/server";
import { db } from "~/db";
import { adminAuditLog } from "~/db/schema";
import { auth } from "~/lib/auth";

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

export async function requireAdmin(event: APIEvent) {
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
