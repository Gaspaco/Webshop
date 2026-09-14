import { Title } from "@solidjs/meta";
import { createMemo, createSignal, onMount, Show } from "solid-js";
import ShopNote from "~/components/home/ShopNote";
import HavenBand from "~/components/home/HavenBand";
import Hero from "~/components/home/Hero";
import SetCollections from "~/components/home/SetCollections";
import ShopByGame from "~/components/home/ShopByGame";
import CollectionPaths from "~/components/home/CollectionPaths";
import ProductSection, { type SectionProduct } from "~/components/product/ProductSection";
import { fetchDatabaseCatalogState } from "~/lib/catalog";
import type { ShopProduct } from "~/lib/categories";
import styles from "./index.module.scss";

type HomeContent = {
  announcement?: string;
  heroTitle?: string;
  heroCopy?: string;
  featuredProductSlugs?: string[];
};

export default function Home() {
  const [content, setContent] = createSignal<HomeContent>({});
  const [featuredProducts, setFeaturedProducts] =
    createSignal<SectionProduct[]>([]);
  const [catalogProducts, setCatalogProducts] =
    createSignal<ShopProduct[]>([]);

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

  onMount(async () => {
    try {
      const [response, catalog] = await Promise.all([
        fetch("/api/storefront/content"),
        fetchDatabaseCatalogState(),
      ]);
      const result = response.ok
        ? await response.json() as { content: HomeContent | null }
        : { content: null };
      const managed = result.content ?? {};
      setContent(managed);
      setCatalogProducts(catalog.products);
      if (managed.featuredProductSlugs?.length) {
        const chosen = managed.featuredProductSlugs
          .map(slug => catalog.products.find(product => product.id === slug))
          .filter((product): product is NonNullable<typeof product> =>
            Boolean(product),
          );
        if (chosen.length) setFeaturedProducts(chosen);
      } else {
        setFeaturedProducts(
          catalog.products
            .filter(product => (product.stock ?? 0) > 0)
            .slice(0, 8),
        );
      }
    } catch {
      // Never substitute demo inventory when the live catalogue is unavailable.
    }
  });

  return (
    <main>
      <Title>TCGHaven | Your Favorite Card Store, Online</Title>
      <Show when={content().announcement}>
        <div class={styles.announcement}>{content().announcement}</div>
      </Show>
      <Hero
        managedTitle={content().heroTitle}
        managedCopy={content().heroCopy}
        products={catalogProducts()}
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
    </main>
  );
}
