import { z } from "zod";
import { findShippingDestination, getInternationalPostnlPrice, type ShippingMethod } from "./shipping";
import type { StoreProfile } from "./store-profile";

const id = z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,59}$/);
const weight = z.number().int().min(1).max(100_000);
const cm = z.number().min(0.01).max(300);
export const productShippingSchema = z.object({
  classId: id.default("auto"), presetId: z.string().max(60).default(""),
  weightGrams: weight.nullable().default(null), lengthCm: cm.nullable().default(null),
  widthCm: cm.nullable().default(null), heightCm: cm.nullable().default(null),
});
export type ProductShipping = z.infer<typeof productShippingSchema>;
export function productShipping(value: unknown): ProductShipping {
  const parsed = productShippingSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : productShippingSchema.parse({});
}
const measured = { weightGrams: weight, lengthCm: cm, widthCm: cm, heightCm: cm };
const presetSchema = productShippingSchema.extend({ id, name: z.string().trim().min(1).max(100) });
const classSchema = z.object({ id, name: z.string().trim().min(1).max(100), mode: z.enum(["singles", "per_item"]), ...measured });
const tierSchema = z.object({ maxQuantity: z.number().int().min(1).max(10000).nullable(), weightGrams: weight });
const bandSchema = z.object({ id, name: z.string().trim().min(1).max(100), ...measured,
  priceKey: z.enum(["postnlSmallParcelCents", "postnlParcelCents", "postnlLargeParcelCents"]),
  priceCents: z.number().int().min(0).max(100_000).nullable().default(null),
});
export const shippingSettingsSchema = z.object({
  classes: z.array(classSchema).min(1).max(30), presets: z.array(presetSchema).max(100),
  singlesTiers: z.array(tierSchema).min(1).max(20),
  packagingWeightGrams: z.number().int().min(0).max(10000), paddingCm: z.number().min(0).max(30),
  letterbox: z.object(measured), international: z.object(measured), parcelBands: z.array(bandSchema).min(1).max(20),
  internationalBands: z.array(z.object({ weightGrams: weight, surchargeCents: z.number().int().min(0).max(100_000) })).max(20),
}).superRefine((value, ctx) => {
  for (const key of ["classes", "presets", "parcelBands"] as const) {
    if (new Set(value[key].map(row => row.id)).size !== value[key].length) ctx.addIssue({ code: "custom", path: [key], message: "Shipping IDs must be unique." });
  }
  let previous = 0;
  for (const [index, tier] of value.singlesTiers.entries()) {
    if (tier.maxQuantity === null ? index !== value.singlesTiers.length - 1 : tier.maxQuantity <= previous) {
      ctx.addIssue({ code: "custom", path: ["singlesTiers"], message: "Singles thresholds must increase, with an unlimited final tier." });
    }
    previous = tier.maxQuantity ?? previous;
  }
  if (value.singlesTiers.at(-1)?.maxQuantity !== null) ctx.addIssue({ code: "custom", path: ["singlesTiers"], message: "The final singles tier must have no quantity limit." });
  if (!value.classes.some(row => row.id === "standard")) ctx.addIssue({ code: "custom", path: ["classes"], message: "Keep the standard fallback shipping class." });
});
export type ShippingSettings = z.infer<typeof shippingSettingsSchema>;
const preset = (id: string, name: string, w: number | null, l: number | null, b: number | null, h: number | null) => ({
  id, name, classId: "standard", presetId: id, weightGrams: w, lengthCm: l, widthCm: b, heightCm: h,
});
export const DEFAULT_SHIPPING_SETTINGS: ShippingSettings = shippingSettingsSchema.parse({
  classes: [
    { id: "singles", name: "Singles (quantity rules)", mode: "singles", weightGrams: 20, lengthCm: 9, widthCm: 6.5, heightCm: 0.03 },
    { id: "standard", name: "Standard / sealed", mode: "per_item", weightGrams: 1000, lengthCm: 20, widthCm: 20, heightCm: 12 },
    { id: "accessory", name: "Accessories", mode: "per_item", weightGrams: 200, lengthCm: 20, widthCm: 15, heightCm: 5 },
    { id: "graded", name: "Graded cards", mode: "per_item", weightGrams: 150, lengthCm: 18, widthCm: 12, heightCm: 2 },
  ],
  presets: [preset("mtg-box", "MTG Booster Box", 1100, 21, 13, 8), preset("mtg-bundle", "MTG Fat Pack / Bundle (measure first)", null, null, null, null),
    preset("pokemon-box", "Pokémon Booster Box", 800, 13.5, 12.5, 8), preset("pokemon-etb", "Pokémon Elite Trainer Box (measure first)", null, null, null, null),
    preset("yugioh-box", "Yu-Gi-Oh! Booster Box", 500, 15, 14, 5), preset("digimon-box", "Digimon Booster Box", 600, 15, 13, 7),
    preset("riftbound-box", "Riftbound Booster Box (estimate)", 800, 20, 15, 8), preset("cyberpunk-box", "Cyberpunk TCG Booster Box", 650, 15.1, 15.1, 8.9)],
  singlesTiers: [{ maxQuantity: 10, weightGrams: 20 }, { maxQuantity: null, weightGrams: 50 }],
  packagingWeightGrams: 20, paddingCm: 1,
  letterbox: { weightGrams: 2000, lengthCm: 38, widthCm: 26.5, heightCm: 3.2 },
  international: { weightGrams: 23000, lengthCm: 100, widthCm: 50, heightCm: 50 },
  parcelBands: [
    { id: "small", name: "Small parcel", weightGrams: 3000, lengthCm: 34, widthCm: 28, heightCm: 12, priceKey: "postnlSmallParcelCents", priceCents: null },
    { id: "standard", name: "Parcel", weightGrams: 10000, lengthCm: 100, widthCm: 50, heightCm: 50, priceKey: "postnlParcelCents", priceCents: null },
    { id: "large", name: "Large parcel", weightGrams: 23000, lengthCm: 176, widthCm: 78, heightCm: 58, priceKey: "postnlLargeParcelCents", priceCents: null },
  ], internationalBands: [],
});
export type Shipment = { version: 1; weightGrams: number; productWeightGrams: number; packagingWeightGrams: number;
  lengthCm: number; widthCm: number; heightCm: number; singlesQuantity: number; estimated: boolean; warnings: string[] };
