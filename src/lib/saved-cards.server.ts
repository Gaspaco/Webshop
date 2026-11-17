import { and, eq, isNull } from "drizzle-orm";
import type { PaymentCreateParams } from "@mollie/api-client";
import { db } from "~/db";
import { paymentCustomers, user } from "~/db/schema";
import { getMollieEnv } from "~/lib/env.server";
import { getMollieClient } from "~/lib/mollie.server";
import { acquireOperationLease, releaseOperationLease } from "~/lib/operation-lease.server";
import { mollieCredentialHash } from "~/lib/provider-recovery.server";
import { rateLimitMutation } from "~/lib/rate-limit-query";
import { CARD_CONSENT_VERSION, type SavedCard } from "~/lib/saved-cards";

export class SavedCardError extends Error {
  constructor(message: string, readonly status = 409, readonly definitive = false) { super(message); }
}

let profileCache: { key: string; id: string; until: number } | undefined;
async function providerContext() {
  const key = getMollieEnv().MOLLIE_API_KEY;
  const mode = key.startsWith("live_") ? "live" : key.startsWith("test_") ? "test" : null;
  if (!mode) throw new SavedCardError("Saved cards are not configured.", 503);
  const credential = mollieCredentialHash();
  if (!profileCache || profileCache.key !== credential || profileCache.until < Date.now()) {
    const profile = await getMollieClient().profiles.getCurrent();
    if (!/^pfl_[A-Za-z0-9]+$/.test(profile.id)) throw new Error("Invalid payment profile.");
    profileCache = { key: credential, id: profile.id, until: Date.now() + 5 * 60_000 };
  }
  return { profileId: profileCache.id, mode };
}

async function providerBudget() {
  const allowed = await rateLimitMutation(db, "saved-cards:provider:global", 300, 60_000, Date.now());
  if (!allowed.length) throw new SavedCardError("Saved cards are busy. Please try again shortly.", 429);
}

async function ownCustomer(userId: string, create = false) {
  // Do not call a provider (or accept a stale cookie) for an unverified/deleted user.
  const [owner] = await db.select({ id: user.id, emailVerified: user.emailVerified }).from(user).where(eq(user.id, userId)).limit(1);
  if (!owner?.emailVerified) throw new SavedCardError("Verify your email before using saved cards.", 403, true);
  await providerBudget();
  const context = await providerContext();
  const where = and(eq(paymentCustomers.userId, userId), eq(paymentCustomers.profileId, context.profileId), eq(paymentCustomers.mode, context.mode));
  const [current] = await db.select().from(paymentCustomers).where(where).limit(1);
  if (current?.customerId || !create) return current?.customerId ? current : null;
  const leaseKey = `payment-customer:${context.profileId}:${context.mode}:${userId}`;
  const token = await acquireOperationLease(leaseKey);
  if (!token) throw new SavedCardError("Your payment profile is being prepared. Try again shortly.");
  try {
    const pending = await db.transaction(async tx => {
      // Persist an intent before contacting Mollie. The restrictive FK protects
      // this reference against account deletion, even after a provider timeout.
      // Never hold database locks while waiting for a network operation.
      const [active] = await tx.select({ verified: user.emailVerified }).from(user).where(eq(user.id, userId)).for("update");
      if (!active?.verified) throw new SavedCardError("This account is no longer available for saved cards.", 403, true);
      const [existing] = await tx.select().from(paymentCustomers).where(where).limit(1);
      if (existing) return existing;
      const [intent] = await tx.insert(paymentCustomers).values({ userId, ...context, consentVersion: CARD_CONSENT_VERSION }).returning();
      return intent!;
    });
    if (pending.customerId) return pending;
    const customer = await getMollieClient().customers.create({
      metadata: { userId, setupId: pending.creationKey }, idempotencyKey: `payment-customer:${pending.creationKey}`,
    });
    if (!/^cst_[A-Za-z0-9]+$/.test(customer.id)) throw new Error("Invalid payment customer.");
    const [created] = await db.update(paymentCustomers).set({ customerId: customer.id })
      .where(and(where, eq(paymentCustomers.creationKey, pending.creationKey), isNull(paymentCustomers.customerId))).returning();
    if (created) return created;
    // A very late provider response must not overwrite a profile completed by
    // another worker after this operation's lease expired.
    const [settled] = await db.select().from(paymentCustomers).where(where).limit(1);
    if (!settled?.customerId) throw new Error("Saved payment profile changed during setup.");
    return settled;
  } finally { await releaseOperationLease(leaseKey, token); }
}

async function customerCards(customerId: string, mode: string): Promise<SavedCard[]> {
  // The SDK forwards additional query parameters, although its older mandate
  // types do not yet declare scopes. Fail closed on the response scope as well.
  const mandates = await getMollieClient().customerMandates.page({ customerId, limit: 250, ...{ "scopes[]": ["customer-present"] } });
  return mandates.flatMap(mandate => {
    const row = mandate as unknown as { id: string; status: string; method: string; mode: string; scopes?: string[]; details?: { cardNumberLast4?: string; cardNumber?: string; cardLabel?: string; cardExpiryDate?: string } };
    if (row.status !== "valid" || row.method !== "creditcard" || row.mode !== mode || !row.scopes?.includes("customer-present") || !/^mdt_[A-Za-z0-9]+$/.test(row.id)) return [];
    const details = row.details;
    // Never expose a provider's full/raw card number even if the payload changes.
    const last4 = details?.cardNumberLast4 ?? details?.cardNumber?.slice(-4);
    if (!last4 || !/^\d{4}$/.test(last4)) return [];
    return [{ id: row.id, label: details?.cardLabel?.slice(0, 40) || "Card", last4,
      expires: /^\d{4}-\d{2}(?:-\d{2})?$/.test(details?.cardExpiryDate ?? "") ? details!.cardExpiryDate! : null }];
  });
}

export async function listSavedCards(userId: string) {
  const customer = await ownCustomer(userId);
  return customer?.customerId ? customerCards(customer.customerId, customer.mode) : [];
}

export async function removeSavedCard(userId: string, mandateId: string) {
  const customer = await ownCustomer(userId);
  if (!customer?.customerId || !(await customerCards(customer.customerId, customer.mode)).some(card => card.id === mandateId)) {
    throw new SavedCardError("This saved card is no longer available.", 404, true);
  }
  await getMollieClient().customerMandates.revoke(mandateId, { customerId: customer.customerId });
}

/** Only customer-present, one-off purchases. Never create recurring charges. */
export async function savedCardPaymentParameters(userId: string | undefined, input: { rememberCard: boolean; savedCardId?: string }): Promise<Partial<PaymentCreateParams>> {
  if (!input.rememberCard && !input.savedCardId) return {};
  if (!userId) throw new SavedCardError("Sign in before using saved cards.", 401, true);
  const customer = await ownCustomer(userId, input.rememberCard);
  if (!customer?.customerId) throw new SavedCardError("This saved card is no longer available.", 409, true);
  if (input.savedCardId) {
    if (!(await customerCards(customer.customerId, customer.mode)).some(card => card.id === input.savedCardId)) throw new SavedCardError("This saved card is no longer available. Choose Mollie checkout instead.", 409, true);
    return { customerId: customer.customerId, mandateId: input.savedCardId, method: "creditcard" as PaymentCreateParams["method"], sequenceType: "oneoff" as PaymentCreateParams["sequenceType"] };
  }
  // Hosted checkout collects card details and the final save-card consent.
  // storeCredentials requires Components/cardToken, so must not be sent here.
  return { customerId: customer.customerId, sequenceType: "oneoff" as PaymentCreateParams["sequenceType"] };
}
