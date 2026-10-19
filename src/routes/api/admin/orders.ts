import { logServerError } from "~/lib/server-log";
import type { APIEvent } from "@solidjs/start/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import {
  orders,
  payments,
  returnRequests,
  refundRequests,
} from "~/db/schema";
import {
  apiJson,
  requireAdmin,
  writeAuditLog,
} from "~/lib/admin.server";
import {
  emailHighlight,
  renderTransactionalEmail,
  sendTransactionalEmail,
} from "~/lib/email.server";
import { checkRateLimit } from "~/lib/rate-limit.server";
import {
  createPostnlLabel,
  PostnlError,
  validatePostnlAddresses,
} from "~/lib/postnl.server";
import { findShippingDestination, usesPostnlFulfilment } from "~/lib/shipping";
import { getStoreProfile } from "~/lib/store-profile.server";
import { createLabelOnce, LabelAlreadyRequested } from "~/lib/fulfilment.server";
import { requestRefund, retryRefund, resolveMissingRefund, syncPaymentRefunds, RefundRequestError } from "~/lib/refunds.server";
import { cancelCheckoutOrder, recoverCheckoutPayment, resolveMissingCheckoutPayment, retryPaidOrderEmails, syncMolliePaymentStatus } from "~/lib/checkout.server";

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
    if (input.status === "cancelled") {
      try {
        const order = await cancelCheckoutOrder(input.id);
        await writeAuditLog({ event, actorId: guard.session!.user.id, action: "order.cancelled",
          entityType: "order", entityId: input.id, summary: "Order cancelled after Mollie confirmation; reservations released." });
        return apiJson({ order });
      } catch {
        return apiJson({ error: "Cancellation is not confirmed. Check Mollie; paid or authorized orders must use the refund flow. Stock has not been released blindly." }, { status: 409 });
      }
    }
    if (["processing", "shipped", "completed"].includes(input.status)) {
      const [payment] = await db.select({ status: payments.status }).from(payments).where(eq(payments.orderId, input.id)).limit(1);
      if (payment?.status !== "paid") return apiJson({ error: "Only a confirmed paid order can be fulfilled." }, { status: 409 });
    }
    if (input.status === "pending") return apiJson({ error: "Existing orders cannot be reset to pending. Reconcile their payment instead." }, { status: 409 });
    if (input.status === "paid" || input.status === "refunded") {
      const [payment] = await db.select({ status: payments.status }).from(payments).where(eq(payments.orderId, input.id)).limit(1);
      if (payment?.status !== input.status) return apiJson({ error: "Payment and refund statuses must be confirmed by Mollie." }, { status: 409 });
    }
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
    logServerError("Admin order update failed", error);
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
  z.object({
    action: z.literal("resend_tracking_email"),
    id: z.string().uuid(),
  }),
  z.object({ action: z.literal("sync_refunds"), id: z.string().uuid() }),
  z.object({ action: z.literal("recover_payment"), id: z.string().uuid() }),
  z.object({ action: z.literal("resolve_missing_payment"), id: z.string().uuid(), confirmation: z.literal("CHECKED_MOLLIE_NO_PAYMENT") }),
  z.object({ action: z.literal("retry_order_emails"), id: z.string().uuid() }),
  z.object({ action: z.literal("retry_refund"), id: z.string().uuid(), requestId: z.string().uuid() }),
  z.object({ action: z.literal("resolve_missing_refund"), id: z.string().uuid(), requestId: z.string().uuid(),
    confirmation: z.literal("CHECKED_MOLLIE_NO_REFUND") }),
]);


