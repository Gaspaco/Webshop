import { sql, type SQL } from "drizzle-orm";
import { products, productVariants } from "~/db/schema";

// Build URLs inside PostgreSQL so catalogue pages NEVER transfer stored base64
// pictures or third-party API image URLs into HTML/JSON responses.
const mainSku = sql`coalesce((select v.sku from product_variants v where v.product_id = ${products.id}
  order by v.is_default desc, v.created_at, v.id limit 1), ${products.slug})`;
function skuName(sku: SQL) {
  return sql`coalesce(nullif(substring(translate(regexp_replace(trim(${sku}), '[^A-Za-z0-9-]+', '-', 'g'), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 1, 64), ''), 'product')`;
}
function imagePath(source: SQL, reference: SQL, sku: SQL) {
  return sql<string>`case when ${source} like 'data:image/%' or ${source} like 'https://%' or ${source} like '/card-images/yugipedia/%'
    then '/product-images/' || ${skuName(sku)} || '--' || ${reference} || '--' || md5(${source}) || '.webp'
    else ${source} end`;
}
export const publicVariantImage = imagePath(sql`${productVariants.imageUrl}`, sql`'v-' || ${productVariants.id}::text`, sql`${productVariants.sku}`);
export const publicProductImages = sql<string[]>`coalesce((select jsonb_agg(${imagePath(
  sql`image.value`, sql`'p-' || ${products.id}::text || '-' || (image.position - 1)::text`, mainSku,
)} order by image.position) from jsonb_array_elements_text(${products.imageUrls}) with ordinality as image(value, position)), '[]'::jsonb)`;
