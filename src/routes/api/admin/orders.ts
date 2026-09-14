import type { APIEvent } from "@solidjs/start/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import {
  orders,
  payments,
  returnRequests,
} from "~/db/schema";
import {
  apiJson,
  requireAdmin,
  writeAuditLog,
} from "~/lib/admin.server";
import {
  escapeEmailHtml,
  sendTransactionalEmail,
} from "~/lib/email.server";
import { getMollieClient } from "~/lib/mollie.server";
import { checkRateLimit } from "~/lib/rate-limit.server";
import {
  createPostnlLabel,
  PostnlError,
} from "~/lib/postnl.server";
import { findShippingDestination } from "~/lib/shipping";
import { getStoreProfile } from "~/lib/store-profile.server";

const updateOrderSchema = z.object({
  id: z.string().uuid(),
  status: z.enum([
    "pending",
    "paid",
    "processing",
    "shipped",
    "completed",
    "cancelled",
    "refunded",
  ]),
});

export async function PATCH(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;

  try {
    const input = updateOrderSchema.parse(await event.request.json());
    const [updated] = await db
      .update(orders)
      .set({ status: input.status })
      .where(eq(orders.id, input.id))
      .returning({ id: orders.id, status: orders.status });

    if (!updated) {
      return apiJson({ error: "Order not found." }, { status: 404 });
    }

    await writeAuditLog({
      event,
      actorId: guard.session!.user.id,
      action: "order.status_updated",
      entityType: "order",
      entityId: updated.id,
      summary: `Order status changed to ${updated.status}.`,
    });

    return apiJson({ order: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiJson({ error: "Choose a valid order status." }, { status: 400 });
    }
    console.error("Admin order update failed", error);
    return apiJson({ error: "The order could not be updated." }, { status: 500 });
  }
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("ship"),
    id: z.string().uuid(),
    trackingNumber: z.string().trim().min(2).max(120),
    trackingUrl: z.string().trim().url().startsWith("https://").max(2048),
  }),
  z.object({
    action: z.literal("refund"),
    id: z.string().uuid(),
    amountCents: z.number().int().min(1).max(100_000_000),
    reason: z.string().trim().min(3).max(500),
    confirmation: z.literal("REFUND"),
  }),
  z.object({
    action: z.literal("record_return"),
    id: z.string().uuid(),
    reason: z.string().trim().min(3).max(500),
  }),
  z.object({
    action: z.literal("postnl_label"),
    id: z.string().uuid(),
    weightGrams: z.number().int().min(1).max(30_000),
    productCode: z.string().trim().regex(/^\d{4}$/),
  }),
]);

const amountValue = (cents: number) => (cents / 100).toFixed(2);

