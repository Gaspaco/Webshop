import { z } from "zod";
import { DEFAULT_INTERNATIONAL_POSTNL_RATES } from "~/lib/shipping";

export const storeProfileSchema = z.object({
  companyName: z.string().trim().min(2).max(120),
  kvkNumber: z.string().trim().min(8).max(24),
  vatId: z.string().trim().min(8).max(32),
  businessEmail: z.string().trim().email().max(254),
  contactNotificationEmail: z.string().trim().email().max(254),
  customerEmailFrom: z.string().trim().email().max(254),
  phone: z.string().trim().min(7).max(40),
  businessAddress: z.string().trim().max(300),
  returnAddress: z.string().trim().max(300),
  carriers: z.array(z.literal("PostNL")).length(1),
  freeShippingThresholdCents: z.number().int().min(0).max(10_000_000),
  postnlLetterCents: z.number().int().min(0).max(100_000),
  postnlLetterboxCents: z.number().int().min(0).max(100_000),
  postnlSmallParcelCents: z.number().int().min(0).max(100_000),
  postnlParcelCents: z.number().int().min(0).max(100_000),
  postnlLargeParcelCents: z.number().int().min(0).max(100_000),
  internationalPostnlRates: z.record(
    z.string().regex(/^[A-Z]{2}$/),
    z.number().int().min(0).max(100_000),
  ),
});

export type StoreProfile = z.infer<typeof storeProfileSchema>;

export const DEFAULT_STORE_PROFILE: StoreProfile = {
  companyName: "TCGHaven",
  kvkNumber: "88839621",
  vatId: "NL004659858B77",
  businessEmail: "info@tcghaven.com",
  contactNotificationEmail: "info@tcghaven.com",
  customerEmailFrom: "no-reply@tcghaven.com",
  phone: "+31 6 87888458",
  businessAddress: "Herman Robbersstraat 68e, 3031 RJ Rotterdam, Netherlands",
  returnAddress: "Hulstwede 37, 2993 GL Barendrecht, Netherlands",
  carriers: ["PostNL"],
  freeShippingThresholdCents: 30_000,
  postnlLetterCents: 140,
  postnlLetterboxCents: 455,
  postnlSmallParcelCents: 585,
  postnlParcelCents: 695,
  postnlLargeParcelCents: 1695,
  internationalPostnlRates: DEFAULT_INTERNATIONAL_POSTNL_RATES,
};

export function parseStoreProfile(value: unknown): StoreProfile {
  const stored = value && typeof value === "object"
    ? value as Partial<StoreProfile>
    : {};
  const candidate = {
    ...DEFAULT_STORE_PROFILE,
    ...stored,
    businessAddress: stored.businessAddress || DEFAULT_STORE_PROFILE.businessAddress,
    returnAddress: stored.returnAddress || DEFAULT_STORE_PROFILE.returnAddress,
    contactNotificationEmail:
      stored.contactNotificationEmail ||
      stored.businessEmail ||
      DEFAULT_STORE_PROFILE.contactNotificationEmail,
    carriers: ["PostNL"],
    internationalPostnlRates: {
      ...DEFAULT_INTERNATIONAL_POSTNL_RATES,
      ...(stored.internationalPostnlRates ?? {}),
    },
  };
  const parsed = storeProfileSchema.safeParse(candidate);
  return parsed.success ? parsed.data : DEFAULT_STORE_PROFILE;
}

export async function fetchStoreProfile(): Promise<StoreProfile> {
  const response = await fetch("/api/storefront/profile", {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return DEFAULT_STORE_PROFILE;
  const result = (await response.json()) as { profile?: unknown };
  return parseStoreProfile(result.profile);
}
