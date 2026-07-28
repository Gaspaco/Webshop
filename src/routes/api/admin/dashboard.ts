import type { APIEvent } from "@solidjs/start/server";
import { desc, eq } from "drizzle-orm";
import { db } from "~/db";
import {
  importJobs,
  orders,
  products,
  productVariants,
  user,
} from "~/db/schema";
import { apiJson, requireAdmin } from "~/lib/admin.server";

export async function GET(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;

  const [productRows, orderRows, customerRows, imports] = await Promise.all([
    db
      .select({
        id: products.id,
        name: products.name,
        slug: products.slug,
        description: products.description,
        game: products.game,
        productType: products.productType,
        status: products.status,
        imageUrls: products.imageUrls,
        metadata: products.metadata,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
        variantId: productVariants.id,
        sku: productVariants.sku,
        condition: productVariants.condition,
        language: productVariants.language,
        priceCents: productVariants.priceCents,
        compareAtPriceCents: productVariants.compareAtPriceCents,
        stock: productVariants.stock,
        reservedStock: productVariants.reservedStock,
      })
      .from(products)
      .leftJoin(productVariants, eq(productVariants.productId, products.id))
      .orderBy(desc(products.updatedAt))
      .limit(250),
    db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        email: orders.email,
        status: orders.status,
        currency: orders.currency,
        totalCents: orders.totalCents,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .orderBy(desc(orders.createdAt))
      .limit(150),
    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image,
        role: user.role,
        createdAt: user.createdAt,
      })
      .from(user)
      .orderBy(desc(user.createdAt))
      .limit(200),
    db
      .select()
      .from(importJobs)
      .orderBy(desc(importJobs.createdAt))
      .limit(20),
  ]);

  const productMap = new Map<string, (typeof productRows)[number]>();
  for (const product of productRows) {
    if (!productMap.has(product.id)) productMap.set(product.id, product);
  }
  const catalog = [...productMap.values()];
  const customers = customerRows.filter(customer => customer.role !== "admin");
  const paidRevenue = orderRows
    .filter(order =>
      ["paid", "processing", "shipped", "completed"].includes(order.status),
    )
    .reduce((sum, order) => sum + order.totalCents, 0);

  return apiJson({
    owner: {
      id: guard.session!.user.id,
      name: guard.session!.user.name,
      email: guard.session!.user.email,
      image: guard.session!.user.image ?? null,
    },
    metrics: {
      revenueCents: paidRevenue,
      activeProducts: catalog.filter(product => product.status === "active").length,
      openOrders: orderRows.filter(order =>
        ["pending", "paid", "processing"].includes(order.status),
      ).length,
      lowStock: catalog.filter(
        product =>
          product.status === "active" &&
          (product.stock ?? 0) - (product.reservedStock ?? 0) <= 3,
      ).length,
      customers: customers.length,
    },
    products: catalog,
    orders: orderRows,
    customers,
    imports,
  });
}
