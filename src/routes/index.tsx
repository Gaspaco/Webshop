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
import { ALL_PRODUCTS, type ShopProduct } from "~/lib/categories";
import styles from "./home.module.scss";

type HomeContent = {
  announcement?: string;
  heroTitle?: string;
  heroCopy?: string;
  featuredProductSlugs?: string[];
};

const NEW_ARRIVAL_IDS = [
  "palkia-v-astral",
  "crystal-revenge-box",
  "venusaur-base",
  "rayquaza-vmax-st",
  "bloomburrow-box",
  "blastoise-base-set",
  "mewtwo-base-set",
  "charizard-base-set",
];

const NEW_ARRIVALS: SectionProduct[] = NEW_ARRIVAL_IDS
  .map(id => ALL_PRODUCTS.find(product => product.id === id))
  .filter((product): product is ShopProduct => Boolean(product));

export default function Home() {
  const [content, setContent] = createSignal<HomeContent>({});
  const [featuredProducts, setFeaturedProducts] =
    createSignal<SectionProduct[]>(NEW_ARRIVALS);
  const [catalogProducts, setCatalogProducts] =
    createSignal<ShopProduct[]>(ALL_PRODUCTS);

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
      if (!response.ok) return;
      const result = (await response.json()) as {
        content: HomeContent | null;
      };
      const managed = result.content ?? {};
      setContent(managed);
      const managedSlugs = new Set(catalog.managedSlugs);
      const mergedCatalog = [
        ...ALL_PRODUCTS.filter(product => !managedSlugs.has(product.id)),
        ...catalog.products,
      ];
      setCatalogProducts(mergedCatalog);
      if (managed.featuredProductSlugs?.length) {
        const chosen = managed.featuredProductSlugs
          .map(slug => mergedCatalog.find(product => product.id === slug))
          .filter((product): product is NonNullable<typeof product> =>
            Boolean(product),
          );
        if (chosen.length) setFeaturedProducts(chosen);
      } else {
        const merged = NEW_ARRIVALS.flatMap(product => {
          const managedProduct = catalog.products.find(
            candidate => candidate.id === product.id,
          );
          if (managedProduct) return [managedProduct];
          return managedSlugs.has(product.id) ? [] : [product];
        });
        setFeaturedProducts(merged);
      }
    } catch {
      // The designed defaults stay visible if managed content is unavailable.
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
      />
      <ShopByGame />
      <SetCollections />
      <Show when={upcomingProducts().length}>
        <ProductSection
          heading="Upcoming releases"
          sub="Announced sets and products available to pre-order."
          products={upcomingProducts()}
          viewAllHref="/products?q=pre-order"
        />
      </Show>
      <ProductSection
        heading="New arrivals and best sellers"
        sub="Fresh stock and the products collectors keep coming back for."
        products={featuredProducts()}
      />
      <CollectionPaths />
      <ShopNote />
      <HavenBand />
    </main>
  );
}
