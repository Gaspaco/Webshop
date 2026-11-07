import { z } from "zod";
import { typeAttributes, productTypeConfig, variationFields } from "./product-types";

export const productAttributesSchema = z.custom<Record<string, string>>(value => !!value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length <= 20 && !Object.keys(value).some(key => ["constructor", "prototype", "__proto__"].includes(key)), "Check the product attributes.")
  .pipe(z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{0,39}$/), z.string().trim().max(160)));
export function validateTypeAttributes(type: unknown, value: Record<string, string>, variant = false) {
  const allowed = new Set((variant ? variationFields(type) : productTypeConfig(type)?.fields ?? []).map(field => field.key));
  for (const [key, text] of Object.entries(value)) {
    if (text && !allowed.has(key)) throw new z.ZodError([{ code: "custom", path: [variant ? "variantAttributes" : "attributes", key], message: `The ${key} field does not belong to this product type.` }]);
  }
  return typeAttributes(type, value, variant);
}
