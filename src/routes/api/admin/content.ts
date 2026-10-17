import type { APIEvent } from "@solidjs/start/server";
import { z } from "zod";
import { db } from "~/db";
import { storefrontContent } from "~/db/schema";
import {
  apiJson,
  requireAdmin,
  writeAuditLog,
} from "~/lib/admin.server";
import { normalizeSocialUrl, type SocialNetwork } from "~/lib/social-links";

const socialUrl = (network: SocialNetwork) => z
  .string()
  .trim()
  .max(2048)
  .refine(value => value === "" || Boolean(normalizeSocialUrl(network, value)), {
    message: `Enter a valid ${network} profile or invite.`,
  })
  .transform(value => normalizeSocialUrl(network, value));

const contentSchema = z.object({
  announcement: z.string().trim().max(180),
  heroTitle: z.string().trim().min(3).max(100),
  heroCopy: z.string().trim().min(3).max(300),
  featuredProductSlugs: z.array(z.string().trim().min(1).max(110)).max(12),
  socialInstagram: socialUrl("instagram"),
  socialTiktok: socialUrl("tiktok"),
  socialYoutube: socialUrl("youtube"),
  socialDiscord: socialUrl("discord"),
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
