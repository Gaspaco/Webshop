import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { Payment, PaymentCreateParams } from "@mollie/api-client";
import { z } from "zod";
import { db } from "~/db";
import {
  discountCodes,
  inventoryMovements,
  orderItems,
  orderEmailJobs,
  orders,
  payments,
  products,
  productVariants,
} from "~/db/schema";
import { getAuthEnv, getEmailEnv } from "~/lib/env.server";
import {
  emailAddress,
  emailDetails,
  emailOrderItems,
  renderTransactionalEmail,
  sendTransactionalEmail,
} from "~/lib/email.server";
import { getMollieClient } from "~/lib/mollie.server";
import {
  findShippingDestination,
  getInternationalPostnlPrice,
  isShippingMethodAllowed,
} from "~/lib/shipping";
import { getStoreProfile } from "~/lib/store-profile.server";
import { makeGuestOrderToken, hashGuestOrderToken } from "~/lib/guest-order-access";
import { nextFulfilmentStatus } from "~/lib/payment-state";
import { logServerError } from "~/lib/server-log";
import { syncPaymentRefunds } from "~/lib/refunds.server";
import { acquireOperationLease, releaseOperationLease } from "~/lib/operation-lease.server";
import { canReplayProviderRequest, mollieCredentialHash, openPaymentParameters, providerDefinitivelyRejected, sealPaymentParameters } from "~/lib/provider-recovery.server";

const shippingMethodSchema = z.enum([
  "postnl_letterbox",
  "postnl_parcel",
  "postnl_international",
  "local_pickup",
]);
const paymentMethodSchema = z.literal("mollie");

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

async function sendPaidOrderEmail(orderId: string, audience: string) {
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
    .map(item => `${item.quantity} × ${item.name}: ${formatEuros(item.totalCents)}`)
    .join("\n");
  const summaryText = `Subtotal: ${formatEuros(order.subtotalCents)}\nShipping: ${formatEuros(order.shippingCents)}\nDiscount: ${formatEuros(order.discountCents)}\nTotal: ${formatEuros(order.totalCents)}`;
  const customerName = [address.firstName, address.lastName].filter(Boolean).join(" ");
  const isPickup = order.shippingMethod === "local_pickup";
  const deliveryText = [
    customerName,
    address.streetAndHouseNumber,
    [address.postalCode, address.city].filter(Boolean).join(" "),
    address.country,
  ]
    .filter(Boolean)
    .join("\n");
  const deliveryLines = [
    customerName,
    address.streetAndHouseNumber,
    [address.postalCode, address.city].filter(Boolean).join(" "),
    address.country,
  ].filter((line): line is string => Boolean(line));
  const orderDetailsHtml =
    emailDetails([
      { label: "Order number", value: order.orderNumber },
      { label: isPickup ? "Collection" : "Delivery", value: isPickup ? "Local pickup" : "PostNL" },
    ]) +
    emailOrderItems(
      items.map(item => ({ name: item.name, quantity: item.quantity, total: formatEuros(item.totalCents) })),
      [
        { label: "Subtotal", value: formatEuros(order.subtotalCents) },
        { label: "Shipping", value: formatEuros(order.shippingCents) },
        ...(order.discountCents > 0
          ? [{ label: "Discount", value: `−${formatEuros(order.discountCents)}`, accent: true }]
          : []),
        { label: "Total paid", value: formatEuros(order.totalCents), total: true },
      ],
    ) +
    emailAddress(isPickup ? "Pickup contact details" : "Delivery address", deliveryLines);

  const messages = [
    {
      to: order.email,
      replyTo: profile.businessEmail,
      subject: `Order confirmed: ${order.orderNumber}`,
      text: `Thanks for your order${customerName ? `, ${customerName}` : ""}.\n\nOrder ${order.orderNumber}\n\n${itemText}\n\n${summaryText}\n\n${isPickup ? "Pickup contact details" : "Delivery address"}\n${deliveryText}`,
      html: renderTransactionalEmail({
        preheader: `Payment received for ${order.orderNumber}. Your order is being prepared.`,
        label: "Payment received",
        heading: "Your order is confirmed",
        intro: `Thanks for your order${customerName ? `, ${customerName}` : ""}. We received your payment and will prepare your items ${isPickup ? "for collection" : "for PostNL delivery"}.`,
        contentHtml: orderDetailsHtml,
        ...(order.userId
          ? {
              action: {
                label: "View order history",
                url: appUrl("/account?section=orders"),
              },
            }
          : {}),
        notice: isPickup
          ? `We will contact you when the order is ready to collect from ${profile.businessAddress || "TCGHaven"}.`
          : "We will send another email with tracking information as soon as your parcel is ready.",
      }),
      idempotencyKey: `paid-customer-${order.id}`,
    },
    {
      to: ownerNotificationEmail,
      replyTo: order.email,
      subject: `New paid order: ${order.orderNumber}`,
      text: `A paid ${isPickup ? "pickup " : ""}order was received from ${order.email}.\n\n${itemText}\n\n${summaryText}\n\n${isPickup ? "Pickup contact details" : "Delivery address"}\n${deliveryText}`,
      html: renderTransactionalEmail({
        preheader: `${order.orderNumber} has been paid and is ready for fulfilment.`,
        label: "Owner notification",
        heading: "A paid order is ready",
        intro: `Payment was received from ${order.email}. Review the order and prepare it for ${isPickup ? "collection" : "dispatch"}.`,
        contentHtml: orderDetailsHtml,
        action: {
          label: "Open order dashboard",
          url: appUrl("/admin"),
        },
      }),
      idempotencyKey: `paid-owner-${order.id}`,
    },
  ];
  if (audience !== "customer" && audience !== "owner") throw new Error("Unknown order email audience.");
  await sendTransactionalEmail(messages[audience === "customer" ? 0 : 1]!);
}