async function deliverTrackingEmail(input: {
  event: APIEvent;
  actorId: string;
  order: typeof orders.$inferSelect;
  trackingNumber: string;
  trackingUrl: string;
}) {
  const attemptedAt = new Date();
  try {
    await sendTransactionalEmail({
      to: input.order.email,
      subject: `Your TCGHaven order ${input.order.orderNumber} has shipped`,
      text: `Your order has shipped. Tracking number: ${input.trackingNumber}\nTrack it here: ${input.trackingUrl}`,
      html: renderTransactionalEmail({
        preheader: `${input.order.orderNumber} is on its way with PostNL.`,
        label: "Dispatched",
        heading: "Your cards are on the way",
        intro: `Order ${input.order.orderNumber} has left TCGHaven. PostNL tracking may take a little while to show its first scan.`,
        contentHtml: emailHighlight("PostNL tracking number", input.trackingNumber),
        action: {
          label: "Track package",
          url: input.trackingUrl,
        },
        notice: "Tracking updates are supplied by PostNL. The first scan can appear after your parcel reaches their sorting network.",
      }),
      idempotencyKey: `shipped-${input.order.id}-${crypto.randomUUID()}`,
    });
  } catch (error) {
    logServerError("Shipping email delivery failed", error);
    await db
      .update(orders)
      .set({
        trackingEmailStatus: "failed",
        trackingEmailLastAttemptAt: attemptedAt,
        trackingEmailAttempts: sql`${orders.trackingEmailAttempts} + 1`,
        trackingEmailError: "The SMTP server did not accept the tracking email.",
      })
      .where(eq(orders.id, input.order.id));
    await writeAuditLog({
      event: input.event,
      actorId: input.actorId,
      action: "order.tracking_email_failed",
      entityType: "order",
      entityId: input.order.id,
      summary: `Tracking email failed for ${input.order.orderNumber}.`,
    }).catch(auditError =>
      logServerError("Tracking email failure audit could not be saved", auditError),
    );
    return {
      status: "failed" as const,
      attemptedAt: attemptedAt.toISOString(),
      error: "The order is saved, but the tracking email failed. Retry it from this order.",
    };
  }

  await db
    .update(orders)
    .set({
      trackingEmailStatus: "sent",
      trackingEmailSentAt: attemptedAt,
      trackingEmailLastAttemptAt: attemptedAt,
      trackingEmailAttempts: sql`${orders.trackingEmailAttempts} + 1`,
      trackingEmailError: null,
    })
    .where(eq(orders.id, input.order.id));
  await writeAuditLog({
    event: input.event,
    actorId: input.actorId,
    action: "order.tracking_email_sent",
    entityType: "order",
    entityId: input.order.id,
    summary: `Tracking email accepted by SMTP for ${input.order.orderNumber}.`,
  }).catch(auditError =>
    logServerError("Tracking email success audit could not be saved", auditError),
  );
  return { status: "sent" as const, sentAt: attemptedAt.toISOString() };
}

