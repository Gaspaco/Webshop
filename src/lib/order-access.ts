import { and, eq, isNull, or } from "drizzle-orm";
import { orders } from "../db/schema";

type OrderCustomer = { id: string; email: string; emailVerified: boolean };

export function customerOrderAccess(customer: OrderCustomer) {
  const owned = eq(orders.userId, customer.id);
  // An email typed into a signup form does not prove ownership of guest orders.
  // Orders assigned to another account must never be claimed by email alone.
  return customer.emailVerified
    ? or(
        owned,
        and(isNull(orders.userId), eq(orders.email, customer.email.toLowerCase())),
      )!
    : owned;
}