/** At-least-once SMTP delivery with durable per-recipient jobs and backoff.
 * SMTP cannot promise exactly-once delivery after a lost acknowledgement. */
export async function processPaidOrderEmails(orderId?: string, limit = 10) {
  const due = and(
    orderId ? eq(orderEmailJobs.orderId, orderId) : undefined,
    or(eq(orderEmailJobs.status, "pending"), eq(orderEmailJobs.status, "failed"), eq(orderEmailJobs.status, "sending")),
    lte(orderEmailJobs.nextAttemptAt, new Date()),
    or(isNull(orderEmailJobs.leaseUntil), lte(orderEmailJobs.leaseUntil, new Date())),
  );
  const jobs = await db.select({ id: orderEmailJobs.id }).from(orderEmailJobs).where(due)
    .orderBy(asc(orderEmailJobs.nextAttemptAt)).limit(limit);
  for (const candidate of jobs) {
    const token = crypto.randomUUID();
    const [job] = await db.update(orderEmailJobs).set({ status: "sending", leaseToken: token,
      leaseUntil: new Date(Date.now() + 90_000), attempts: sql`${orderEmailJobs.attempts} + 1` })
      .where(and(eq(orderEmailJobs.id, candidate.id), due)).returning();
    if (!job) continue;
    const owned = and(eq(orderEmailJobs.id, job.id), eq(orderEmailJobs.leaseToken, token));
    try {
      await sendPaidOrderEmail(job.orderId, job.audience);
      await db.update(orderEmailJobs).set({ status: "sent", sentAt: new Date(), leaseUntil: null, leaseToken: null }).where(owned);
    } catch (error) {
      await db.update(orderEmailJobs).set({ status: "failed", leaseUntil: null, leaseToken: null,
        nextAttemptAt: new Date(Date.now() + Math.min(3_600_000, 30_000 * 2 ** Math.min(job.attempts, 7))) }).where(owned);
      logServerError("Paid order email delivery queued for retry.", error);
    }
  }
}

export async function retryPaidOrderEmails(orderId: string) {
  await db.update(orderEmailJobs).set({ nextAttemptAt: new Date() }).where(and(
    eq(orderEmailJobs.orderId, orderId), inArray(orderEmailJobs.status, ["pending", "failed"]),
    or(isNull(orderEmailJobs.leaseUntil), lte(orderEmailJobs.leaseUntil, new Date())),
  ));
  await processPaidOrderEmails(orderId);
  return db.select({ audience: orderEmailJobs.audience, status: orderEmailJobs.status }).from(orderEmailJobs).where(eq(orderEmailJobs.orderId, orderId));
}

