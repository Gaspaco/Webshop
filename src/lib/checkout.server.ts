import { and, eq, sql } from "drizzle-orm";
import { PaymentMethod, type PaymentCreateParams } from "@mollie/api-client";
import { z } from "zod";
import { db } from "~/db";
import {
  discountCodes,
  inventoryMovements,
  orderItems,
  orders,
  payments,
  products,
  productVariants,
} from "~/db/schema";
import { getAuthEnv, getEmailEnv } from "~/lib/env.server";
import {
  escapeEmailHtml,
  sendTransactionalEmail,
} from "~/lib/email.server";
import { getMollieClient } from "~/lib/mollie.server";
import {
  findShippingDestination,
  getInternationalPostnlPrice,
} from "~/lib/shipping";
import { getStoreProfile } from "~/lib/store-profile.server";

const shippingMethodSchema = z.enum([
  "postnl_letterbox",
  "postnl_parcel",
  "postnl_international",
]);
const paymentMethodSchema = z.enum(["mollie", "bank"]);

const checkoutInputSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(120),
        variantId: z.string().uuid().optional(),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .min(1)
    .max(100),
  customer: z.object({
    email: z.string().trim().email().max(254),
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    address: z.string().trim().min(4).max(160),
    postalCode: z.string().trim().min(3).max(24),
    city: z.string().trim().min(2).max(80),
    country: z.string().trim().min(2).max(80),
    notes: z.string().trim().max(400).optional().default(""),
  }),
  shippingMethod: shippingMethodSchema,
  paymentMethod: paymentMethodSchema,
  discountCode: z.string().trim().max(32).optional().default(""),
});

type CheckoutInput = z.infer<typeof checkoutInputSchema>;
type MolliePaymentStatus =
  | "open"
  | "pending"
  | "authorized"
  | "paid"
  | "failed"
  | "canceled"
  | "cancelled"
  | "expired";

const centsToAmount = (cents: number) => (cents / 100).toFixed(2);

const formatEuros = (cents: number) =>
  new Intl.NumberFormat("en-NL", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);

const normalizeMollieStatus = (status: string): Exclude<MolliePaymentStatus, "canceled"> =>
  status === "canceled" ? "cancelled" : (status as Exclude<MolliePaymentStatus, "canceled">);

function makeOrderNumber() {
  return `TCG-${crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`;
}

function appUrl(path: string) {
  return new URL(path, getAuthEnv().BETTER_AUTH_URL).toString();
}

