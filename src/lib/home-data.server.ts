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

const emptyHomeData = () => ({
  catalog: { products: [], managedSlugs: [] },
  content: {} as HomeContent,
});

export const getHomeData = query(async () => {
  "use server";

  try {
    const [catalogRows, contentRows] = await Promise.all([
      loadDatabaseCatalogRows({
        available: true,
        // Pull enough recent products to find a sealed release for each of the
        // three hero games. The previous five-product window could easily be
        // filled by one game, which made the hero order unpredictable.
        limit: 60,
        includeManagedSlugs: false,
      }),
      db
        .select({ value: storefrontContent.value })
        .from(storefrontContent)
        .where(eq(storefrontContent.key, "home"))
        .limit(1),
    ]);

    // The homepage only needs one buyable option per card. Full variation data
    // remains available on catalogue and product pages. Replacing embedded data
    // images with public image endpoints keeps the first HTML response small.
    const seenProducts = new Set<string>();
    const compactRows = catalogRows.products
      .filter(row => row.stock > row.reservedStock)
      .filter(row => {
        if (seenProducts.has(row.id)) return false;
        seenProducts.add(row.id);
        return true;
      })
      .map(row => ({
        ...row,
        imageUrls: row.imageUrls.length
          ? [`/api/catalog/image?product=${encodeURIComponent(row.id)}`]
          : [],
        variantImageUrl: row.variantImageUrl
          ? `/api/catalog/image?variant=${encodeURIComponent(row.variantId)}`
          : null,
      }))
      .slice(0, 40);

    return {
      catalog: databaseCatalogRowsToState(compactRows, []),
      content: (contentRows[0]?.value ?? {}) as HomeContent,
    };
  } catch (error) {
    console.error(
      "Homepage data load failed; rendering the catalogue fallback.",
      error instanceof Error ? error.message : "Unknown error",
    );
    return emptyHomeData();
  }
}, "home-data");
