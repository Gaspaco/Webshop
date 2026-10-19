import { eq, sql } from "drizzle-orm";
import { db } from "~/db";
import { products, productVariants } from "~/db/schema";

export const ADMIN_IMAGE_PATH = "/api/admin/product-image";

// Compact inside PostgreSQL, BEFORE transferring results to Node. Compacting
// afterwards still loads hundreds of MB of base64 into the serverless process.
export const adminProductImages = sql<string[]>`coalesce((
  select jsonb_agg(case when image.value like 'data:image/%'
    then ${ADMIN_IMAGE_PATH + "?product="} || ${products.id}::text || '&image=' || (image.position - 1)::text
    else image.value end order by image.position)
  from jsonb_array_elements_text(${products.imageUrls}) with ordinality as image(value, position)
), '[]'::jsonb)`;
export const adminVariantImage = sql<string | null>`case when ${productVariants.imageUrl} like 'data:image/%'
  then ${ADMIN_IMAGE_PATH + "?variant="} || ${productVariants.id}::text else ${productVariants.imageUrl} end`;
export const embeddedProductImageCount = sql<number>`(select count(*)::int from jsonb_array_elements_text(${products.imageUrls}) as image(value) where image.value like 'data:image/%')`;
export const variantHasEmbeddedImage = sql<boolean>`coalesce(${productVariants.imageUrl} like 'data:image/%', false)`;

/** Resolve our private display handles when an owner saves/copies a photo.
 * Never store a handle as the image source: that would create redirect loops
 * or make a copied variant depend on the original still existing. */
export async function resolveAdminImage(value: string): Promise<string> {
  if (!value.startsWith(ADMIN_IMAGE_PATH)) return value;
  const target = new URL(value, "https://admin.invalid");
  if (target.pathname !== ADMIN_IMAGE_PATH) throw new Error("Invalid image reference.");
  const variant = target.searchParams.get("variant");
  const product = target.searchParams.get("product");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let source: string | null | undefined;
  if (variant && uuid.test(variant) && !product) {
    const [row] = await db.select({ image: productVariants.imageUrl }).from(productVariants).where(eq(productVariants.id, variant)).limit(1);
    source = row?.image;
  } else if (product && uuid.test(product) && !variant) {
    const index = Number(target.searchParams.get("image") ?? "0");
    if (!Number.isSafeInteger(index) || index < 0 || index > 100) throw new Error("Invalid image index.");
    const [row] = await db.select({ image: sql<string | null>`${products.imageUrls} ->> ${index}::int` }).from(products).where(eq(products.id, product)).limit(1);
    source = row?.image;
  }
  if (!source || source.startsWith(ADMIN_IMAGE_PATH)) throw new Error("Stored image reference could not be resolved.");
  return source;
}
