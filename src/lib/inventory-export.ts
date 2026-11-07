import { csvCell } from "./csv";
import { productTypeConfig, type ProductType } from "./product-types";
import { spreadsheetHeaders } from "./product-spreadsheet";

export const INVENTORY_EXPORT_SCOPES = [
  { value: "all", label: "All products" },
  { value: "singles", label: "Singles only" },
  { value: "sealed", label: "Sealed products only" },
  { value: "sets", label: "Sets only" },
  { value: "singles-and-sets", label: "Singles and sets" },
] as const;

export type InventoryExportScope = (typeof INVENTORY_EXPORT_SCOPES)[number]["value"];
export type InventoryExportOptions = { scope: InventoryExportScope; images: boolean; productType?: ProductType };

export function parseInventoryExportOptions(params: URLSearchParams): InventoryExportOptions {
  const scope = params.get("scope") ?? "all";
  const images = params.get("images") ?? "false";
  if (!INVENTORY_EXPORT_SCOPES.some(option => option.value === scope)) {
    throw new Error("Choose a valid product selection for the export.");
  }
  if (images !== "true" && images !== "false") {
    throw new Error("The export images option must be true or false.");
  }
  const productType = params.get("productType");
  if (productType !== null && !productTypeConfig(productType)) throw new Error("Choose a valid product category.");
  return { scope: scope as InventoryExportScope, images: images === "true", ...(productType ? { productType: productType as ProductType } : {}) };
}

export function inventoryExportUrl(options: InventoryExportOptions) {
  return `/api/admin/export?${new URLSearchParams({ type: "inventory", scope: options.scope, images: String(options.images), ...(options.productType ? { productType: options.productType } : {}) })}`;
}

export function inventoryExportFilename(options: InventoryExportOptions) {
  return `tcghaven-inventory${options.productType ? `-${options.productType}` : options.scope === "all" ? "" : `-${options.scope}`}${options.images ? "-with-images" : ""}.csv`;
}

export type InventoryExportRow = {
  name: string; slug: string; game: string | null; type: string | null; status: string;
  sku: string | null; condition: string | null; language: string | null;
  priceCents: number | null; stock: number | null; reserved: number | null;
  imageUrls?: string[]; variantImage?: string | null;
  brand?: string | null; description?: string | null; metadata?: Record<string, unknown>;
  variantName?: string | null; barcode?: string | null; finish?: string | null;
  attributes?: Record<string, string> | null; trackInventory?: boolean | null;
  compareAtPriceCents?: number | null;
};

export function inventoryExportHeaders(images: boolean) {
  return ["name", "slug", "game", "type", "status", "sku", "condition", "language", "price", "stock", "reserved",
    ...(images ? ["image", "product_images", "variant_image"] : [])];
}

export function categoryExportHeaders(type: ProductType, images: boolean) { return spreadsheetHeaders(type, images); }
export function categoryExportValues(row: InventoryExportRow, type: ProductType, images: boolean): unknown[] {
  const metadata = row.metadata ?? {};
  const shipping = metadata.shipping as Record<string, unknown> | undefined;
  const attributes = metadata.attributes as Record<string, string> | undefined;
  const values: Record<string, unknown> = {
    ...metadata, ...attributes, name: row.name, slug: row.slug, productType: row.type, game: row.game,
    brand: row.brand, description: row.description, sku: row.sku, variantName: row.variantName,
    barcode: row.barcode, condition: row.condition, language: row.language, finish: row.finish,
    price: row.priceCents === null ? "" : row.priceCents / 100, compareAtPrice: row.compareAtPriceCents == null ? "" : row.compareAtPriceCents / 100, stock: row.stock, status: row.status,
    trackInventory: row.trackInventory ?? true, ...shipping, shippingClass: shipping?.classId, shippingPreset: shipping?.presetId,
    image: row.imageUrls?.[0] ?? "", product_images: JSON.stringify(row.imageUrls ?? []), variant_image: row.variantImage ?? "",
  };
  for (const [key, value] of Object.entries(row.attributes ?? {})) values[`variant_${key}`] = value;
  return categoryExportHeaders(type, images).map(header => values[header] ?? "");
}

export function inventoryExportValues(row: InventoryExportRow, images: boolean): unknown[] {
  const values: unknown[] = [row.name, row.slug, row.game, row.type, row.status, row.sku, row.condition,
    row.language, row.priceCents === null ? null : row.priceCents / 100, row.stock, row.reserved];
  if (images) {
    const productImages = row.imageUrls ?? [];
    values.push(row.variantImage || productImages[0] || "", JSON.stringify(productImages), row.variantImage ?? "");
  }
  return values;
}

export function inventoryCsvLine(values: unknown[]) {
  return `${values.map(csvCell).join(",")}\r\n`;
}
