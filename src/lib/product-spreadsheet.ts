import { z } from "zod";
import { csvCell } from "./csv";
import { PRODUCT_GAMES, PRODUCT_TYPES, PRODUCT_TYPE_VALUES, isTcgType, productTypeConfig, variationFields, type ProductType } from "./product-types";
import { productAttributesSchema, validateTypeAttributes } from "./product-attributes";
import { ACCESSORY_CATEGORIES } from "./accessories";
import { validProductImageSource, PRODUCT_IMAGE_INPUT_ERROR } from "./product-image-input";
import { productShippingSchema } from "./product-shipping";

const optionalText = (max = 160) => z.string().trim().max(max).optional();
export const spreadsheetRowSchema = z.object({
  name: z.string().trim().min(2).max(140),
  slug: z.string().trim().regex(/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u).max(150).optional(),
  game: z.enum(PRODUCT_GAMES).optional(),
  productType: z.enum(PRODUCT_TYPE_VALUES),
  brand: optionalText(120), description: optionalText(2400),
  accessoryCategory: z.enum(ACCESSORY_CATEGORIES.map(category => category.slug)).optional(),
  set: optionalText(120), setCode: optionalText(60), cardNumber: optionalText(60), rarity: optionalText(80),
  illustrator: optionalText(120), gradingCompany: optionalText(40), grade: optionalText(20), certificationNumber: optionalText(80),
  badge: optionalText(32), releaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), preorder: z.boolean().optional(),
  sku: z.string().trim().min(1).max(80), variantName: optionalText(120), barcode: optionalText(120),
  condition: optionalText(60), language: optionalText(60), finish: optionalText(60),
  priceCents: z.number().int().min(0).max(100_000_000), compareAtPriceCents: z.number().int().min(0).max(100_000_000).optional(), stock: z.number().int().min(0).max(1_000_000),
  trackInventory: z.boolean().optional(),
  image: z.string().trim().max(1_200_000).refine(value => !value || validProductImageSource(value), PRODUCT_IMAGE_INPUT_ERROR).optional(),
  variantImage: z.string().trim().max(1_200_000).refine(value => !value || validProductImageSource(value), PRODUCT_IMAGE_INPUT_ERROR).optional(),
  productImages: z.array(z.string().max(1_200_000).refine(validProductImageSource, PRODUCT_IMAGE_INPUT_ERROR)).max(20).optional(),
  attributes: productAttributesSchema.optional(), variantAttributes: productAttributesSchema.optional(),
  shipping: productShippingSchema.optional(), status: z.enum(["draft", "active", "archived"]).optional(),
}).superRefine((row, ctx) => {
  if (isTcgType(row.productType) && !row.game) ctx.addIssue({ code: "custom", path: ["game"], message: "Choose a game for trading card products." });
  // Missing brand is allowed on updates from legacy spreadsheets; creation enforces it server-side.
  if (row.preorder && !row.releaseDate) ctx.addIssue({ code: "custom", path: ["releaseDate"], message: "A pre-order needs a release date." });
  for (const [key, variant] of [["attributes", false], ["variantAttributes", true]] as const) {
    try { validateTypeAttributes(row.productType, row[key] ?? {}, variant); }
    catch (error) { if (error instanceof z.ZodError) for (const issue of error.issues) ctx.addIssue({ code: "custom", path: [key], message: issue.message }); }
  }
});
export type SpreadsheetRow = z.infer<typeof spreadsheetRowSchema>;

export function spreadsheetHeaders(type?: ProductType, images = false) {
  const configs = type ? [productTypeConfig(type)!] : PRODUCT_TYPES;
  const tcg = configs.some(config => config.game);
  const card = configs.some(config => config.value === "single" || config.value === "graded");
  const graded = configs.some(config => config.value === "graded");
  const attrs = [...new Set(configs.flatMap(config => config.fields.map(field => field.key)))];
  const variants = [...new Set(configs.flatMap(config => variationFields(config.value).map(field => `variant_${field.key}`)))];
  return ["name", "slug", "productType", "brand", "description", ...(tcg ? ["game", "set", "setCode"] : []),
    ...(configs.some(config => config.value === "accessory") ? ["accessoryCategory"] : []),
    ...attrs, ...(card ? ["cardNumber", "rarity", "illustrator"] : []), ...(graded ? ["gradingCompany", "grade", "certificationNumber"] : []),
    "sku", "variantName", "barcode", "condition", ...(tcg ? ["language", "finish"] : []), ...variants,
    "price", "compareAtPrice", "stock", "trackInventory", "status", "badge", "releaseDate", "preorder",
    "weightGrams", "lengthCm", "widthCm", "heightCm", "shippingClass", "shippingPreset",
    ...(images ? ["image", "product_images", "variant_image"] : [])];
}

export function productTemplate(type: ProductType) {
  // Header only: importing an untouched template can never publish example stock.
  return "\uFEFF" + spreadsheetHeaders(type, true).map(csvCell).join(",") + "\r\n";
}

