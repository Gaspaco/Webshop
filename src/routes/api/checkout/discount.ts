import type { APIEvent } from "@solidjs/start/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import { discountCodes } from "~/db/schema";

export async function POST(event: APIEvent) {
  try {
    const input = z
      .object({
        code: z.string().trim().min(3).max(32),
        subtotalCents: z.number().int().min(0).max(100_000_000),
      })
      .parse(await event.request.json());
    const [discount] = await db
      .select()
      .from(discountCodes)
      .where(
        and(
          eq(discountCodes.code, input.code.toUpperCase()),
          eq(discountCodes.active, true),
        ),
      )
      .limit(1);
    const now = new Date();
    const valid =
      discount &&
      (!discount.startsAt || discount.startsAt <= now) &&
      (!discount.expiresAt || discount.expiresAt > now) &&
      input.subtotalCents >= discount.minimumOrderCents &&
      (discount.maximumUses === null ||
        discount.usedCount < discount.maximumUses);
    if (!valid) {
      return Response.json(
        { error: "This discount code is not available for this order." },
        { status: 400 },
      );
    }
    const discountCents = Math.min(
      input.subtotalCents,
      discount.type === "percentage"
        ? Math.round((input.subtotalCents * discount.value) / 100)
        : discount.value,
    );
    return Response.json({
      code: discount.code,
      discountCents,
      label:
        discount.type === "percentage"
          ? `${discount.value}% discount`
          : `€${(discount.value / 100).toFixed(2)} discount`,
    });
  } catch {
    return Response.json({ error: "Check the discount code." }, { status: 400 });
  }
}