export type ShipmentLine = { productType: string | null; quantity: number; shipping?: unknown };
export function calculateShipment(lines: ShipmentLine[], settings: ShippingSettings): Shipment {
  let grams = 0, length = 0, width = 0, height = 0, singlesQuantity = 0;
  const grouped = new Map<string, number>(); const warnings = new Set<string>();
  for (const line of lines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 9900) throw new Error("Invalid shipment quantity.");
    const item = productShipping(line.shipping);
    const autoClass = line.productType === "single" ? "singles" : line.productType === "accessory" || line.productType === "graded" ? line.productType : "standard";
    let cls = settings.classes.find(row => row.id === (item.classId === "auto" ? autoClass : item.classId));
    if (!cls) { cls = settings.classes.find(row => row.id === "standard")!; warnings.add("A removed shipping class used the standard fallback."); }
    const pooled = cls.mode === "singles" && line.productType === "single";
    if (pooled) { grouped.set(cls.id, (grouped.get(cls.id) ?? 0) + line.quantity); singlesQuantity += line.quantity; }
    else {
      grams += (item.weightGrams ?? cls.weightGrams) * line.quantity;
      if (!item.weightGrams) warnings.add("Some products use estimated class weights.");
    }
    const dims = [item.lengthCm ?? cls.lengthCm, item.widthCm ?? cls.widthCm, item.heightCm ?? cls.heightCm].sort((a, b) => b - a);
    if (!pooled && (!item.lengthCm || !item.widthCm || !item.heightCm)) warnings.add("Some products use estimated class dimensions.");
    length = Math.max(length, dims[0]!); width = Math.max(width, dims[1]!); height += dims[2]! * line.quantity;
  }
  for (const quantity of grouped.values()) grams += settings.singlesTiers.find(tier => tier.maxQuantity === null || quantity <= tier.maxQuantity)!.weightGrams;
  const dims = [Math.max(16, length + settings.paddingCm), Math.max(11, width + settings.paddingCm), Math.max(0.4, height + settings.paddingCm)].sort((a, b) => b - a);
  return { version: 1, weightGrams: grams + settings.packagingWeightGrams, productWeightGrams: grams,
    packagingWeightGrams: settings.packagingWeightGrams, lengthCm: Math.ceil(dims[0]! * 100) / 100,
    widthCm: Math.ceil(dims[1]! * 100) / 100, heightCm: Math.ceil(dims[2]! * 100) / 100,
    singlesQuantity, estimated: warnings.size > 0, warnings: [...warnings] };
}
function fits(shipment: Shipment, limit: { weightGrams: number; lengthCm: number; widthCm: number; heightCm: number }) {
  const sides = [limit.lengthCm, limit.widthCm, limit.heightCm].sort((a, b) => b - a);
  return shipment.weightGrams <= limit.weightGrams && shipment.lengthCm <= sides[0]! && shipment.widthCm <= sides[1]! && shipment.heightCm <= sides[2]!;
}
export function shipmentQuotes(shipment: Shipment, profile: StoreProfile, country: string, subtotalCents: number) {
  const destination = findShippingDestination(country); if (!destination) return [];
  const settings = profile.shippingSettings;
  const quotes: Array<{ value: ShippingMethod; label: string; priceCents: number; detail: string }> = [];
  const price = (cents: number) => subtotalCents >= profile.freeShippingThresholdCents ? 0 : cents;
  if (destination.code === "NL") {
    quotes.push({ value: "local_pickup", label: "Pick up in person", priceCents: 0, detail: "Collect after confirmation from TCGHaven" });
    if (fits(shipment, settings.letterbox)) quotes.push({ value: "postnl_letterbox", label: "PostNL letterbox parcel", priceCents: price(profile.postnlLetterboxCents), detail: "Fits the configured letterbox size and weight limits" });
    const band = settings.parcelBands.find(band => fits(shipment, band));
    if (band) quotes.push({ value: "postnl_parcel", label: `PostNL ${band.name.toLowerCase()}`, priceCents: price(band.priceCents ?? profile[band.priceKey]), detail: `${shipment.weightGrams} g including packaging` });
  } else if (fits(shipment, settings.international)) {
    const base = getInternationalPostnlPrice(destination.code, profile.internationalPostnlRates);
    const band = [...settings.internationalBands].sort((a, b) => a.weightGrams - b.weightGrams).find(band => shipment.weightGrams <= band.weightGrams);
    if (base !== null && (!settings.internationalBands.length || band)) quotes.push({ value: "postnl_international", label: "PostNL international parcel", priceCents: price(base + (band?.surchargeCents ?? 0)), detail: `Tracked delivery to ${destination.name}` });
  }
  return quotes;
}
