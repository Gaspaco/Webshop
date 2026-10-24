import { csvCell } from "./csv";

export const INVENTORY_EXPORT_SCOPES = [
  { value: "all", label: "All products" },
  { value: "singles", label: "Singles only" },
  { value: "sealed", label: "Sealed products only" },
  { value: "sets", label: "Sets only" },
  { value: "singles-and-sets", label: "Singles and sets" },
] as const;

export type InventoryExportScope = (typeof INVENTORY_EXPORT_SCOPES)[number]["value"];
export type InventoryExportOptions = { scope: InventoryExportScope; images: boolean };

export function parseInventoryExportOptions(params: URLSearchParams): InventoryExportOptions {
  const scope = params.get("scope") ?? "all";
  const images = params.get("images") ?? "false";
  if (!INVENTORY_EXPORT_SCOPES.some(option => option.value === scope)) {
    throw new Error("Choose a valid product selection for the export.");
  }
  if (images !== "true" && images !== "false") {
    throw new Error("The export images option must be true or false.");
  }
  return { scope: scope as InventoryExportScope, images: images === "true" };
}

export function inventoryExportUrl(options: InventoryExportOptions) {
  return `/api/admin/export?${new URLSearchParams({ type: "inventory", scope: options.scope, images: String(options.images) })}`;
}

export function inventoryExportFilename(options: InventoryExportOptions) {
  return `tcghaven-inventory${options.scope === "all" ? "" : `-${options.scope}`}${options.images ? "-with-images" : ""}.csv`;
}

export type InventoryExportRow = {
  name: string; slug: string; game: string | null; type: string | null; status: string;
  sku: string | null; condition: string | null; language: string | null;
  priceCents: number | null; stock: number | null; reserved: number | null;
  imageUrls?: string[]; variantImage?: string | null;
};

export function inventoryExportHeaders(images: boolean) {
  return ["name", "slug", "game", "type", "status", "sku", "condition", "language", "price", "stock", "reserved",
    ...(images ? ["image", "product_images", "variant_image"] : [])];
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
