const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const FILE = new RegExp(`^([a-z0-9-]{1,64})--([vp])-(${UUID})(?:-(\\d{1,3}))?--([0-9a-f]{32})\\.webp$`);

export function imageSku(sku: string) {
  return sku.trim().replace(/[^A-Za-z0-9-]+/g, "-").toLowerCase().slice(0, 64) || "product";
}

export function productImagePath(sku: string, kind: "v" | "p", id: string, version: string, index = 0) {
  return `/product-images/${imageSku(sku)}--${kind}-${id}${kind === "p" ? `-${index}` : ""}--${version}.webp`;
}

export function parseProductImageFilename(filename: string) {
  const match = FILE.exec(filename);
  if (!match) return null;
  const [, sku, kind, id, position, version] = match;
  if ((kind === "v" && position !== undefined) || (kind === "p" && position === undefined)) return null;
  const index = Number(position ?? 0);
  if (index > 100 || String(index) !== (position ?? "0")) return null;
  return { sku: sku!, kind: kind as "v" | "p", id: id!, version: version!, index };
}
