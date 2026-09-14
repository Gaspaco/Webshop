import type { APIEvent } from "@solidjs/start/server";
import { eq } from "drizzle-orm";
import { db } from "~/db";
import { products } from "~/db/schema";
import { CATEGORY_LIST } from "~/lib/categories";

const GAME_PATHS = CATEGORY_LIST.flatMap(category => {
  const root = `/categories/${category.slug}`;
  return [
    root,
    `${root}/releases`,
    `${root}/sets`,
    `${root}/products`,
  ];
});

const STATIC_PATHS = [
  "",
  "/products",
  "/categories",
  ...GAME_PATHS,
  "/about",
  "/contact",
  "/shipping",
  "/returns",
];

const escapeXml = (value: string) =>
  value.replace(/[<>&'"]/g, character => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    '"': "&quot;",
  })[character]!);

export async function GET(event: APIEvent) {
  const origin = new URL(event.request.url).origin;
  let databaseProducts: Array<{ slug: string; updatedAt: Date }> = [];
  try {
    databaseProducts = await db
      .select({ slug: products.slug, updatedAt: products.updatedAt })
      .from(products)
      .where(eq(products.status, "active"));
  } catch {
    // Keep the static site routes available during a database outage.
  }
  const productEntries = databaseProducts.map(product => ({
      path: `/products/${product.slug}`,
      lastModified: product.updatedAt.toISOString(),
    }));
  const urls = [
    ...STATIC_PATHS.map(path => ({ path, lastModified: undefined as string | undefined })),
    ...productEntries,
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(entry => `  <url>
    <loc>${escapeXml(new URL(entry.path, origin).toString())}</loc>${entry.lastModified ? `
    <lastmod>${entry.lastModified}</lastmod>` : ""}
  </url>`).join("\n")}
</urlset>`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