export function readCsvRecords(text: string): string[][] {
  const records: string[][] = []; let record: string[] = []; let field = ""; let quoted = false;
  const header = text.split(/[\r\n]/, 1)[0];
  const delimiter = header.includes(";") && !header.includes(",") ? ";" : ",";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' && quoted && text[i + 1] === '"') { field += '"'; i++; }
    else if (ch === '"') quoted = !quoted;
    else if (ch === delimiter && !quoted) { record.push(field); field = ""; }
    else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      record.push(field); if (record.some(value => value.trim())) records.push(record); record = []; field = "";
    } else field += ch;
    if (records.length > 1001) throw new Error("Import at most 1,000 variants at a time.");
  }
  if (quoted) throw new Error("A quoted CSV field is not closed.");
  record.push(field); if (record.some(value => value.trim())) records.push(record);
  return records;
}

export function parseProductSpreadsheet(text: string, selectedType?: ProductType): { rows: SpreadsheetRow[]; issues: string[] } {
  try {
    const [header, ...records] = readCsvRecords(text.replace(/^\uFEFF/, ""));
    if (!header) return { rows: [], issues: ["The CSV is empty."] };
    const headers = header.map(cell => cell.trim().toLowerCase());
    if (new Set(headers).size !== headers.length) throw new Error("The CSV contains duplicate column names.");
    for (const key of ["name", "sku", "price", "stock"]) if (!headers.includes(key)) throw new Error(`Missing column: ${key}. Download a fresh template.`);
    if (!headers.includes("producttype") && !headers.includes("type")) throw new Error("Missing column: productType.");
    if (records.length > 1000) throw new Error("Import at most 1,000 variants at a time.");
    const rows: SpreadsheetRow[] = []; const issues: string[] = []; const skus = new Set<string>();
    for (const [index, cells] of records.entries()) {
      const number = index + 2;
      const values = new Map(headers.map((key, i) => [key, cells[i]?.trim() ?? ""]));
      const get = (key: string) => values.get(key.toLowerCase()) ?? "";
      const optional = (key: string) => get(key) || undefined;
      const type = get("productType") || get("type");
      const config = productTypeConfig(type);
      if (selectedType && type !== selectedType) issues.push(`Row ${number}: this is not a ${productTypeConfig(selectedType)!.label.toLowerCase()} template.`);
      const euros = (value: string) => Math.round(Number(/^\d+,\d{1,2}$/.test(value) ? value.replace(",", ".") : value) * 100);
      const input: Record<string, unknown> = { productType: type, name: get("name"), sku: get("sku"), priceCents: get("price") ? euros(get("price")) : NaN, stock: get("stock") ? Number(get("stock")) : NaN };
      if (get("compareAtPrice")) input.compareAtPriceCents = euros(get("compareAtPrice"));
      for (const key of ["slug", "game", "brand", "description", "accessoryCategory", "set", "setCode", "cardNumber", "rarity", "illustrator", "gradingCompany", "grade", "certificationNumber", "badge", "releaseDate", "variantName", "barcode", "condition", "language", "finish", "image", "status"]) if (optional(key)) input[key] = get(key);
      for (const [column, key] of [["variant_image", "variantImage"], ["product_images", "productImages"]]) {
        if (get(column)) input[key] = key === "productImages" ? JSON.parse(get(column)) : get(column);
      }
      for (const key of ["trackInventory", "preorder"]) if (get(key)) {
        if (!["true", "false"].includes(get(key).toLowerCase())) issues.push(`Row ${number}: ${key} must be true or false.`);
        else input[key] = get(key).toLowerCase() === "true";
      }
      const attributes: Record<string, string> = {}; const variantAttributes: Record<string, string> = {};
      for (const field of config?.fields ?? []) {
        if (get(field.key)) attributes[field.key] = get(field.key);
      }
      for (const field of variationFields(type)) if (get(`variant_${field.key}`)) variantAttributes[field.key] = get(`variant_${field.key}`);
      if (Object.keys(attributes).length) input.attributes = attributes;
      if (Object.keys(variantAttributes).length) input.variantAttributes = variantAttributes;
      if (["weightGrams", "lengthCm", "widthCm", "heightCm", "shippingClass", "shippingPreset"].some(key => get(key))) input.shipping = {
        weightGrams: get("weightGrams") ? Number(get("weightGrams")) : null,
        lengthCm: get("lengthCm") ? Number(get("lengthCm")) : null, widthCm: get("widthCm") ? Number(get("widthCm")) : null, heightCm: get("heightCm") ? Number(get("heightCm")) : null,
        classId: get("shippingClass") || "auto", presetId: get("shippingPreset"),
      };
      const result = spreadsheetRowSchema.safeParse(input);
      if (!result.success) { for (const issue of result.error.issues) issues.push(`Row ${number}: ${issue.path.join(".")}: ${issue.message}`); continue; }
      const sku = result.data.sku.toLowerCase();
      if (skus.has(sku)) issues.push(`Row ${number}: SKU ${result.data.sku} is repeated.`);
      skus.add(sku); rows.push(result.data);
    }
    return { rows, issues: issues.slice(0, 100) };
  } catch (error) { return { rows: [], issues: [error instanceof Error ? error.message : "Check the CSV file."] }; }
}
