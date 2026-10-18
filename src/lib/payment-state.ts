export function nextFulfilmentStatus(current: string, payment: string) {
  if (["processing", "shipped", "completed", "refunded", "cancelled"].includes(current)) return current;
  if (payment === "paid") return "paid";
  if (["failed", "cancelled", "expired"].includes(payment)) return "cancelled";
  return current;
}
