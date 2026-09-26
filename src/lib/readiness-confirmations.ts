import { z } from "zod";

export const readinessConfirmationIds = [
  "backups",
  "vat",
  "legal-review",
] as const;

export type ReadinessConfirmationId =
  (typeof readinessConfirmationIds)[number];

const confirmationSchema = z.object({
  confirmedAt: z.string().datetime(),
  confirmedBy: z.string().uuid(),
});

const readinessConfirmationsSchema = z.object({
  backups: confirmationSchema.optional(),
  vat: confirmationSchema.optional(),
  "legal-review": confirmationSchema.optional(),
});

export type ReadinessConfirmations = z.infer<
  typeof readinessConfirmationsSchema
>;

export function parseReadinessConfirmations(
  value: unknown,
): ReadinessConfirmations {
  const parsed = readinessConfirmationsSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}
