import { eq } from "drizzle-orm";
import { db } from "~/db";
import { orderItems, products, productVariants } from "~/db/schema";
import { calculateShipment, type Shipment, type ShippingSettings } from "./product-shipping";
import { PostnlError } from "./postnl.server";

/** Placed orders keep their checkout measurements even if products change later. */
export async function orderShipment(orderId: string, snapshot: Shipment | null | undefined, settings: ShippingSettings) {
  if (snapshot) return { shipment: snapshot, source: "checkout" as const };
  const lines = await db.select({ quantity: orderItems.quantity, productType: products.productType, metadata: products.metadata })
    .from(orderItems).leftJoin(productVariants, eq(orderItems.variantId, productVariants.id))
    .leftJoin(products, eq(productVariants.productId, products.id)).where(eq(orderItems.orderId, orderId));
  if (!lines.length) throw new PostnlError("This order has no items from which to calculate a package. Check the order before creating a label.");
  const shipment = calculateShipment(lines.map(line => ({ quantity: line.quantity, productType: line.productType, shipping: line.metadata?.shipping })), settings);
  shipment.estimated = true;
  shipment.warnings.push("This older order has no checkout measurements. Current product measurements and shipping classes were used; check the packed parcel.");
  return { shipment, source: "current_catalogue" as const };
}
