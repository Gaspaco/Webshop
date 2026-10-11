import type { APIEvent } from "@solidjs/start/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import { products, productVariants } from "~/db/schema";
import { apiJson, requireAdmin, writeAuditLog } from "~/lib/admin.server";
import { checkRateLimit } from "~/lib/rate-limit.server";

const requestSchema = z.object({
  mode: z.enum(["preview", "apply"]),
  game: z.enum(["pokemon", "yugioh", "magic", "riftbound", "digimon"]),
  rows: z.array(z.object({
    idProduct: z.number().int().positive().max(2_147_483_647),
    name: z.string().trim().min(1).max(220),
  })).min(1).max(2_000),
});

function normalizedName(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ");
}

export async function POST(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;

  try {
    const input = requestSchema.parse(await event.request.json());
    const limited = await checkRateLimit({
      event,
      namespace: "admin-cardmarket-links",
      identity: guard.session!.user.id,
      limit: input.mode === "apply" ? 5 : 15,
      windowMs: 60_000,
    });
    if (limited) {
      return apiJson(
        { error: "Too many linking attempts. Wait one minute and try again." },
        { status: 429 },
      );
    }

    const sourceByName = new Map(
      input.rows.map(row => [normalizedName(row.name), row]),
    );
    const localRows = await db
      .select({
        productId: products.id,
        productName: products.name,
        variantId: productVariants.id,
        variantName: productVariants.name,
        sku: productVariants.sku,
        linkedId: productVariants.cardmarketProductId,
      })
      .from(products)
      .innerJoin(productVariants, eq(productVariants.productId, products.id))
      .where(
        and(
          eq(products.game, input.game),
          eq(products.productType, "single"),
        ),
      );

    const localByName = new Map<string, typeof localRows>();
    for (const row of localRows) {
      const key = normalizedName(row.productName);
      const values = localByName.get(key) ?? [];
      values.push(row);
      localByName.set(key, values);
    }

    const candidates = input.rows.flatMap(source => {
      const local = localByName.get(normalizedName(source.name)) ?? [];
      if (local.length !== 1) return [];
      const variant = local[0]!;
      if (variant.linkedId != null && variant.linkedId !== source.idProduct) return [];
      return [{
        ...variant,
        idProduct: source.idProduct,
        alreadyLinked: variant.linkedId === source.idProduct,
      }];
    });
    const newLinks = candidates.filter(candidate => !candidate.alreadyLinked);

    if (input.mode === "apply" && newLinks.length) {
      await db.transaction(async tx => {
        for (const candidate of newLinks) {
          await tx
            .update(productVariants)
            .set({
              cardmarketProductId: candidate.idProduct,
              cardmarketPriceType: "normal",
            })
            .where(eq(productVariants.id, candidate.variantId));
        }
      });

      await writeAuditLog({
        event,
        actorId: guard.session!.user.id,
        action: "catalogue.cardmarket_ids_linked",
        entityType: "product",
        summary: `${newLinks.length} single-variant products linked to exact Cardmarket IDs.`,
        metadata: {
          game: input.game,
          productIds: newLinks.map(row => row.productId),
        },
      });
    }

    const sourceNames = new Set(sourceByName.keys());
    const matchingNames = [...localByName.keys()].filter(name => sourceNames.has(name));
    return apiJson({
      sourceRows: input.rows.length,
      matchingNames: matchingNames.length,
      safeLinks: candidates.length,
      newLinks: newLinks.length,
      applied: input.mode === "apply" ? newLinks.length : 0,
      skippedAmbiguous: matchingNames.length - candidates.length,
      candidates: candidates.slice(0, 50).map(candidate => ({
        productName: candidate.productName,
        variantName: candidate.variantName,
        sku: candidate.sku,
        idProduct: candidate.idProduct,
        alreadyLinked: candidate.alreadyLinked,
      })),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiJson(
        { error: error.issues[0]?.message ?? "The Cardmarket catalogue is invalid." },
        { status: 400 },
      );
    }
    console.error("Cardmarket ID linking failed", error);
    return apiJson(
      { error: "Cardmarket IDs could not be linked. No variants were changed." },
      { status: 500 },
    );
  }
}
