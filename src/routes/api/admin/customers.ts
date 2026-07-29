import type { APIEvent } from "@solidjs/start/server";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import {
  customerAdminProfiles,
  session,
  user,
} from "~/db/schema";
import {
  apiJson,
  requireAdmin,
  writeAuditLog,
} from "~/lib/admin.server";

export async function DELETE(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;

  try {
    const input = z
      .object({
        id: z.string().uuid(),
        confirmation: z.literal("REMOVE"),
      })
      .parse(await event.request.json());

    if (input.id === guard.session!.user.id) {
      return apiJson(
        { error: "The active owner account cannot remove itself." },
        { status: 400 },
      );
    }

    const [removed] = await db
      .delete(user)
      .where(
        and(
          eq(user.id, input.id),
          ne(user.role, "admin"),
        ),
      )
      .returning({ id: user.id, email: user.email });

    if (!removed) {
      return apiJson(
        { error: "Customer account not found or protected." },
        { status: 404 },
      );
    }

    await writeAuditLog({
      event,
      actorId: guard.session!.user.id,
      action: "customer.removed",
      entityType: "customer",
      entityId: removed.id,
      summary: `Customer account ${removed.email} removed.`,
    });

    return apiJson({
      ok: true,
      message: "Customer account removed. Existing order records were kept.",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiJson(
        { error: "Account removal confirmation is invalid." },
        { status: 400 },
      );
    }

    console.error("Admin customer removal failed", error);
    return apiJson(
      { error: "The customer account could not be removed." },
      { status: 500 },
    );
  }
}

const updateSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update"),
    id: z.string().uuid(),
    notes: z.string().trim().max(4000),
    tags: z.array(z.string().trim().min(1).max(32)).max(20),
    suspended: z.boolean(),
  }),
  z.object({
    action: z.literal("revoke_sessions"),
    id: z.string().uuid(),
  }),
]);

export async function PATCH(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;

  try {
    const input = updateSchema.parse(await event.request.json());
    if (input.id === guard.session!.user.id) {
      return apiJson(
        { error: "Use account security to manage the active owner." },
        { status: 400 },
      );
    }

    const [customer] = await db
      .select({ id: user.id, email: user.email, role: user.role })
      .from(user)
      .where(eq(user.id, input.id))
      .limit(1);
    if (!customer || customer.role === "admin") {
      return apiJson({ error: "Customer not found." }, { status: 404 });
    }

    if (input.action === "revoke_sessions") {
      await db.delete(session).where(eq(session.userId, customer.id));
      await writeAuditLog({
        event,
        actorId: guard.session!.user.id,
        action: "customer.sessions_revoked",
        entityType: "customer",
        entityId: customer.id,
        summary: `All sessions revoked for ${customer.email}.`,
      });
      return apiJson({ ok: true });
    }

    await db
      .insert(customerAdminProfiles)
      .values({
        userId: customer.id,
        notes: input.notes || null,
        tags: input.tags,
        suspended: input.suspended,
        updatedBy: guard.session!.user.id,
      })
      .onConflictDoUpdate({
        target: customerAdminProfiles.userId,
        set: {
          notes: input.notes || null,
          tags: input.tags,
          suspended: input.suspended,
          updatedBy: guard.session!.user.id,
        },
      });

    if (input.suspended) {
      await db.delete(session).where(eq(session.userId, customer.id));
    }

    await writeAuditLog({
      event,
      actorId: guard.session!.user.id,
      action: input.suspended
        ? "customer.suspended"
        : "customer.updated",
      entityType: "customer",
      entityId: customer.id,
      summary: `${customer.email} customer controls updated.`,
      metadata: { tags: input.tags, suspended: input.suspended },
    });

    return apiJson({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiJson(
        { error: error.issues[0]?.message ?? "Check the customer controls." },
        { status: 400 },
      );
    }
    console.error("Admin customer update failed", error);
    return apiJson(
      { error: "Customer controls could not be saved." },
      { status: 500 },
    );
  }
}
