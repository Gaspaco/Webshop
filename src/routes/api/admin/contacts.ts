import type { APIEvent } from "@solidjs/start/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import { contactMessages } from "~/db/schema";
import {
  apiJson,
  requireAdmin,
  writeAuditLog,
} from "~/lib/admin.server";
import { validateJsonRequest } from "~/lib/request-security.server";

const updateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["unread", "read", "resolved"]),
});

const deleteSchema = z.object({
  id: z.string().uuid(),
  confirmation: z.literal("DELETE"),
});

export async function PATCH(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;
  const invalidRequest = validateJsonRequest(event, { maxBytes: 2_000 });
  if (invalidRequest) return invalidRequest;

  try {
    const input = updateSchema.parse(await event.request.json());
    const [updated] = await db
      .update(contactMessages)
      .set({
        status: input.status,
        updatedBy: guard.session!.user.id,
      })
      .where(eq(contactMessages.id, input.id))
      .returning({ id: contactMessages.id });

    if (!updated) {
      return apiJson({ error: "Message not found." }, { status: 404 });
    }

    await writeAuditLog({
      event,
      actorId: guard.session!.user.id,
      action: "contact.status_updated",
      entityType: "contact_message",
      entityId: updated.id,
      summary: `Contact message marked ${input.status}.`,
    });

    return apiJson({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiJson(
        { error: error.issues[0]?.message ?? "Check the message update." },
        { status: 400 },
      );
    }
    console.error("Admin contact update failed.");
    return apiJson(
      { error: "The message could not be updated." },
      { status: 500 },
    );
  }
}

export async function DELETE(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;
  const invalidRequest = validateJsonRequest(event, { maxBytes: 2_000 });
  if (invalidRequest) return invalidRequest;

  try {
    const input = deleteSchema.parse(await event.request.json());
    const [removed] = await db
      .delete(contactMessages)
      .where(eq(contactMessages.id, input.id))
      .returning({ id: contactMessages.id });

    if (!removed) {
      return apiJson({ error: "Message not found." }, { status: 404 });
    }

    await writeAuditLog({
      event,
      actorId: guard.session!.user.id,
      action: "contact.removed",
      entityType: "contact_message",
      entityId: removed.id,
      summary: "Contact message permanently removed.",
    });

    return apiJson({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiJson(
        { error: "Message removal confirmation is invalid." },
        { status: 400 },
      );
    }
    console.error("Admin contact removal failed.");
    return apiJson(
      { error: "The message could not be removed." },
      { status: 500 },
    );
  }
}