export async function POST(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;

  try {
    const input = actionSchema.parse(await event.request.json());
    if (["refund", "retry_refund", "resolve_missing_refund", "recover_payment", "resolve_missing_payment"].includes(input.action)) {
      if (await checkRateLimit({ event, namespace: "admin-refunds", identity: guard.session!.user.id, limit: 10, windowMs: 60 * 60_000 })) {
        return apiJson({ error: "Too many refund requests. Check Mollie before continuing." }, { status: 429 });
      }
    }
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, input.id))
      .limit(1);

    if (!order) {
      return apiJson({ error: "Order not found." }, { status: 404 });
    }

    if (input.action === "recover_payment") {
      const payment = await recoverCheckoutPayment(order.id);
      const result = await syncMolliePaymentStatus(payment.id);
      await writeAuditLog({ event, actorId: guard.session!.user.id, action: "payment.reconciled", entityType: "order",
        entityId: order.id, summary: "Payment creation reconciled with Mollie." });
      return apiJson({ ok: true, paymentStatus: result.status });
    }
    if (input.action === "resolve_missing_payment") {
      try { await resolveMissingCheckoutPayment(order.id); }
      catch { return apiJson({ error: "Could not resolve this payment. Wait at least one hour, check Mollie, and use Recover / check payment if any payment exists. No reservation was released blindly." }, { status: 409 }); }
      await writeAuditLog({ event, actorId: guard.session!.user.id, action: "payment.missing_resolved", entityType: "order",
        entityId: order.id, summary: "Owner confirmed in Mollie that an expired payment attempt was not created; bounded provider scan found no payment. Reservations released." });
      return apiJson({ ok: true });
    }
    if (input.action === "retry_order_emails") {
      return apiJson({ ok: true, emails: await retryPaidOrderEmails(order.id) });
    }
    if (input.action === "retry_refund" || input.action === "resolve_missing_refund") {
      const result = input.action === "retry_refund"
        ? await retryRefund(input.requestId, order.id)
        : await resolveMissingRefund(input.requestId, order.id);
      await writeAuditLog({ event, actorId: guard.session!.user.id, action: input.action === "retry_refund" ? "refund.retried" : "refund.missing_resolved",
        entityType: "order", entityId: order.id, summary: input.action === "retry_refund" ? "Original refund reconciled/retried with the same key." : "Owner confirmed in Mollie that an expired uncertain refund was not created.",
        metadata: { requestId: input.requestId } });
      return apiJson({ ok: true, ...result });
    }

    if (
      !usesPostnlFulfilment(order.shippingMethod) &&
      (input.action === "postnl_label" ||
        input.action === "ship" ||
        input.action === "resend_tracking_email")
    ) {
      return apiJson(
        { error: "Pickup orders do not use PostNL labels or tracking emails." },
        { status: 400 },
      );
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
      validatePostnlAddresses({ streetAndHouseNumber: address.streetAndHouseNumber, countryCode: destination.code }, {
        companyName: profile.companyName, email: profile.businessEmail,
        streetAndHouseNumber: senderParts[0], postalCodeAndCity: senderParts[1],
      });
      const label = await createLabelOnce(order.id, () => createPostnlLabel({
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
      }));
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

    if (input.action === "resend_tracking_email") {
      if (order.status !== "shipped") {
        return apiJson(
          { error: "Mark the order as shipped before sending its tracking email." },
          { status: 400 },
        );
      }
      if (!order.trackingNumber || !order.trackingUrl) {
        return apiJson(
          { error: "Create or enter tracking details before sending the email." },
          { status: 400 },
        );
      }
      if (
        await checkRateLimit({
          event,
          namespace: "admin-tracking-email",
          identity: guard.session!.user.id,
          limit: 10,
          windowMs: 60 * 60 * 1000,
        })
      ) {
        return apiJson(
          { error: "Too many tracking email attempts. Try again later." },
          { status: 429 },
        );
      }

      const notification = await deliverTrackingEmail({
        event,
        actorId: guard.session!.user.id,
        order,
        trackingNumber: order.trackingNumber,
        trackingUrl: order.trackingUrl,
      });
      return apiJson({ ok: true, notification });
    }

    if (input.action === "ship") {
      if (order.status === "shipped") {
        return apiJson(
          { error: "This order is already shipped. Use resend tracking email instead." },
          { status: 409 },
        );
      }
      if (!["paid", "processing"].includes(order.status)) {
        return apiJson(
          { error: "Only a paid or processing order can be marked as shipped." },
          { status: 400 },
        );
      }
      const shipped = await db
        .update(orders)
        .set({
          status: "shipped",
          trackingNumber: input.trackingNumber,
          trackingUrl: input.trackingUrl,
          shippedAt: new Date(),
        })
        .where(and(eq(orders.id, order.id), inArray(orders.status, ["paid", "processing"])))
        .returning({ id: orders.id });
      if (!shipped.length) return apiJson({ error: "Order status changed. Refresh before dispatching." }, { status: 409 });

      const notification = await deliverTrackingEmail({
        event,
        actorId: guard.session!.user.id,
        order,
        trackingNumber: input.trackingNumber,
        trackingUrl: input.trackingUrl,
      });

      await writeAuditLog({
        event,
        actorId: guard.session!.user.id,
        action: "order.shipped",
        entityType: "order",
        entityId: order.id,
        summary: `Tracking ${input.trackingNumber} added to ${order.orderNumber}.`,
      });

      return apiJson({ ok: true, notification });
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

    if (input.action === "sync_refunds") {
      const [payment] = await db.select().from(payments).where(eq(payments.orderId, order.id)).limit(1);
      if (!payment) return apiJson({ error: "Payment not found." }, { status: 404 });
      await syncPaymentRefunds(payment.molliePaymentId);
      const refunds = await db.select({ id: refundRequests.id, status: refundRequests.status, amountCents: refundRequests.amountCents })
        .from(refundRequests).where(eq(refundRequests.orderId, order.id));
      return apiJson({ ok: true, refunds });
    }

    const result = await requestRefund({ orderId: order.id, amountCents: input.amountCents,
      reason: input.reason, actorId: guard.session!.user.id });
    await writeAuditLog({
      event, actorId: guard.session!.user.id, action: "payment.refund_requested",
      entityType: "order", entityId: order.id,
      summary: "Mollie refund requested; completion is confirmed separately.",
      metadata: { refundId: result.refundId, amountCents: input.amountCents, status: result.refundStatus },
    });
    return apiJson({ ok: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiJson(
        { error: error.issues[0]?.message ?? "Check the order action." },
        { status: 400 },
      );
    }
    if (error instanceof LabelAlreadyRequested) return apiJson({ error: error.message }, { status: 409 });
    if (error instanceof RefundRequestError) return apiJson({ error: error.message }, { status: 409 });
    if (error instanceof PostnlError) {
      return apiJson({ error: error.message }, { status: 502 });
    }
    logServerError("Admin order action failed", error);
    return apiJson(
      { error: "The order action could not be completed." },
      { status: 500 },
    );
  }
}
