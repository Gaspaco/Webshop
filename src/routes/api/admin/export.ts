import type { APIEvent } from "@solidjs/start/server";
import { desc, eq } from "drizzle-orm";
import { db } from "~/db";
import {
  orders,
  user,
} from "~/db/schema";
import { apiJson, requireAdmin } from "~/lib/admin.server";
import { csvCell } from "~/lib/csv";
import { parseInventoryExportOptions } from "~/lib/inventory-export";
import { inventoryExportResponse } from "~/lib/inventory-export.server";
import { safeApiResponse } from "~/lib/request-security.server";

const csv = (headers: string[], rows: unknown[][]) =>
  `${headers.map(csvCell).join(",")}\n${rows
    .map(row => row.map(csvCell).join(","))
    .join("\n")}\n`;

export async function GET(event: APIEvent) {
  return safeApiResponse(() => exportCsv(event));
}

async function exportCsv(event: APIEvent) {
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
    let options;
    try { options = parseInventoryExportOptions(new URL(event.request.url).searchParams); }
    catch (error) { return apiJson({ error: (error as Error).message }, { status: 400 }); }
    return inventoryExportResponse(options, event.request.signal);
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