async function sendPaidOrderEmails(orderId: string) {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order) throw new Error("Paid order could not be loaded for email delivery.");

  const items = await db
    .select({
      name: orderItems.name,
      quantity: orderItems.quantity,
      totalCents: orderItems.totalCents,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));
  const profile = await getStoreProfile();
  const ownerNotificationEmail =
    getEmailEnv()?.ORDER_NOTIFICATION_EMAIL ?? profile.businessEmail;
  const address = order.shippingAddress as {
    firstName?: string;
    lastName?: string;
    streetAndHouseNumber?: string;
    postalCode?: string;
    city?: string;
    country?: string;
  };
  const itemText = items
    .map(item => `${item.quantity} × ${item.name} — ${formatEuros(item.totalCents)}`)
    .join("\n");
  const itemHtml = items
    .map(
      item =>
        `<tr><td style="padding:8px 0;color:#26332c">${item.quantity} × ${escapeEmailHtml(item.name)}</td><td style="padding:8px 0;text-align:right;color:#26332c">${escapeEmailHtml(formatEuros(item.totalCents))}</td></tr>`,
    )
    .join("");
  const summaryText = `Subtotal: ${formatEuros(order.subtotalCents)}\nShipping: ${formatEuros(order.shippingCents)}\nDiscount: ${formatEuros(order.discountCents)}\nTotal: ${formatEuros(order.totalCents)}`;
  const summaryHtml = `<table style="width:100%;border-top:1px solid #dce3df;margin-top:16px;padding-top:12px"><tr><td>Subtotal</td><td style="text-align:right">${escapeEmailHtml(formatEuros(order.subtotalCents))}</td></tr><tr><td>Shipping</td><td style="text-align:right">${escapeEmailHtml(formatEuros(order.shippingCents))}</td></tr>${order.discountCents > 0 ? `<tr><td>Discount</td><td style="text-align:right">−${escapeEmailHtml(formatEuros(order.discountCents))}</td></tr>` : ""}<tr><td style="padding-top:10px;font-weight:700">Total</td><td style="padding-top:10px;text-align:right;font-weight:700">${escapeEmailHtml(formatEuros(order.totalCents))}</td></tr></table>`;
  const customerName = [address.firstName, address.lastName].filter(Boolean).join(" ");
  const deliveryText = [
    customerName,
    address.streetAndHouseNumber,
    [address.postalCode, address.city].filter(Boolean).join(" "),
    address.country,
  ]
    .filter(Boolean)
    .join("\n");
  const deliveryHtml = [
    customerName,
    address.streetAndHouseNumber,
    [address.postalCode, address.city].filter(Boolean).join(" "),
    address.country,
  ]
    .filter(Boolean)
    .map(value => escapeEmailHtml(value!))
    .join("<br>");
  const shell = (heading: string, intro: string) => `<!doctype html><html lang="en"><body style="margin:0;background:#f4f6f5;color:#111713;font-family:Arial,sans-serif"><div style="max-width:600px;margin:0 auto;padding:40px 20px"><div style="background:#0a0d0c;color:#fff;padding:18px 24px;font-weight:700">TCGHaven</div><div style="background:#fff;padding:30px 24px"><h1 style="margin:0 0 10px;font-size:24px">${escapeEmailHtml(heading)}</h1><p style="margin:0 0 24px;line-height:1.6;color:#46514b">${escapeEmailHtml(intro)}</p><table style="width:100%;border-collapse:collapse">${itemHtml}</table>${summaryHtml}<h2 style="margin:28px 0 8px;font-size:17px">Delivery address</h2><p style="margin:0;line-height:1.6;color:#46514b">${deliveryHtml}</p></div></div></body></html>`;

  await Promise.all([
    sendTransactionalEmail({
      to: order.email,
      subject: `Order confirmed — ${order.orderNumber}`,
      text: `Thanks for your order${customerName ? `, ${customerName}` : ""}.\n\nOrder ${order.orderNumber}\n\n${itemText}\n\n${summaryText}\n\nDelivery address\n${deliveryText}`,
      html: shell(
        `Order ${order.orderNumber} is confirmed`,
        "Thanks for your order. Payment was received and your order is now being prepared.",
      ),
      idempotencyKey: `paid-customer-${order.id}`,
    }),
    sendTransactionalEmail({
      to: ownerNotificationEmail,
      replyTo: order.email,
      subject: `New paid order — ${order.orderNumber}`,
      text: `A paid order was received from ${order.email}.\n\n${itemText}\n\n${summaryText}\n\nDelivery address\n${deliveryText}`,
      html: shell(
        `New paid order ${order.orderNumber}`,
        `Payment was received from ${order.email}.`,
      ),
      idempotencyKey: `paid-owner-${order.id}`,
    }),
  ]);
}

async function releaseOrderReservations(orderId: string, discountId: string | null) {
  await db.transaction(async tx => {
    const reservedItems = await tx
      .select({
        variantId: orderItems.variantId,
        quantity: orderItems.quantity,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));

    for (const item of reservedItems) {
      if (!item.variantId) continue;
      await tx
        .update(productVariants)
        .set({
          reservedStock: sql`greatest(${productVariants.reservedStock} - ${item.quantity}, 0)`,
        })
        .where(eq(productVariants.id, item.variantId));
    }

    await tx
      .update(orders)
      .set({ status: "cancelled" })
      .where(eq(orders.id, orderId));

    if (discountId) {
      await tx
        .update(discountCodes)
        .set({ usedCount: sql`greatest(${discountCodes.usedCount} - 1, 0)` })
        .where(eq(discountCodes.id, discountId));
    }
  });
}

