import type { APIEvent } from "@solidjs/start/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import { storefrontContent } from "~/db/schema";
import {
  apiJson,
  requireAdmin,
  writeAuditLog,
} from "~/lib/admin.server";
import {
  parseReadinessConfirmations,
  readinessConfirmationIds,
} from "~/lib/readiness-confirmations";

const updateSchema = z.object({
  id: z.enum(readinessConfirmationIds),
  confirmed: z.boolean(),
  acknowledgement: z.literal(true),
});

export async function PATCH(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;

  try {
    const input = updateSchema.parse(await event.request.json());
    const [existing] = await db
      .select({ value: storefrontContent.value })
      .from(storefrontContent)
      .where(eq(storefrontContent.key, "readiness"))
      .limit(1);
    const confirmations = parseReadinessConfirmations(existing?.value);

    if (input.confirmed) {
      confirmations[input.id] = {
        confirmedAt: new Date().toISOString(),
        confirmedBy: guard.session!.user.id,
      };
    } else {
      delete confirmations[input.id];
    }

    await db
      .insert(storefrontContent)
      .values({
        key: "readiness",
        value: confirmations,
        updatedBy: guard.session!.user.id,
      })
      .onConflictDoUpdate({
        target: storefrontContent.key,
        set: {
          value: confirmations,
          updatedBy: guard.session!.user.id,
        },
      });

    await writeAuditLog({
      event,
      actorId: guard.session!.user.id,
      action: input.confirmed
        ? "readiness.confirmed"
        : "readiness.reopened",
      entityType: "readiness",
      entityId: input.id,
      summary: input.confirmed
        ? `${input.id} launch requirement confirmed.`
        : `${input.id} launch requirement reopened.`,
    });

    return apiJson({ ok: true, confirmations });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiJson(
        { error: "Choose a valid readiness requirement." },
        { status: 400 },
      );
    }
    console.error("Readiness confirmation update failed", error);
    return apiJson(
      { error: "The readiness confirmation could not be saved." },
      { status: 500 },
    );
  }
}
