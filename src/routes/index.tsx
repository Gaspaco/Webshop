import { Title } from "@solidjs/meta";
import { createAsync } from "@solidjs/router";
import { createMemo, Show, Suspense } from "solid-js";
import ShopNote from "~/components/home/ShopNote";
import HavenBand from "~/components/home/HavenBand";
import Hero from "~/components/home/Hero";
import SetCollections from "~/components/home/SetCollections";
import ShopByGame from "~/components/home/ShopByGame";
import CollectionPaths from "~/components/home/CollectionPaths";
import ProductSection, { type SectionProduct } from "~/components/product/ProductSection";
import type { ShopProduct } from "~/lib/categories";
import { getHomeData, type HomeContent } from "~/lib/home-data.server";
import styles from "./index.module.scss";

export default function Home() {
  const homeData = createAsync(() => getHomeData());
  const content = createMemo<HomeContent>(() => homeData()?.content ?? {});
  const catalogProducts = createMemo<ShopProduct[]>(
    () => homeData()?.catalog.products ?? [],
  );
  const featuredProducts = createMemo<SectionProduct[]>(() => {
    const products = catalogProducts();
    const slugs = content().featuredProductSlugs;
    if (slugs?.length) {
      const chosen = slugs
        .map(slug => products.find(product => product.id === slug))
        .filter((product): product is ShopProduct => Boolean(product));
      if (chosen.length) return chosen;
    }
    return products.slice(0, 8);
  });

  const upcomingProducts = createMemo(() =>
    catalogProducts()
      .filter(product => {
        if (product.preorder) return true;
        if (!product.releaseDate) return false;
        const time = Date.parse(`${product.releaseDate}T12:00:00`);
        return Number.isFinite(time) && time > Date.now();
      })
      .sort((a, b) => {
        const aTime = a.releaseDate ? Date.parse(`${a.releaseDate}T12:00:00`) : Number.MAX_SAFE_INTEGER;
        const bTime = b.releaseDate ? Date.parse(`${b.releaseDate}T12:00:00`) : Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      })
      .slice(0, 8),
  );

  return (
    <main>
      <Title>TCGHaven | Your Favorite Card Store, Online</Title>
      <Suspense
        fallback={
          <>
            <Hero loading />
            <ShopByGame />
          </>
        }
      >
        <Show when={homeData()}>
          <Show when={content().announcement}>
            <div class={styles.announcement}>{content().announcement}</div>
          </Show>
          <Hero
            managedTitle={content().heroTitle}
            managedCopy={content().heroCopy}
            products={catalogProducts()}
            loading={false}
          />
          <ShopByGame />
          <SetCollections products={catalogProducts()} />
          <Show when={upcomingProducts().length}>
            <ProductSection
              heading="Upcoming releases"
              sub="Announced sets and products available to pre-order."
              products={upcomingProducts()}
              viewAllHref="/products?q=pre-order"
            />
          </Show>
          <Show when={featuredProducts().length}>
            <ProductSection
              heading="New arrivals and best sellers"
              sub="Fresh stock and the products collectors keep coming back for."
              products={featuredProducts()}
            />
          </Show>
          <CollectionPaths />
          <ShopNote />
          <HavenBand />
        </Show>
      </Suspense>
    </main>
  );
}
