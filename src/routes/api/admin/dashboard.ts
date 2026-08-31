import type { APIEvent } from "@solidjs/start/server";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "~/db";
import {
  adminAuditLog,
  contactMessages,
  customerAdminProfiles,
  discountCodes,
  importJobs,
  orderItems,
  orders,
  payments,
  products,
  productVariants,
  returnRequests,
  storefrontContent,
  user,
} from "~/db/schema";
import { apiJson, requireAdmin } from "~/lib/admin.server";
import { ALL_PRODUCTS } from "~/lib/categories";
import { getLaunchReadiness } from "~/lib/readiness.server";
import { parseStoreProfile } from "~/lib/store-profile";

export async function GET(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;

  const [
    productRows,
    orderRows,
    customerRows,
    imports,
    discounts,
    contentRows,
    auditRows,
    returnRows,
    contactRows,
  ] = await Promise.all([
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
        variantName: productVariants.name,
        condition: productVariants.condition,
        language: productVariants.language,
        finish: productVariants.finish,
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
        subtotalCents: orders.subtotalCents,
        shippingCents: orders.shippingCents,
        discountCode: orders.discountCode,
        discountCents: orders.discountCents,
        shippingMethod: orders.shippingMethod,
        totalCents: orders.totalCents,
        shippingAddress: orders.shippingAddress,
        notes: orders.notes,
        trackingNumber: orders.trackingNumber,
        trackingUrl: orders.trackingUrl,
        shippedAt: orders.shippedAt,
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
        notes: customerAdminProfiles.notes,
        tags: customerAdminProfiles.tags,
        suspended: customerAdminProfiles.suspended,
      })
      .from(user)
      .leftJoin(
        customerAdminProfiles,
        eq(customerAdminProfiles.userId, user.id),
      )
      .orderBy(desc(user.createdAt))
      .limit(200),
    db
      .select()
      .from(importJobs)
      .orderBy(desc(importJobs.createdAt))
      .limit(20),
    db
      .select()
      .from(discountCodes)
      .orderBy(desc(discountCodes.createdAt))
      .limit(100),
    db.select().from(storefrontContent),
    db
      .select({
        id: adminAuditLog.id,
        action: adminAuditLog.action,
        entityType: adminAuditLog.entityType,
        entityId: adminAuditLog.entityId,
        summary: adminAuditLog.summary,
        metadata: adminAuditLog.metadata,
        ipAddress: adminAuditLog.ipAddress,
        createdAt: adminAuditLog.createdAt,
        actorName: user.name,
        actorEmail: user.email,
      })
      .from(adminAuditLog)
      .leftJoin(user, eq(adminAuditLog.actorId, user.id))
      .orderBy(desc(adminAuditLog.createdAt))
      .limit(100),
    db
      .select()
      .from(returnRequests)
      .orderBy(desc(returnRequests.createdAt))
      .limit(100),
    db
      .select({
        id: contactMessages.id,
        name: contactMessages.name,
        email: contactMessages.email,
        topic: contactMessages.topic,
        message: contactMessages.message,
        status: contactMessages.status,
        notificationSent: contactMessages.notificationSent,
        createdAt: contactMessages.createdAt,
        updatedAt: contactMessages.updatedAt,
      })
      .from(contactMessages)
      .orderBy(desc(contactMessages.createdAt))
      .limit(150),
  ]);

  const orderIds = orderRows.map(order => order.id);
  const [itemRows, paymentRows] = orderIds.length
    ? await Promise.all([
        db
          .select()
          .from(orderItems)
          .where(inArray(orderItems.orderId, orderIds)),
        db
          .select({
            id: payments.id,
            orderId: payments.orderId,
            status: payments.status,
            method: payments.method,
            amountCents: payments.amountCents,
            molliePaymentId: payments.molliePaymentId,
            paidAt: payments.paidAt,
          })
          .from(payments)
          .where(inArray(payments.orderId, orderIds)),
      ])
    : [[], []];

  const itemsByOrder = new Map<string, typeof itemRows>();
  for (const item of itemRows) {
    const items = itemsByOrder.get(item.orderId) ?? [];
    items.push(item);
    itemsByOrder.set(item.orderId, items);
  }
  const paymentsByOrder = new Map(
    paymentRows.map(payment => [payment.orderId, payment]),
  );
  const returnsByOrder = new Map(
    returnRows.map(returnRequest => [returnRequest.orderId, returnRequest]),
  );

  const productMap = new Map<string, (typeof productRows)[number]>();
  const variantsByProduct = new Map<
    string,
    Array<{
      id: string;
      sku: string;
      name: string;
      condition: string | null;
      language: string | null;
      finish: string | null;
      priceCents: number;
      stock: number;
      reservedStock: number;
    }>
  >();
  for (const product of productRows) {
    if (!productMap.has(product.id)) productMap.set(product.id, product);
    if (product.variantId && product.sku && product.priceCents !== null) {
      const variants = variantsByProduct.get(product.id) ?? [];
      variants.push({
        id: product.variantId,
        sku: product.sku,
        name: product.variantName ?? product.condition ?? "Default",
        condition: product.condition,
        language: product.language,
        finish: product.finish,
        priceCents: product.priceCents,
        stock: product.stock ?? 0,
        reservedStock: product.reservedStock ?? 0,
      });
      variantsByProduct.set(product.id, variants);
    }
  }
  const managedCatalog = [...productMap.values()].map(product => ({
    ...product,
    variants: variantsByProduct.get(product.id) ?? [],
  }));
  const managedSlugs = new Set(managedCatalog.map(product => product.slug));
  const starterCatalog = ALL_PRODUCTS
    .filter(product => !managedSlugs.has(product.id))
    .map(product => {
      const priceCents =
        product.priceCents ?? product.priceRangeCents?.[0] ?? 0;
      const sku = `STARTER-${product.id}`
        .replace(/[^A-Za-z0-9_-]/g, "-")
        .slice(0, 80)
        .toUpperCase();
      const variant = {
        id: `static:${product.id}`,
        sku,
        name: product.condition ?? "Default",
        condition: product.condition ?? null,
        language: product.language ?? "English",
        finish: product.finish ?? null,
        priceCents,
        stock: product.stock ?? 1,
        reservedStock: 0,
      };
      return {
        id: `static:${product.id}`,
        name: product.name,
        slug: product.id,
        description: product.description ?? null,
        game: product.game,
        productType:
          product.productType ?? (product.image ? "single" : "sealed"),
        status: "active" as const,
        imageUrls: product.image ? [product.image] : [],
        metadata: {
          set: product.set ?? null,
          badge: product.badge ?? null,
          cardNumber: product.cardNumber ?? null,
          rarity: product.rarity ?? null,
          setCode: product.setCode ?? null,
          illustrator: product.illustrator ?? null,
          gradingCompany: product.gradingCompany ?? null,
          grade: product.grade ?? null,
          certificationNumber: product.certificationNumber ?? null,
          source: "starter",
        },
        createdAt: new Date(0),
        updatedAt: new Date(0),
        variantId: variant.id,
        sku: variant.sku,
        variantName: variant.name,
        condition: variant.condition,
        language: variant.language,
        finish: variant.finish,
        priceCents: variant.priceCents,
        compareAtPriceCents: null,
        stock: variant.stock,
        reservedStock: variant.reservedStock,
        variants: [variant],
      };
    });
  const catalog = [...managedCatalog, ...starterCatalog];
  const content = Object.fromEntries(
    contentRows.map(contentRow => [contentRow.key, contentRow.value]),
  );
  const storeProfile = parseStoreProfile(content.business);
  const readiness = getLaunchReadiness({
    unconvertedStarterProducts: starterCatalog.length,
    storeProfile,
  });
  const customers = customerRows.filter(customer => customer.role !== "admin");
  const paidRevenue = orderRows
    .filter(order =>
      ["paid", "processing", "shipped", "completed"].includes(order.status),
    )
    .reduce((sum, order) => sum + order.totalCents, 0);
  const salesByDay = new Map<string, { revenueCents: number; orders: number }>();
  for (const order of orderRows) {
    const day = new Date(order.createdAt).toISOString().slice(0, 10);
    const current = salesByDay.get(day) ?? { revenueCents: 0, orders: 0 };
    current.orders += 1;
    if (["paid", "processing", "shipped", "completed"].includes(order.status)) {
      current.revenueCents += order.totalCents;
    }
    salesByDay.set(day, current);
  }
  const customerOrderCounts = new Map<string, { count: number; spentCents: number }>();
  for (const order of orderRows) {
    const current = customerOrderCounts.get(order.email) ?? {
      count: 0,
      spentCents: 0,
    };
    current.count += 1;
    if (["paid", "processing", "shipped", "completed"].includes(order.status)) {
      current.spentCents += order.totalCents;
    }
    customerOrderCounts.set(order.email, current);
  }

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
          product.metadata.source !== "starter" &&
          product.variants.some(
            variant => variant.stock - variant.reservedStock <= 3,
          ),
      ).length,
      customers: customers.length,
      unreadMessages: contactRows.filter(message => message.status === "unread").length,
    },
    products: catalog,
    orders: orderRows.map(order => ({
      ...order,
      items: itemsByOrder.get(order.id) ?? [],
      payment: paymentsByOrder.get(order.id) ?? null,
      returnRequest: returnsByOrder.get(order.id) ?? null,
    })),
    customers: customers.map(customer => ({
      ...customer,
      notes: customer.notes ?? "",
      tags: customer.tags ?? [],
      suspended: customer.suspended ?? false,
      orderCount: customerOrderCounts.get(customer.email)?.count ?? 0,
      spentCents: customerOrderCounts.get(customer.email)?.spentCents ?? 0,
    })),
    contacts: contactRows,
    imports,
    discounts,
    content: { ...content, business: storeProfile },
    audit: auditRows,
    analytics: {
      salesByDay: [...salesByDay.entries()]
        .map(([date, totals]) => ({ date, ...totals }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      averageOrderCents: orderRows.length
        ? Math.round(
            orderRows.reduce((sum, order) => sum + order.totalCents, 0) /
              orderRows.length,
          )
        : 0,
      returningCustomers: [...customerOrderCounts.values()].filter(
        customer => customer.count > 1,
      ).length,
    },
    readiness,
  });
}