async function releaseOrderReservations(orderId: string) {
  await db.transaction(tx => releaseOrderReservationsInTransaction(tx, orderId));
}

async function releaseOrderReservationsInTransaction(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], orderId: string) {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1).for("update");
    if (!order || order.status !== "pending") return;
    await releaseDiscountReservation(tx, orderId);
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

}

async function releaseDiscountReservation(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], orderId: string) {
  const [released] = await tx.update(orders).set({ discountReleased: true })
    .where(and(eq(orders.id, orderId), eq(orders.discountReleased, false)))
    .returning({ code: orders.discountCode });
  if (released?.code) await tx.update(discountCodes)
    .set({ usedCount: sql`greatest(${discountCodes.usedCount} - 1, 0)` })
    .where(eq(discountCodes.code, released.code));
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
  if (!isShippingMethodAllowed(destination.code, parsed.shippingMethod)) {
    throw new Error("The selected shipping method is not valid for this destination.");
  }

  const selectedShippingCents = parsed.shippingMethod === "local_pickup"
    ? 0
    : isDutchOrder
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
    parsed.shippingMethod === "local_pickup" ||
    subtotalCents >= storeProfile.freeShippingThresholdCents
      ? 0
      : selectedShippingCents;

  return {
    ...parsed,
    lines,
    subtotalCents,
    discountId: discount?.id ?? null,
    discountCode: discount?.code ?? null,
    discountSnapshot: discount ? { type: discount.type, value: discount.value } : null,
    discountCents,
    shippingCents,
    taxCents: 0,
    totalCents: subtotalCents - discountCents + shippingCents,
  };
}