export async function calculateTrustedCheckout(input: unknown) {
  const parsed = checkoutInputSchema.parse(input);
  const destination = findShippingDestination(parsed.customer.country);
  if (!destination) {
    throw new Error("Shipping is not configured for this destination yet.");
  }
  const storeProfile = await getStoreProfile();
  const lines = await Promise.all(parsed.items.map(async item => {
    const [databaseProduct] = await db
          .select({
            id: products.id,
            slug: products.slug,
            name: products.name,
            imageUrls: products.imageUrls,
            variantImageUrl: productVariants.imageUrl,
            variantId: productVariants.id,
            sku: productVariants.sku,
            priceCents: productVariants.priceCents,
            stock: productVariants.stock,
            reservedStock: productVariants.reservedStock,
            status: products.status,
          })
          .from(products)
          .innerJoin(productVariants, eq(productVariants.productId, products.id))
          .where(
            and(
              eq(products.slug, item.id),
              item.variantId
                ? eq(productVariants.id, item.variantId)
                : undefined,
            ),
          )
          .limit(1);

    if (databaseProduct) {
      if (
        databaseProduct.status !== "active" ||
        databaseProduct.stock - databaseProduct.reservedStock < item.quantity
      ) {
        throw new Error(`Product is not purchasable: ${item.id}`);
      }
      return {
        id: databaseProduct.slug,
        variantId: databaseProduct.variantId,
        sku: databaseProduct.sku,
        name: databaseProduct.name,
        image: databaseProduct.variantImageUrl ?? databaseProduct.imageUrls[0] ?? "",
        quantity: item.quantity,
        unitPriceCents: databaseProduct.priceCents,
        totalCents: databaseProduct.priceCents * item.quantity,
      };
    }

    throw new Error(`Product is not purchasable: ${item.id}`);
  }));

  const subtotalCents = lines.reduce((sum, item) => sum + item.totalCents, 0);
  let discount: typeof discountCodes.$inferSelect | undefined;
  let discountCents = 0;
  const requestedDiscount = parsed.discountCode.trim().toUpperCase();
  if (requestedDiscount) {
    const [storedDiscount] = await db
      .select()
      .from(discountCodes)
      .where(
        and(
          eq(discountCodes.code, requestedDiscount),
          eq(discountCodes.active, true),
        ),
      )
      .limit(1);
    const now = new Date();
    const usable =
      storedDiscount &&
      (!storedDiscount.startsAt || storedDiscount.startsAt <= now) &&
      (!storedDiscount.expiresAt || storedDiscount.expiresAt > now) &&
      subtotalCents >= storedDiscount.minimumOrderCents &&
      (storedDiscount.maximumUses === null ||
        storedDiscount.usedCount < storedDiscount.maximumUses);
    if (!usable) throw new Error("Discount code is not valid for this order.");
    discount = storedDiscount;
    discountCents =
      discount.type === "percentage"
        ? Math.round((subtotalCents * discount.value) / 100)
        : discount.value;
    discountCents = Math.min(discountCents, subtotalCents);
  }
  const isDutchOrder = destination.code === "NL";
  const validMethod = isDutchOrder
    ? parsed.shippingMethod === "postnl_letterbox" ||
      parsed.shippingMethod === "postnl_parcel"
    : parsed.shippingMethod === "postnl_international";
  if (!validMethod) {
    throw new Error("The selected shipping method is not valid for this destination.");
  }

  const selectedShippingCents = isDutchOrder
    ? parsed.shippingMethod === "postnl_letterbox"
      ? storeProfile.postnlLetterboxCents
      : storeProfile.postnlParcelCents
    : getInternationalPostnlPrice(
        destination.code,
        storeProfile.internationalPostnlRates,
      );
  if (selectedShippingCents === null) {
    throw new Error("Shipping is not configured for this destination yet.");
  }
  const shippingCents =
    subtotalCents >= storeProfile.freeShippingThresholdCents
      ? 0
      : selectedShippingCents;

  return {
    ...parsed,
    lines,
    subtotalCents,
    discountId: discount?.id ?? null,
    discountCode: discount?.code ?? null,
    discountCents,
    shippingCents,
    taxCents: 0,
    totalCents: subtotalCents - discountCents + shippingCents,
  };
}

