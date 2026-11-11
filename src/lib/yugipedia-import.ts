type Printing = { setCode: string; setName: string; rarity: string };
type ListedVariant = { name: string; sku: string; finish: string | null; attributes?: Record<string, string> | null };
const normalized = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

/** Match the printing, not just its card or expansion: one card can have two set numbers. */
export function printingAlreadyListed(printing: Printing, variants: ListedVariant[]) {
  return variants.some(variant => {
    const rarity = variant.finish || variant.name.split("·").at(-1) || "";
    if (normalized(rarity) !== normalized(printing.rarity)) return false;
    const code = variant.attributes?.setCode;
    if (code) return code.trim().toUpperCase() === printing.setCode.toUpperCase();
    return normalized(variant.name) === normalized(`${printing.setName} · ${printing.rarity}`)
      && variant.sku.toUpperCase().includes(`-${printing.setCode.toUpperCase()}-`);
  });
}
