import type { APIEvent } from "@solidjs/start/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import { discountCodes } from "~/db/schema";
import {
  apiJson,
  requireAdmin,
  writeAuditLog,
} from "~/lib/admin.server";

const createSchema = z.object({
  code: z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9_-]+$/),
  type: z.enum(["percentage", "fixed"]),
  value: z.number().int().min(1).max(10_000_000),
  minimumOrderCents: z.number().int().min(0).max(100_000_000),
  maximumUses: z.number().int().min(1).max(1_000_000).nullable(),
  expiresAt: z.string().datetime().nullable(),
});

export async function POST(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;

  try {
    const input = createSchema.parse(await event.request.json());
    if (input.type === "percentage" && input.value > 100) {
      return apiJson(
        { error: "Percentage discounts cannot exceed 100." },
        { status: 400 },
      );
    }
    const [discount] = await db
      .insert(discountCodes)
      .values({
        code: input.code.toUpperCase(),
        type: input.type,
        value: input.value,
        minimumOrderCents: input.minimumOrderCents,
        maximumUses: input.maximumUses,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        createdBy: guard.session!.user.id,
      })
      .returning();

    await writeAuditLog({
      event,
      actorId: guard.session!.user.id,
      action: "discount.created",
      entityType: "discount",
      entityId: discount!.id,
      summary: `Discount ${discount!.code} created.`,
    });

    return apiJson({ discount }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return apiJson({ error: "That discount code already exists." }, { status: 409 });
    }
    if (error instanceof z.ZodError) {
      return apiJson({ error: "Check the discount details." }, { status: 400 });
    }
    console.error("Discount creation failed", error);
    return apiJson({ error: "The discount could not be created." }, { status: 500 });
  }
}

export async function PATCH(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;
  try {
    const input = z
      .object({ id: z.string().uuid(), active: z.boolean() })
      .parse(await event.request.json());
    const [discount] = await db
      .update(discountCodes)
      .set({ active: input.active })
      .where(eq(discountCodes.id, input.id))
      .returning();
    if (!discount) return apiJson({ error: "Discount not found." }, { status: 404 });
    await writeAuditLog({
      event,
      actorId: guard.session!.user.id,
      action: "discount.updated",
      entityType: "discount",
      entityId: discount.id,
      summary: `${discount.code} ${input.active ? "enabled" : "disabled"}.`,
    });
    return apiJson({ discount });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiJson({ error: "Check the discount update." }, { status: 400 });
    }
    return apiJson({ error: "The discount could not be updated." }, { status: 500 });
  }
}
