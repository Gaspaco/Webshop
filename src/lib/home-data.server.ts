"use server";

import { query } from "@solidjs/router";
import { eq } from "drizzle-orm";
import { db } from "~/db";
import { storefrontContent } from "~/db/schema";
import { loadDatabaseCatalogRows } from "~/lib/catalog-query.server";
import { databaseCatalogRowsToState } from "~/lib/catalog";

export type HomeContent = {
  announcement?: string;
  heroTitle?: string;
  heroCopy?: string;
  featuredProductSlugs?: string[];
};

export const getHomeData = query(async () => {
  const [catalogRows, contentRows] = await Promise.all([
    loadDatabaseCatalogRows({ available: true, limit: 5 }),
    db
      .select({ value: storefrontContent.value })
      .from(storefrontContent)
      .where(eq(storefrontContent.key, "home"))
      .limit(1),
  ]);

  return {
    catalog: databaseCatalogRowsToState(
      catalogRows.products,
      catalogRows.managedSlugs,
    ),
    content: (contentRows[0]?.value ?? {}) as HomeContent,
  };
}, "home-data");