export async function createCheckoutPayment(input: unknown, userId?: string) {
  const checkout = await calculateTrustedCheckout(input);
  const orderNumber = makeOrderNumber();
  const address = {
    firstName: checkout.customer.firstName,
    lastName: checkout.customer.lastName,
    streetAndHouseNumber: checkout.customer.address,
    postalCode: checkout.customer.postalCode,
    city: checkout.customer.city,
    country: checkout.customer.country,
  };

  const order = await db.transaction(async tx => {
    for (const line of checkout.lines) {
      if (!line.variantId) continue;

      const reserved = await tx
        .update(productVariants)
        .set({
          reservedStock: sql`${productVariants.reservedStock} + ${line.quantity}`,
        })
        .where(
          and(
            eq(productVariants.id, line.variantId),
            sql`${productVariants.stock} - ${productVariants.reservedStock} >= ${line.quantity}`,
          ),
        )
        .returning({ id: productVariants.id });

      if (!reserved.length) {
        throw new Error(`Product is no longer available: ${line.id}`);
      }
    }

    const [createdOrder] = await tx
      .insert(orders)
      .values({
        orderNumber,
        userId: userId ?? null,
        email: checkout.customer.email,
        status: "pending",
        currency: "EUR",
        subtotalCents: checkout.subtotalCents,
        shippingCents: checkout.shippingCents,
        taxCents: checkout.taxCents,
        discountCode: checkout.discountCode,
        discountCents: checkout.discountCents,
        shippingMethod: checkout.shippingMethod,
        totalCents: checkout.totalCents,
        billingAddress: address,
        shippingAddress: address,
        notes: checkout.customer.notes || null,
      })
      .returning();

    if (!createdOrder) throw new Error("Could not create order.");

    await tx.insert(orderItems).values(
      checkout.lines.map(line => ({
        orderId: createdOrder.id,
        variantId: line.variantId,
        sku: line.sku,
        name: line.name,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        totalCents: line.totalCents,
      })),
    );

    if (checkout.discountId) {
      await tx
        .update(discountCodes)
        .set({ usedCount: sql`${discountCodes.usedCount} + 1` })
        .where(eq(discountCodes.id, checkout.discountId));
    }

    return createdOrder;
  });

  const paymentParameters: PaymentCreateParams = {
    amount: {
      currency: "EUR",
      value: centsToAmount(checkout.totalCents),
    },
    description: `TCGHaven order ${order.orderNumber}`,
    redirectUrl: appUrl(`/checkout?order=${encodeURIComponent(order.orderNumber)}`),
    webhookUrl: appUrl("/api/payments/mollie-webhook"),
    metadata: {
      orderId: order.id,
      orderNumber: order.orderNumber,
    },
  };

  if (checkout.paymentMethod === "bank") {
    paymentParameters.method = PaymentMethod.banktransfer;
  }

  let molliePayment;
  try {
    molliePayment = await getMollieClient().payments.create(paymentParameters);
  } catch (error) {
    await releaseOrderReservations(order.id, checkout.discountId);
    throw error;
  }

  try {
    await db.insert(payments).values({
      orderId: order.id,
      molliePaymentId: molliePayment.id,
      status: normalizeMollieStatus(molliePayment.status),
      amountCents: checkout.totalCents,
      method: molliePayment.method ?? checkout.paymentMethod,
      rawPayload: {
        id: molliePayment.id,
        status: molliePayment.status,
        amount: molliePayment.amount,
        metadata: molliePayment.metadata,
      },
    });
  } catch (error) {
    await getMollieClient().payments.cancel(molliePayment.id).catch(() => undefined);
    await releaseOrderReservations(order.id, checkout.discountId);
    throw error;
  }

  return {
    orderNumber: order.orderNumber,
    checkoutUrl: molliePayment.getCheckoutUrl(),
    amount: {
      currency: "EUR",
      value: centsToAmount(checkout.totalCents),
    },
    recalculated: {
      subtotalCents: checkout.subtotalCents,
      shippingCents: checkout.shippingCents,
      discountCents: checkout.discountCents,
      totalCents: checkout.totalCents,
      lines: checkout.lines,
    },
  };
}

