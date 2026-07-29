import type { APIEvent } from "@solidjs/start/server";
import { eq } from "drizzle-orm";
import { db } from "~/db";
import { orderItems, orders } from "~/db/schema";
import { apiJson, requireAdmin } from "~/lib/admin.server";

const escape = (value: unknown) =>
  String(value ?? "").replace(/[&<>"]/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  })[character]!);
const money = (cents: number) => `€${(cents / 100).toFixed(2)}`;

export async function GET(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;
  const id = new URL(event.request.url).searchParams.get("id");
  if (!id) return apiJson({ error: "Order id required." }, { status: 400 });

  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return apiJson({ error: "Order not found." }, { status: 404 });
  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id));
  const address = order.shippingAddress;

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Invoice ${escape(order.orderNumber)}</title>
<style>body{font-family:Arial,sans-serif;color:#121714;max-width:820px;margin:48px auto;padding:0 24px}header{display:flex;justify-content:space-between;border-bottom:2px solid #121714;padding-bottom:24px}h1{font-size:28px;margin:0}.muted{color:#67716b}table{width:100%;border-collapse:collapse;margin-top:36px}th,td{text-align:left;padding:12px;border-bottom:1px solid #dfe5e1}th:last-child,td:last-child{text-align:right}.totals{margin:28px 0 0 auto;width:320px}.totals p{display:flex;justify-content:space-between}.total{font-size:20px;font-weight:700;border-top:2px solid #121714;padding-top:12px}button{margin-top:30px;padding:12px 18px;background:#121714;color:white;border:0}@media print{button{display:none}}</style>
</head><body><header><div><h1>TCGHaven</h1><p class="muted">Invoice ${escape(order.orderNumber)}</p></div><div><strong>${escape(order.email)}</strong><p>${escape(address.firstName)} ${escape(address.lastName)}<br>${escape(address.streetAndHouseNumber)}<br>${escape(address.postalCode)} ${escape(address.city)}<br>${escape(address.country)}</p></div></header>
<table><thead><tr><th>Item</th><th>SKU</th><th>Qty</th><th>Total</th></tr></thead><tbody>${items.map(item => `<tr><td>${escape(item.name)}</td><td>${escape(item.sku)}</td><td>${item.quantity}</td><td>${money(item.totalCents)}</td></tr>`).join("")}</tbody></table>
<div class="totals"><p><span>Subtotal</span><strong>${money(order.subtotalCents)}</strong></p><p><span>Shipping</span><strong>${money(order.shippingCents)}</strong></p>${order.discountCents ? `<p><span>Discount ${escape(order.discountCode)}</span><strong>${money(-order.discountCents)}</strong></p>` : ""}<p class="total"><span>Total</span><strong>${money(order.totalCents)}</strong></p></div>
<p class="muted">Created ${escape(order.createdAt.toLocaleDateString("en-NL"))}. Status: ${escape(order.status)}.</p><button onclick="window.print()">Print or save as PDF</button></body></html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename="${order.orderNumber}.html"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