export async function createCheckoutPayment(input: unknown, userId?: string) {
  const checkout = await calculateTrustedCheckout(input);
  const orderNumber = makeOrderNumber();
  const guestToken = makeGuestOrderToken();
  const address = {
    firstName: checkout.customer.firstName,
    lastName: checkout.customer.lastName,
    streetAndHouseNumber: checkout.customer.address,
    postalCode: checkout.customer.postalCode,
    city: checkout.customer.city,
    country: checkout.customer.country,
  };

  const order = await db.transaction(async tx => {
    if (checkout.discountId && checkout.discountSnapshot) {
      const claimed = await tx.update(discountCodes)
        .set({ usedCount: sql`${discountCodes.usedCount} + 1` })
        .where(and(
          eq(discountCodes.id, checkout.discountId), eq(discountCodes.active, true),
          eq(discountCodes.type, checkout.discountSnapshot.type),
          eq(discountCodes.value, checkout.discountSnapshot.value),
          sql`${discountCodes.minimumOrderCents} <= ${checkout.subtotalCents}`,
          sql`(${discountCodes.maximumUses} is null or ${discountCodes.usedCount} < ${discountCodes.maximumUses})`,
          sql`(${discountCodes.startsAt} is null or ${discountCodes.startsAt} <= now())`,
          sql`(${discountCodes.expiresAt} is null or ${discountCodes.expiresAt} > now())`,
        )).returning({ id: discountCodes.id });
      if (!claimed.length) throw new Error("Discount code is no longer valid for this order.");
    }
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
        guestAccessHash: hashGuestOrderToken(guestToken),
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

    const paymentParameters: PaymentCreateParams = {
      amount: { currency: "EUR", value: centsToAmount(checkout.totalCents) },
      description: `TCGHaven order ${createdOrder.orderNumber}`,
      redirectUrl: appUrl(`/checkout?order=${encodeURIComponent(createdOrder.orderNumber)}&access=${guestToken}`),
      webhookUrl: appUrl("/api/payments/mollie-webhook"),
      metadata: { orderId: createdOrder.id, orderNumber: createdOrder.orderNumber, recoveryToken: crypto.randomUUID() },
      idempotencyKey: `checkout-${createdOrder.id}`,
    };
    await tx.update(orders).set({ paymentCreationState: "creating", paymentCreationStartedAt: new Date(),
      paymentCredentialHash: mollieCredentialHash(), paymentParametersEncrypted: sealPaymentParameters(paymentParameters) })
      .where(eq(orders.id, createdOrder.id));

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

    return createdOrder;
  });

  const molliePayment = await recoverCheckoutPayment(order.id);

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

type ProviderPayment = Payment;

async function attachPayment(order: typeof orders.$inferSelect, payment: ProviderPayment) {
  if (!order.paymentParametersEncrypted) throw new Error("Missing durable payment parameters.");
  const parameters = openPaymentParameters<PaymentCreateParams>(order.paymentParametersEncrypted);
  const identity = payment.metadata as { orderId?: string; recoveryToken?: string } | null;
  const expected = parameters.metadata as { recoveryToken: string };
  if (identity?.orderId !== order.id || identity.recoveryToken !== expected.recoveryToken ||
    payment.amount.currency !== "EUR" || Math.round(Number(payment.amount.value) * 100) !== order.totalCents) {
    throw new Error("Recovered payment identity mismatch.");
  }
  await db.transaction(async tx => {
    await tx.select({ id: orders.id }).from(orders).where(eq(orders.id, order.id)).for("update");
    const [existing] = await tx.select().from(payments).where(eq(payments.orderId, order.id)).limit(1);
    if (existing && existing.molliePaymentId !== payment.id) throw new Error("Order already has a different payment.");
    if (!existing) await tx.insert(payments).values({ orderId: order.id, molliePaymentId: payment.id,
      status: "open", amountCents: order.totalCents, method: payment.method ?? "mollie" });
    await tx.update(orders).set({ paymentCreationState: "linked" }).where(eq(orders.id, order.id));
  });
}

export async function recoverCheckoutPayment(orderId: string) {
  const key = `checkout-create:${orderId}`;
  const token = await acquireOperationLease(key);
  if (!token) throw new Error("Payment recovery is already running. Try again shortly.");
  try {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) throw new Error("Order not found.");
    const [existing] = await db.select().from(payments).where(eq(payments.orderId, orderId)).limit(1);
    if (existing) return await getMollieClient().payments.get(existing.molliePaymentId);
    if (!order.paymentParametersEncrypted || !order.paymentCreationStartedAt || order.paymentCreationState === "failed") {
      throw new Error("This order has no recoverable payment attempt.");
    }
    let payment: ProviderPayment;
    if (canReplayProviderRequest(order.paymentCreationStartedAt, order.paymentCredentialHash)) {
      // Exact same parameters, same key, same API credential, within Mollie's
      // one-hour cache. Never blindly replay after a credential rotation.
      try { payment = await getMollieClient().payments.create(openPaymentParameters<PaymentCreateParams>(order.paymentParametersEncrypted)); }
      catch (error) {
        await db.update(orders).set({ paymentCreationState: providerDefinitivelyRejected(error) ? "failed" : "unknown" }).where(eq(orders.id, orderId));
        if (providerDefinitivelyRejected(error)) await releaseOrderReservations(orderId);
        throw error;
      }
    } else {
      // Once the idempotency window expires only look up existing operations.
      // A bounded scan that cannot establish identity must fail closed.
      let found: ProviderPayment | undefined;
      let count = 0;
      for await (const candidate of getMollieClient().payments.iterate()) {
        if (++count > 1000) throw new Error("Payment needs manual Mollie reconciliation.");
        if ((candidate.metadata as { orderId?: string } | null)?.orderId === orderId) {
          if (found) throw new Error("Multiple payments need owner review.");
          found = candidate;
        }
      }
      if (!found) throw new Error("Payment needs manual Mollie reconciliation; stock remains reserved.");
      payment = found;
    }
    await attachPayment(order, payment);
    return payment;
  } finally { await releaseOperationLease(key, token); }
}

export async function cancelCheckoutOrder(orderId: string) {
  const payment = await recoverCheckoutPayment(orderId);
  if (["paid", "authorized"].includes(payment.status)) {
    await syncMolliePaymentStatus(payment.id);
    throw new Error("Payment was received or authorized. Use the refund flow instead.");
  }
  if (!["canceled", "failed", "expired"].includes(payment.status)) {
    try { await getMollieClient().payments.cancel(payment.id); }
    catch (error) {
      await syncMolliePaymentStatus(payment.id);
      throw new Error("Mollie has not confirmed cancellation. Check the payment before trying again.");
    }
  }
  const synced = await syncMolliePaymentStatus(payment.id);
  if (!["cancelled", "failed", "expired"].includes(synced.status)) throw new Error("Mollie has not confirmed cancellation. No stock was released.");
  return { id: orderId, status: "cancelled" };
}

