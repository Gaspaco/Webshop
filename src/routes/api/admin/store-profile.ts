import type { APIEvent } from "@solidjs/start/server";
import { z } from "zod";
import { db } from "~/db";
import { storefrontContent } from "~/db/schema";
import { apiJson, requireAdmin, writeAuditLog } from "~/lib/admin.server";
import { storeProfileSchema } from "~/lib/store-profile";

export async function PUT(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;

  try {
    const input = storeProfileSchema.parse(await event.request.json());
    await db
      .insert(storefrontContent)
      .values({
        key: "business",
        value: input,
        updatedBy: guard.session!.user.id,
      })
      .onConflictDoUpdate({
        target: storefrontContent.key,
        set: { value: input, updatedBy: guard.session!.user.id },
      });
    await writeAuditLog({
      event,
      actorId: guard.session!.user.id,
      action: "store.profile_updated",
      entityType: "content",
      entityId: "business",
      summary: "Business and shipping settings updated.",
    });
    return apiJson({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiJson(
        { error: error.issues[0]?.message ?? "Check the store settings." },
        { status: 400 },
      );
    }
    console.error("Store profile update failed", error);
    return apiJson({ error: "Store settings could not be saved." }, { status: 500 });
  }
}
