/** Only use photos belonging to this product, never another variant's artwork. */
export function productImageCandidates(source?: string, fallbacks: readonly (string | undefined)[] = []) {
  return [...new Set([source, ...fallbacks].map(value => value?.trim()).filter((value): value is string => !!value))];
}

export function nextProductImage(sources: readonly string[], failed: ReadonlySet<string>) {
  return sources.find(source => !failed.has(source));
}

export function productImageDecoded(image: Pick<HTMLImageElement, "complete" | "naturalWidth">) {
  return image.complete && image.naturalWidth > 0;
}
