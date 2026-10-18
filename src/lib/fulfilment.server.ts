import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "~/db";
import { orders } from "~/db/schema";

export class LabelAlreadyRequested extends Error {}

export async function createLabelOnce<T extends { barcode: string; trackingUrl: string }>(orderId: string, create: () => Promise<T>) {
  const claimed = await db.update(orders).set({ labelState: "creating" }).where(and(
    eq(orders.id, orderId), eq(orders.labelState, "none"), isNull(orders.trackingNumber),
    inArray(orders.status, ["paid", "processing"]),
  )).returning({ id: orders.id });
  if (!claimed.length) throw new LabelAlreadyRequested("A label is already being created or needs checking in PostNL. Do not create another label.");
  try {
    const label = await create();
    await db.update(orders).set({ labelState: "created",
      // A refund or dispatch can finish while PostNL is responding. Record the
      // label without overwriting the newer fulfilment state or tracking data.
      status: sql`case when ${orders.status} = 'paid' then 'processing'::order_status else ${orders.status} end`,
      trackingNumber: sql`coalesce(${orders.trackingNumber}, ${label.barcode})`,
      trackingUrl: sql`coalesce(${orders.trackingUrl}, ${label.trackingUrl})` }).where(eq(orders.id, orderId));
    return label;
  } catch (error) {
    // A provider timeout or failed database write may follow a successful label
    // creation. Keep the claim: automatic retries could create duplicate labels.
    await db.update(orders).set({ labelState: "unknown" })
      .where(and(eq(orders.id, orderId), eq(orders.labelState, "creating")));
    throw error;
  }
}
