/** A slider preview is not the product's full description. Stored text stays untouched. */
export function heroProductCopy(product: { name: string; description?: string; gameName: string }) {
  const description = (product.description ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const excerpt = description.length > 220 ? `${description.slice(0, 217).trimEnd()}…` : description;
  return { title: product.name.trim(), blurb: excerpt || `Available now from our ${product.gameName} catalogue.` };
}

export function heroSlideIndex(current: number, offset: number, count: number) {
  if (count <= 0) return 0;
  return ((current + offset) % count + count) % count;
}

export function heroSlideKey(key: string, current: number, count: number): number | undefined {
  if (!count) return undefined;
  if (key === "ArrowLeft") return heroSlideIndex(current, -1, count);
  if (key === "ArrowRight") return heroSlideIndex(current, 1, count);
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return undefined;
}