/** Last-resort, explicitly owner-reviewed resolution after the replay window.
 * A complete provider scan must confirm no matching operation before release. */
export async function resolveMissingCheckoutPayment(orderId: string) {
  const key = `checkout-create:${orderId}`;
  const token = await acquireOperationLease(key);
  if (!token) throw new Error("Payment recovery is already running.");
  try {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order || order.status !== "pending" || !order.paymentCreationStartedAt ||
      Date.now() - order.paymentCreationStartedAt.getTime() < 60 * 60_000) throw new Error("Wait at least one hour and check Mollie first.");
    let count = 0;
    for await (const payment of getMollieClient().payments.iterate()) {
      if (++count > 1000) throw new Error("Provider scan incomplete. Reservations remain held.");
      if ((payment.metadata as { orderId?: string } | null)?.orderId === orderId) {
        await attachPayment(order, payment);
        throw new Error("A matching payment exists. Recover/check it instead; no reservation was released.");
      }
    }
    await db.transaction(async tx => {
      await tx.select({ id: orders.id }).from(orders).where(eq(orders.id, orderId)).for("update");
      const [existing] = await tx.select({ id: payments.id }).from(payments).where(eq(payments.orderId, orderId)).limit(1);
      if (existing) throw new Error("A payment is linked. Reconcile it instead.");
      await tx.update(orders).set({ paymentCreationState: "failed" }).where(eq(orders.id, orderId));
      await releaseOrderReservationsInTransaction(tx, orderId);
    });
  } finally { await releaseOperationLease(key, token); }
}

export async function syncMolliePaymentStatus(paymentId: string) {
  const [knownPayment] = await db
    .select({ id: payments.id })
    .from(payments)
    .where(eq(payments.molliePaymentId, paymentId))
    .limit(1);

  let molliePayment: ProviderPayment;
  try { molliePayment = await getMollieClient().payments.get(paymentId); }
  catch (error) {
    if (!knownPayment && Number((error as { statusCode?: number }).statusCode) === 404) return { paymentId, status: "unknown", amountMatches: false, orderStatus: "unknown" };
    throw error;
  }
  if (!knownPayment) {
    const orderId = (molliePayment.metadata as { orderId?: string } | null)?.orderId;
    if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) return { paymentId, status: "unknown", amountMatches: false, orderStatus: "unknown" };
    const [recoverable] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!recoverable?.paymentParametersEncrypted) return { paymentId, status: "unknown", amountMatches: false, orderStatus: "unknown" };
    await attachPayment(recoverable, molliePayment);
  }
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

    const [currentOrder] = await tx.select({ status: orders.status }).from(orders)
      .where(eq(orders.id, storedPayment.orderId)).limit(1).for("update");
    if (!currentOrder) throw new Error("Payment order not found.");
    const amountMatches = storedPayment.amountCents === amountCents && molliePayment.amount.currency === "EUR";
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
    const nextOrderStatus = nextFulfilmentStatus(currentOrder.status, effectiveStatus) as typeof orders.$inferSelect.status;
    const firstPaidTransition =
      effectiveStatus === "paid" &&
      ["open", "pending", "authorized"].includes(storedPayment.status);
    const firstReleaseTransition =
      ["failed", "cancelled", "expired"].includes(effectiveStatus) &&
      !["failed", "cancelled", "expired", "paid", "refunded"].includes(
        storedPayment.status,
      );

    if (firstPaidTransition || firstReleaseTransition) {
      if (firstReleaseTransition) await releaseDiscountReservation(tx, storedPayment.orderId);
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

    if (firstPaidTransition) await tx.insert(orderEmailJobs).values([
      { orderId: storedPayment.orderId, audience: "customer" },
      { orderId: storedPayment.orderId, audience: "owner" },
    ]).onConflictDoNothing();

    return {
      paymentId,
      status: effectiveStatus,
      amountMatches,
      orderStatus: nextOrderStatus,
      orderId: storedPayment.orderId,
      sendPaidEmail: firstPaidTransition,
    };
  });

  await processPaidOrderEmails(result.orderId);

  // Refunds have a separate lifecycle from the payment itself.
  await syncPaymentRefunds(paymentId);

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
