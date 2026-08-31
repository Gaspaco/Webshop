import { eq } from "drizzle-orm";
import { db } from "~/db";
import { storefrontContent } from "~/db/schema";
import {
  DEFAULT_STORE_PROFILE,
  parseStoreProfile,
  type StoreProfile,
} from "~/lib/store-profile";

export async function getStoreProfile(): Promise<StoreProfile> {
  try {
    const [row] = await db
      .select({ value: storefrontContent.value })
      .from(storefrontContent)
      .where(eq(storefrontContent.key, "business"))
      .limit(1);
    return parseStoreProfile(row?.value);
  } catch {
    return DEFAULT_STORE_PROFILE;
  }
}
