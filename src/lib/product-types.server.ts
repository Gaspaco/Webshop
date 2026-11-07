import { eq } from "drizzle-orm";
import { categories } from "~/db/schema";
import type { db } from "~/db";
import { isTcgType, productTypeConfig } from "./product-types";
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function ensureProductTypeCategory(tx: Transaction, type: string) {
  const config = productTypeConfig(type);
  if (!config || isTcgType(type)) return null;
  const slug = `${type}-products`;
  await tx.insert(categories).values({ name: config.label, slug }).onConflictDoNothing({ target: categories.slug });
  const [category] = await tx.select({ id: categories.id }).from(categories).where(eq(categories.slug, slug)).limit(1);
  return category!.id;
}
