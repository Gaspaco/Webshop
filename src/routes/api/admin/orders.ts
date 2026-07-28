import type { APIEvent } from "@solidjs/start/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import { orders } from "~/db/schema";
import { apiJson, requireAdmin } from "~/lib/admin.server";

const updateOrderSchema = z.object({
  id: z.string().uuid(),
  status: z.enum([
    "pending",
    "paid",
    "processing",
    "shipped",
    "completed",
    "cancelled",
    "refunded",
  ]),
});

export async function PATCH(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;

  try {
    const input = updateOrderSchema.parse(await event.request.json());
    const [updated] = await db
      .update(orders)
      .set({ status: input.status })
      .where(eq(orders.id, input.id))
      .returning({ id: orders.id, status: orders.status });

    if (!updated) {
      return apiJson({ error: "Order not found." }, { status: 404 });
    }

    return apiJson({ order: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiJson({ error: "Choose a valid order status." }, { status: 400 });
    }
    console.error("Admin order update failed", error);
    return apiJson({ error: "The order could not be updated." }, { status: 500 });
  }
}
