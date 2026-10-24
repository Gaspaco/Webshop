import { eq } from "drizzle-orm";
import { categories } from "~/db/schema";
import type { db } from "~/db";
import { accessoryCategoryName, type AccessoryCategory } from "./accessories";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Use existing category rows when present; never overwrite owner-edited data. */
export async function ensureAccessoryCategory(tx: Transaction, category: AccessoryCategory) {
  await tx.insert(categories).values({ name: "Accessories", slug: "accessories" }).onConflictDoNothing({ target: categories.slug });
  const [parent] = await tx.select({ id: categories.id }).from(categories).where(eq(categories.slug, "accessories")).limit(1);
  const slug = `accessories-${category}`;
  await tx.insert(categories).values({ name: accessoryCategoryName(category), slug, parentId: parent!.id }).onConflictDoNothing({ target: categories.slug });
  const [child] = await tx.select({ id: categories.id }).from(categories).where(eq(categories.slug, slug)).limit(1);
  return child!.id;
}
