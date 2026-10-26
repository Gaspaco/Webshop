export const PRODUCT_IMAGE_INPUT_ERROR = "Use an HTTPS image URL or a site-relative image path, or upload a JPG, PNG, or WebP image.";

export function validProductImageSource(source: string) {
  const value = source.trim();
  if (!value) return true;
  if (value.startsWith("/")) {
    try { return !value.startsWith("//") && new URL(value, "https://image.invalid").origin === "https://image.invalid"; }
    catch { return false; }
  }
  if (/^data:image\/(?:webp|jpeg|png);base64,/i.test(value)) return true;
  try { return new URL(value).protocol === "https:"; }
  catch { return false; }
}

/** Uploaded data and private image handles remain saved without exposing them in a URL field. */
export function productImageInputValue(source: string) {
  return source.startsWith("data:") || source.startsWith("/api/admin/product-image?") ? "" : source;
}
