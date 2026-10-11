import type { APIEvent } from "@solidjs/start/server";
import { eq, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import { products, productVariants } from "~/db/schema";
import { apiJson, requireAdmin, writeAuditLog } from "~/lib/admin.server";
import { checkRateLimit } from "~/lib/rate-limit.server";

const priceRowSchema = z.object({
  idProduct: z.number().int().positive().max(2_147_483_647),
  normalCents: z.number().int().min(0).max(100_000_000),
  foilCents: z.number().int().min(0).max(100_000_000),
});

const requestSchema = z.object({
  mode: z.enum(["preview", "apply"]),
  sourceCreatedAt: z.string().trim().max(80).optional().default(""),
  rows: z.array(priceRowSchema).min(1).max(5_000),
});

type PriceUpdate = {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  sku: string;
  idProduct: number;
  priceType: "normal" | "foil";
  oldPriceCents: number;
  newPriceCents: number;
};

function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

export async function GET(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;

  const rows = await db
    .select({
      idProduct: productVariants.cardmarketProductId,
      priceType: productVariants.cardmarketPriceType,
    })
    .from(productVariants)
    .where(isNotNull(productVariants.cardmarketProductId));

  return apiJson({
    links: rows.flatMap(row =>
      row.idProduct == null
        ? []
        : [{
            idProduct: row.idProduct,
            priceType: row.priceType === "foil" ? "foil" : "normal",
          }],
    ),
  });
}

export async function POST(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;

  try {
    const input = requestSchema.parse(await event.request.json());
    const limited = await checkRateLimit({
      event,
      namespace: "admin-cardmarket-prices",
      identity: guard.session!.user.id,
      limit: input.mode === "apply" ? 8 : 20,
      windowMs: 60_000,
    });
    if (limited) {
      return apiJson(
        { error: "Too many price imports. Wait one minute and try again." },
        { status: 429 },
      );
    }

    const sourceById = new Map(input.rows.map(row => [row.idProduct, row]));
    const linked = await db
      .select({
        variantId: productVariants.id,
        productId: productVariants.productId,
        productName: products.name,
        variantName: productVariants.name,
        sku: productVariants.sku,
        idProduct: productVariants.cardmarketProductId,
        priceType: productVariants.cardmarketPriceType,
        oldPriceCents: productVariants.priceCents,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(inArray(productVariants.cardmarketProductId, [...sourceById.keys()]));

    const matched: PriceUpdate[] = [];
    let missingPrice = 0;
    for (const variant of linked) {
      if (variant.idProduct == null) continue;
      const source = sourceById.get(variant.idProduct);
      if (!source) continue;
      const priceType = variant.priceType === "foil" ? "foil" : "normal";
      const newPriceCents = priceType === "foil"
        ? source.foilCents
        : source.normalCents;
      if (newPriceCents <= 0) {
        missingPrice += 1;
        continue;
      }
      matched.push({
        variantId: variant.variantId,
        productId: variant.productId,
        productName: variant.productName,
        variantName: variant.variantName,
        sku: variant.sku,
        idProduct: variant.idProduct,
        priceType,
        oldPriceCents: variant.oldPriceCents,
        newPriceCents,
      });
    }

    const changed = matched.filter(row => row.oldPriceCents !== row.newPriceCents);
    if (input.mode === "apply" && changed.length) {
      await db.transaction(async tx => {
        for (const batch of chunks(changed, 400)) {
          const values = sql.join(
            batch.map(row => sql`(${row.variantId}::uuid, ${row.newPriceCents}::integer)`),
            sql`, `,
          );
          await tx.execute(sql`
            update ${productVariants}
            set price_cents = incoming.price_cents,
                updated_at = now()
            from (values ${values}) as incoming(id, price_cents)
            where ${productVariants.id} = incoming.id
          `);
        }
      });

      await writeAuditLog({
        event,
        actorId: guard.session!.user.id,
        action: "catalogue.cardmarket_prices_applied",
        entityType: "product",
        summary: `${changed.length} variant prices updated from an exact Cardmarket ID match.`,
        metadata: {
          sourceCreatedAt: input.sourceCreatedAt || null,
          matchedVariants: matched.length,
          changedVariants: changed.length,
          missingPrice,
          productIds: [...new Set(changed.map(row => row.productId))],
        },
      });
    }

    return apiJson({
      linkedVariants: linked.length,
      matchedVariants: matched.length,
      changedVariants: changed.length,
      missingPrice,
      applied: input.mode === "apply" ? changed.length : 0,
      changes: changed.slice(0, 50),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiJson(
        { error: error.issues[0]?.message ?? "The Cardmarket price data is invalid." },
        { status: 400 },
      );
    }
    console.error("Cardmarket price import failed", error);
    return apiJson(
      { error: "Cardmarket prices could not be checked. No prices were changed." },
      { status: 500 },
    );
  }
}