export async function POST(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;

  try {
    const input = actionSchema.parse(await event.request.json());
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, input.id))
      .limit(1);

    if (!order) {
      return apiJson({ error: "Order not found." }, { status: 404 });
    }

    if (input.action === "postnl_label") {
      if (!["paid", "processing"].includes(order.status)) {
        return apiJson(
          { error: "A PostNL label can only be created for a paid order." },
          { status: 400 },
        );
      }
      if (order.trackingNumber) {
        return apiJson(
          { error: "This order already has a tracking number." },
          { status: 409 },
        );
      }
      if (
        await checkRateLimit({
          event,
          namespace: "admin-postnl-label",
          identity: guard.session!.user.id,
          limit: 20,
          windowMs: 60 * 60 * 1000,
        })
      ) {
        return apiJson(
          { error: "Too many PostNL label requests. Try again later." },
          { status: 429 },
        );
      }

      const address = order.shippingAddress;
      const destination = findShippingDestination(address.country ?? "");
      if (!destination || destination.code !== "NL") {
        return apiJson(
          { error: "Automatic PostNL labels currently support Dutch addresses only." },
          { status: 400 },
        );
      }
      const profile = await getStoreProfile();
      const senderParts = profile.businessAddress
        .split(",")
        .map(part => part.trim())
        .filter(Boolean);
      if (!senderParts[0] || !senderParts[1]) {
        return apiJson(
          { error: "Complete the business address before creating a PostNL label." },
          { status: 400 },
        );
      }
      const label = await createPostnlLabel({
        orderNumber: order.orderNumber,
        customerEmail: order.email,
        shippingAddress: {
          firstName: address.firstName,
          lastName: address.lastName,
          streetAndHouseNumber: address.streetAndHouseNumber,
          postalCode: address.postalCode,
          city: address.city,
          countryCode: destination.code,
        },
        senderAddress: {
          companyName: profile.companyName,
          email: profile.businessEmail,
          streetAndHouseNumber: senderParts[0],
          postalCodeAndCity: senderParts[1],
        },
        weightGrams: input.weightGrams,
        productCode: input.productCode,
      });

      await db
        .update(orders)
        .set({
          status: "processing",
          trackingNumber: label.barcode,
          trackingUrl: label.trackingUrl,
        })
        .where(eq(orders.id, order.id));
      await writeAuditLog({
        event,
        actorId: guard.session!.user.id,
        action: "postnl.label_created",
        entityType: "order",
        entityId: order.id,
        summary: `PostNL ${label.mode} label created for ${order.orderNumber}.`,
        metadata: {
          mode: label.mode,
          confirmed: label.confirmed,
          productCode: input.productCode,
          weightGrams: input.weightGrams,
        },
      });

      return apiJson({
        barcode: label.barcode,
        trackingUrl: label.trackingUrl,
        pdfBase64: label.pdfBase64,
        filename: `${order.orderNumber}-postnl-label.pdf`,
        mode: label.mode,
        confirmed: label.confirmed,
      });
    }

    if (input.action === "ship") {
      await db
        .update(orders)
        .set({
          status: "shipped",
          trackingNumber: input.trackingNumber,
          trackingUrl: input.trackingUrl,
          shippedAt: new Date(),
        })
        .where(eq(orders.id, order.id));

      void sendTransactionalEmail({
        to: order.email,
        subject: `Your TCGHaven order ${order.orderNumber} has shipped`,
        text: `Your order has shipped. Tracking number: ${input.trackingNumber}\nTrack it here: ${input.trackingUrl}`,
        html: `<p>Your TCGHaven order <strong>${escapeEmailHtml(order.orderNumber)}</strong> has shipped.</p><p>Tracking number: ${escapeEmailHtml(input.trackingNumber)}</p><p><a href="${escapeEmailHtml(input.trackingUrl)}">Track your package</a></p>`,
        idempotencyKey: `shipped-${order.id}-${input.trackingNumber}`,
      }).catch(() => console.error("Shipping email delivery failed."));

      await writeAuditLog({
        event,
        actorId: guard.session!.user.id,
        action: "order.shipped",
        entityType: "order",
        entityId: order.id,
        summary: `Tracking ${input.trackingNumber} added to ${order.orderNumber}.`,
      });

      return apiJson({ ok: true });
    }

    if (input.action === "record_return") {
      const [created] = await db
        .insert(returnRequests)
        .values({
          orderId: order.id,
          reason: input.reason,
          status: "requested",
        })
        .returning();

      await writeAuditLog({
        event,
        actorId: guard.session!.user.id,
        action: "return.recorded",
        entityType: "order",
        entityId: order.id,
        summary: `Return recorded for ${order.orderNumber}.`,
      });

      return apiJson({ returnRequest: created }, { status: 201 });
    }

    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.orderId, order.id))
      .limit(1);

    if (!payment || !["paid", "refunded"].includes(payment.status)) {
      return apiJson(
        { error: "Only a confirmed paid Mollie payment can be refunded." },
        { status: 400 },
      );
    }
    const [refundTotals] = await db
      .select({
        refundedCents: sql<number>`coalesce(sum(${returnRequests.amountCents}), 0)`,
      })
      .from(returnRequests)
      .where(
        and(
          eq(returnRequests.orderId, order.id),
          eq(returnRequests.status, "refunded"),
        ),
      );
    const alreadyRefundedCents = Number(refundTotals?.refundedCents ?? 0);
    const remainingCents = payment.amountCents - alreadyRefundedCents;
    if (remainingCents <= 0) {
      return apiJson(
        { error: "This payment has already been fully refunded." },
        { status: 400 },
      );
    }
    if (input.amountCents > remainingCents) {
      return apiJson(
        {
          error: `Refund amount cannot exceed the remaining ${amountValue(remainingCents)} EUR.`,
        },
        { status: 400 },
      );
    }

    const refund = await getMollieClient().paymentRefunds.create({
      paymentId: payment.molliePaymentId,
      amount: {
        currency: "EUR",
        value: amountValue(input.amountCents),
      },
      description: `TCGHaven ${order.orderNumber}: ${input.reason}`,
      metadata: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        requestedBy: guard.session!.user.id,
      },
      idempotencyKey: `admin-refund-${order.id}-${alreadyRefundedCents}-${input.amountCents}`,
    });

    const fullyRefunded =
      alreadyRefundedCents + input.amountCents >= payment.amountCents;
    await db.transaction(async tx => {
      if (fullyRefunded) {
        await tx
          .update(orders)
          .set({ status: "refunded" })
          .where(eq(orders.id, order.id));
        await tx
          .update(payments)
          .set({ status: "refunded" })
          .where(eq(payments.id, payment.id));
      }
      await tx.insert(returnRequests).values({
        orderId: order.id,
        status: "refunded",
        reason: input.reason,
        amountCents: input.amountCents,
        adminNote: `Mollie refund ${refund.id}`,
        resolvedBy: guard.session!.user.id,
        resolvedAt: new Date(),
      });
    });

    await writeAuditLog({
      event,
      actorId: guard.session!.user.id,
      action: "payment.refunded",
      entityType: "order",
      entityId: order.id,
      summary: `${amountValue(input.amountCents)} EUR refunded for ${order.orderNumber}.`,
      metadata: { refundId: refund.id, amountCents: input.amountCents },
    });

    return apiJson({ ok: true, refundId: refund.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiJson(
        { error: error.issues[0]?.message ?? "Check the order action." },
        { status: 400 },
      );
    }
    if (error instanceof PostnlError) {
      return apiJson({ error: error.message }, { status: 502 });
    }
    console.error("Admin order action failed", error);
    return apiJson(
      { error: "The order action could not be completed." },
      { status: 500 },
    );
  }
}
