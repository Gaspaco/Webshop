import { z } from "zod";

const addressText = (minimum: number, maximum: number) =>
  z
    .string()
    .normalize("NFKC")
    .trim()
    .min(minimum)
    .max(maximum)
    .refine(value => !/[\u0000-\u001f\u007f]/.test(value), {
      message: "Remove unsupported characters.",
    });

export const savedAddressSchema = z.object({
  firstName: addressText(1, 80),
  lastName: addressText(1, 80),
  streetAndHouseNumber: addressText(4, 160),
  postalCode: addressText(3, 24),
  city: addressText(2, 80),
  country: addressText(2, 80),
});

export type SavedAddress = z.infer<typeof savedAddressSchema>;
