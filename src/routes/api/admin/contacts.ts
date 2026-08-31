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
import { escapeEmailHtml, sendTransactionalEmail } from "~/lib/email.server";
import { getEmailEnv } from "~/lib/env.server";
import { validateJsonRequest } from "~/lib/request-security.server";
import { getStoreProfile } from "~/lib/store-profile.server";

const updateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["unread", "read", "resolved"]),
});

const replySchema = z.object({
  id: z.string().uuid(),
  reply: z.string().trim().min(2).max(5_000),
});

/** Sends a real reply email to the customer and resolves the thread. */
export async function POST(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;
  const invalidRequest = validateJsonRequest(event, { maxBytes: 12_000 });
  if (invalidRequest) return invalidRequest;

  try {
    const input = replySchema.parse(await event.request.json());

    if (!getEmailEnv()) {
      return apiJson(
        {
          error:
            "Email is not configured. Add the SMTP_* variables before sending replies.",
        },
        { status: 503 },
      );
    }

    const [message] = await db
      .select()
      .from(contactMessages)
      .where(eq(contactMessages.id, input.id))
      .limit(1);

    if (!message) {
      return apiJson({ error: "Message not found." }, { status: 404 });
    }

    const profile = await getStoreProfile();
    const quoted = message.message
      .split("\n")
      .map(line => `> ${line}`)
      .join("\n");

    try {
      await sendTransactionalEmail({
        to: message.email,
        subject: `Re: ${message.topic}`,
        replyTo: profile.businessEmail,
        text: `${input.reply}\n\n---\nOn ${new Date(message.createdAt).toLocaleDateString("en-NL")} you wrote:\n${quoted}\n\n${profile.companyName}\n${profile.businessEmail}`,
        html:
          `<div style="font-family:Arial,sans-serif;color:#111713;line-height:1.6">` +
          `<p>${escapeEmailHtml(input.reply).replaceAll("\n", "<br>")}</p>` +
          `<hr style="border:none;border-top:1px solid #d9e0dc;margin:24px 0">` +
          `<p style="color:#65716a;font-size:13px">On ${escapeEmailHtml(new Date(message.createdAt).toLocaleDateString("en-NL"))} you wrote:</p>` +
          `<blockquote style="margin:0;padding-left:12px;border-left:3px solid #d9e0dc;color:#65716a;font-size:13px">${escapeEmailHtml(message.message).replaceAll("\n", "<br>")}</blockquote>` +
          `<p style="margin-top:24px;font-size:13px;color:#65716a">${escapeEmailHtml(profile.companyName)}<br>${escapeEmailHtml(profile.businessEmail)}</p>` +
          `</div>`,
        idempotencyKey: `contact-reply-${message.id}-${Date.now()}`,
      });
    } catch {
      console.error("Contact reply delivery failed.");
      return apiJson(
        { error: "The reply could not be delivered. Check the SMTP settings." },
        { status: 502 },
      );
    }

    await db
      .update(contactMessages)
      .set({ status: "resolved", updatedBy: guard.session!.user.id })
      .where(eq(contactMessages.id, message.id));

    await writeAuditLog({
      event,
      actorId: guard.session!.user.id,
      action: "contact.replied",
      entityType: "contact_message",
      entityId: message.id,
      summary: `Replied to ${message.email} about "${message.topic}".`,
    });

    return apiJson({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiJson(
        { error: error.issues[0]?.message ?? "Check the reply." },
        { status: 400 },
      );
    }
    console.error("Admin contact reply failed.");
    return apiJson({ error: "The reply could not be sent." }, { status: 500 });
  }
}

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
