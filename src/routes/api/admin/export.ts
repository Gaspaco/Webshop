import type { APIEvent } from "@solidjs/start/server";
import { desc, eq } from "drizzle-orm";
import { db } from "~/db";
import {
  orders,
  products,
  productVariants,
  user,
} from "~/db/schema";
import { requireAdmin } from "~/lib/admin.server";

const csvCell = (value: unknown) =>
  `"${String(value ?? "").replaceAll('"', '""')}"`;
const csv = (headers: string[], rows: unknown[][]) =>
  `${headers.map(csvCell).join(",")}\n${rows
    .map(row => row.map(csvCell).join(","))
    .join("\n")}\n`;

export async function GET(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;
  const type = new URL(event.request.url).searchParams.get("type");
  let fileName = "tcghaven-export.csv";
  let output = "";

  if (type === "orders") {
    const rows = await db.select().from(orders).orderBy(desc(orders.createdAt));
    fileName = "tcghaven-orders.csv";
    output = csv(
      ["order", "email", "status", "subtotal", "shipping", "shipping_method", "discount", "total", "tracking", "created"],
      rows.map(order => [
        order.orderNumber,
        order.email,
        order.status,
        order.subtotalCents / 100,
        order.shippingCents / 100,
        order.shippingMethod,
        order.discountCents / 100,
        order.totalCents / 100,
        order.trackingNumber,
        order.createdAt.toISOString(),
      ]),
    );
  } else if (type === "customers") {
    const rows = await db
      .select()
      .from(user)
      .where(eq(user.role, "customer"))
      .orderBy(desc(user.createdAt));
    fileName = "tcghaven-customers.csv";
    output = csv(
      ["name", "email", "verified", "joined"],
      rows.map(customer => [
        customer.name,
        customer.email,
        customer.emailVerified,
        customer.createdAt.toISOString(),
      ]),
    );
  } else {
    const rows = await db
      .select({
        name: products.name,
        slug: products.slug,
        game: products.game,
        type: products.productType,
        status: products.status,
        sku: productVariants.sku,
        condition: productVariants.condition,
        language: productVariants.language,
        priceCents: productVariants.priceCents,
        stock: productVariants.stock,
        reserved: productVariants.reservedStock,
      })
      .from(products)
      .innerJoin(productVariants, eq(productVariants.productId, products.id));
    fileName = "tcghaven-inventory.csv";
    output = csv(
      ["name", "slug", "game", "type", "status", "sku", "condition", "language", "price", "stock", "reserved"],
      rows.map(product => [
        product.name,
        product.slug,
        product.game,
        product.type,
        product.status,
        product.sku,
        product.condition,
        product.language,
        product.priceCents / 100,
        product.stock,
        product.reserved,
      ]),
    );
  }

  return new Response(output, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