export async function syncMolliePaymentStatus(paymentId: string) {
  const [knownPayment] = await db
    .select({ id: payments.id })
    .from(payments)
    .where(eq(payments.molliePaymentId, paymentId))
    .limit(1);

  if (!knownPayment) {
    return {
      paymentId,
      status: "unknown" as const,
      amountMatches: false,
      orderStatus: "unknown" as const,
    };
  }

  const molliePayment = await getMollieClient().payments.get(paymentId);
  const normalizedStatus = normalizeMollieStatus(molliePayment.status);
  const amountCents = Math.round(Number(molliePayment.amount.value) * 100);

  const result = await db.transaction(async tx => {
    const [storedPayment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.molliePaymentId, paymentId))
      .limit(1)
      .for("update");

    if (!storedPayment) throw new Error("The payment record disappeared during synchronization.");

    const amountMatches = storedPayment.amountCents === amountCents;
    const previousIsTerminal = [
      "paid",
      "failed",
      "cancelled",
      "expired",
      "refunded",
    ].includes(storedPayment.status);
    const effectiveStatus = previousIsTerminal
      ? storedPayment.status
      : amountMatches
        ? normalizedStatus
        : "failed";
    const nextOrderStatus =
      effectiveStatus === "paid"
        ? "paid"
        : effectiveStatus === "failed" ||
            effectiveStatus === "cancelled" ||
            effectiveStatus === "expired"
          ? "cancelled"
          : "pending";
    const firstPaidTransition =
      effectiveStatus === "paid" &&
      ["open", "pending", "authorized"].includes(storedPayment.status);
    const firstReleaseTransition =
      ["failed", "cancelled", "expired"].includes(effectiveStatus) &&
      !["failed", "cancelled", "expired", "paid", "refunded"].includes(
        storedPayment.status,
      );

    if (firstPaidTransition || firstReleaseTransition) {
      const reservedItems = await tx
        .select({
          variantId: orderItems.variantId,
          quantity: orderItems.quantity,
        })
        .from(orderItems)
        .where(eq(orderItems.orderId, storedPayment.orderId));

      for (const item of reservedItems) {
        if (!item.variantId) continue;

        if (firstPaidTransition) {
          await tx
            .update(productVariants)
            .set({
              stock: sql`greatest(${productVariants.stock} - ${item.quantity}, 0)`,
              reservedStock: sql`greatest(${productVariants.reservedStock} - ${item.quantity}, 0)`,
            })
            .where(eq(productVariants.id, item.variantId));
          await tx.insert(inventoryMovements).values({
            variantId: item.variantId,
            quantity: 0 - item.quantity,
            reason: "sale",
            reference: storedPayment.orderId,
            note: `Stock committed after Mollie payment ${paymentId}`,
          });
        } else {
          await tx
            .update(productVariants)
            .set({
              reservedStock: sql`greatest(${productVariants.reservedStock} - ${item.quantity}, 0)`,
            })
            .where(eq(productVariants.id, item.variantId));
        }
      }
    }

    await tx
      .update(payments)
      .set({
        status: effectiveStatus,
        method: molliePayment.method ?? storedPayment.method,
        paidAt:
          effectiveStatus === "paid"
            ? storedPayment.paidAt ?? new Date()
            : storedPayment.paidAt,
        rawPayload: {
          id: molliePayment.id,
          status: molliePayment.status,
          amount: molliePayment.amount,
          method: molliePayment.method,
          metadata: molliePayment.metadata,
          amountMatches,
        },
      })
      .where(eq(payments.id, storedPayment.id));

    await tx
      .update(orders)
      .set({
        status: nextOrderStatus,
      })
      .where(eq(orders.id, storedPayment.orderId));

    return {
      paymentId,
      status: effectiveStatus,
      amountMatches,
      orderStatus: nextOrderStatus,
      orderId: storedPayment.orderId,
      sendPaidEmail: firstPaidTransition,
    };
  });

  if (result.sendPaidEmail) {
    try {
      await sendPaidOrderEmails(result.orderId);
    } catch (error) {
      console.error("Paid order email delivery failed.", error);
    }
  }

  return {
    paymentId: result.paymentId,
    status: result.status,
    amountMatches: result.amountMatches,
    orderStatus: result.orderStatus,
  };
}

export function parseCheckoutInput(input: unknown): CheckoutInput {
  return checkoutInputSchema.parse(input);
}
