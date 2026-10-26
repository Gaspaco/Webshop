type PreviewVariant = { priceCents: number; stock: number; isDefault?: boolean };

/** Highest-priced available option; sold-out products keep their highest-priced cover.
 * Preserve source order for equal prices, preferring the marked main option.
 * Callers provide available stock (physical stock minus reservations).
 */
export function productPreviewVariant<T extends PreviewVariant>(variants: readonly T[] = []): T | undefined {
  let available: T | undefined;
  let fallback: T | undefined;
  const better = (candidate: T, current?: T) => !current || candidate.priceCents > current.priceCents ||
    (candidate.priceCents === current.priceCents && candidate.isDefault === true && current.isDefault !== true);
  for (const variant of variants) {
    if (better(variant, fallback)) fallback = variant;
    if (variant.stock > 0 && better(variant, available)) available = variant;
  }
  return available ?? fallback;
}
