import { and, eq, sql } from "drizzle-orm";
import { PaymentMethod, type PaymentCreateParams } from "@mollie/api-client";
import { z } from "zod";
import { db } from "~/db";
import {
  discountCodes,
  orderItems,
  orders,
  payments,
  products,
  productVariants,
} from "~/db/schema";
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

export async function calculateTrustedCheckout(input: unknown) {
  const parsed = checkoutInputSchema.parse(input);
  const lines = await Promise.all(parsed.items.map(async item => {
    const [databaseProduct] = await db
      .select({
        id: products.id,
        slug: products.slug,
        name: products.name,
        imageUrls: products.imageUrls,
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
        sku: databaseProduct.sku,
        name: databaseProduct.name,
        image: databaseProduct.imageUrls[0] ?? "",
        quantity: item.quantity,
        unitPriceCents: databaseProduct.priceCents,
        totalCents: databaseProduct.priceCents * item.quantity,
      };
    }

    const staticProduct = findProduct(item.id);
    if (
      !staticProduct ||
      staticProduct.priceCents === undefined ||
      staticProduct.priceRangeCents
    ) {
      throw new Error(`Product is not purchasable: ${item.id}`);
    }
    return {
      id: staticProduct.id,
      sku: staticProduct.id,
      name: staticProduct.set
        ? `${staticProduct.name} (${staticProduct.set})`
        : staticProduct.name,
      image: staticProduct.image ?? "",
      quantity: item.quantity,
      unitPriceCents: staticProduct.priceCents,
      totalCents: staticProduct.priceCents * item.quantity,
    };
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
  const shippingCents =
    subtotalCents >= 10000 ? 0 : SHIPPING_CENTS[parsed.shippingMethod];

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
      discountCents: checkout.discountCents,
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
