import type { APIEvent } from "@solidjs/start/server";
import { z } from "zod";
import { db } from "~/db";
import { storefrontContent } from "~/db/schema";
import {
  apiJson,
  requireAdmin,
  writeAuditLog,
} from "~/lib/admin.server";

const optionalHttpsUrl = z
  .string()
  .trim()
  .max(2048)
  .refine(value => value === "" || value.startsWith("https://"), {
    message: "Social links must use HTTPS.",
  });

const contentSchema = z.object({
  announcement: z.string().trim().max(180),
  heroTitle: z.string().trim().min(3).max(100),
  heroCopy: z.string().trim().min(3).max(300),
  featuredProductSlugs: z.array(z.string().trim().min(1).max(110)).max(12),
  socialInstagram: optionalHttpsUrl,
  socialTiktok: optionalHttpsUrl,
  socialYoutube: optionalHttpsUrl,
  socialDiscord: optionalHttpsUrl,
});

export async function PUT(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;
  try {
    const input = contentSchema.parse(await event.request.json());
    await db
      .insert(storefrontContent)
      .values({
        key: "home",
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
      action: "storefront.updated",
      entityType: "content",
      entityId: "home",
      summary: "Homepage content settings updated.",
    });
    return apiJson({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiJson(
        { error: error.issues[0]?.message ?? "Check the content settings." },
        { status: 400 },
      );
    }
    return apiJson({ error: "Storefront content could not be saved." }, { status: 500 });
  }
}
