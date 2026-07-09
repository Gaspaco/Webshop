import { eq } from "drizzle-orm";
import { PaymentMethod, type PaymentCreateParams } from "@mollie/api-client";
import { z } from "zod";
import { db } from "~/db";
import { orderItems, orders, payments } from "~/db/schema";
import { findProduct } from "~/lib/categories";
import { getAuthEnv } from "~/lib/env.server";
import { getMollieClient } from "~/lib/mollie.server";

const shippingMethodSchema = z.enum(["letterbox", "tracked", "pickup"]);
const paymentMethodSchema = z.enum(["mollie", "bank"]);

const checkoutInputSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(120),
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

const SHIPPING_CENTS: Record<z.infer<typeof shippingMethodSchema>, number> = {
  letterbox: 395,
  tracked: 695,
  pickup: 0,
};

const centsToAmount = (cents: number) => (cents / 100).toFixed(2);

const normalizeMollieStatus = (status: string): Exclude<MolliePaymentStatus, "canceled"> =>
  status === "canceled" ? "cancelled" : (status as Exclude<MolliePaymentStatus, "canceled">);

function makeOrderNumber() {
  return `TCG-${crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`;
}

function appUrl(path: string) {
  return new URL(path, getAuthEnv().BETTER_AUTH_URL).toString();
}

export function calculateTrustedCheckout(input: unknown) {
  const parsed = checkoutInputSchema.parse(input);
  const lines = parsed.items.map(item => {
    const product = findProduct(item.id);

    if (!product || product.priceCents === undefined || product.priceRangeCents) {
      throw new Error(`Product is not purchasable: ${item.id}`);
    }

    return {
      id: product.id,
      sku: product.id,
      name: product.set ? `${product.name} (${product.set})` : product.name,
      image: product.image ?? "",
      quantity: item.quantity,
      unitPriceCents: product.priceCents,
      totalCents: product.priceCents * item.quantity,
    };
  });

  const subtotalCents = lines.reduce((sum, item) => sum + item.totalCents, 0);
  const shippingCents =
    subtotalCents >= 10000 ? 0 : SHIPPING_CENTS[parsed.shippingMethod];

  return {
    ...parsed,
    lines,
    subtotalCents,
    shippingCents,
    taxCents: 0,
    totalCents: subtotalCents + shippingCents,
  };
}

export async function createCheckoutPayment(input: unknown) {
  const checkout = calculateTrustedCheckout(input);
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
    const [createdOrder] = await tx
      .insert(orders)
      .values({
        orderNumber,
        email: checkout.customer.email,
        status: "pending",
        currency: "EUR",
        subtotalCents: checkout.subtotalCents,
        shippingCents: checkout.shippingCents,
        taxCents: checkout.taxCents,
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
        sku: line.sku,
        name: line.name,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        totalCents: line.totalCents,
      })),
    );

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

  const molliePayment = await getMollieClient().payments.create(paymentParameters);

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
      totalCents: checkout.totalCents,
      lines: checkout.lines,
    },
  };
}

export async function syncMolliePaymentStatus(paymentId: string) {
  const molliePayment = await getMollieClient().payments.get(paymentId);
  const normalizedStatus = normalizeMollieStatus(molliePayment.status);
  const paidAt = normalizedStatus === "paid" ? new Date() : null;
  const amountCents = Math.round(Number(molliePayment.amount.value) * 100);

  const [storedPayment] = await db
    .select()
    .from(payments)
    .where(eq(payments.molliePaymentId, paymentId))
    .limit(1);

  if (!storedPayment) {
    throw new Error(`Unknown Mollie payment: ${paymentId}`);
  }

  const amountMatches = storedPayment.amountCents === amountCents;
  const nextOrderStatus =
    normalizedStatus === "paid" && amountMatches
      ? "paid"
      : normalizedStatus === "failed" ||
          normalizedStatus === "cancelled" ||
          normalizedStatus === "expired"
        ? "cancelled"
        : "pending";

  await db.transaction(async tx => {
    await tx
      .update(payments)
      .set({
        status: amountMatches ? normalizedStatus : "failed",
        method: molliePayment.method ?? storedPayment.method,
        paidAt,
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
  });

  return {
    paymentId,
    status: normalizedStatus,
    amountMatches,
    orderStatus: nextOrderStatus,
  };
}

export function parseCheckoutInput(input: unknown): CheckoutInput {
  return checkoutInputSchema.parse(input);
}
