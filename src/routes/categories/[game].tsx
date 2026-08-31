import { Title } from "@solidjs/meta";
import { A, useParams } from "@solidjs/router";
import {
  createMemo,
  createResource,
  createSignal,
  For,
  onMount,
  Show,
} from "solid-js";
import ProductGrid from "~/components/product/ProductGrid";
import ProductSection from "~/components/product/ProductSection";
import { CATEGORIES, type ShopProduct } from "~/lib/categories";
import { fetchDatabaseCatalogState } from "~/lib/catalog";
import styles from "./[game].module.scss";

type ProductFilter = "all" | "single" | "sealed" | "graded" | "accessory";

const FILTERS: Array<{ value: ProductFilter; label: string }> = [
  { value: "all", label: "All products" },
  { value: "sealed", label: "Sealed" },
  { value: "single", label: "Singles" },
  { value: "graded", label: "Graded" },
  { value: "accessory", label: "Accessories" },
];

function releaseTime(product: ShopProduct) {
  if (!product.releaseDate) return 0;
  const time = Date.parse(`${product.releaseDate}T12:00:00`);
  return Number.isFinite(time) ? time : 0;
}

function isUpcoming(product: ShopProduct) {
  if (product.preorder) return true;
  const time = releaseTime(product);
  return time > 0 && time > Date.now();
}

function formatReleaseDate(value?: string) {
  if (!value) return "Date to be announced";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "Date to be announced";
  return new Intl.DateTimeFormat("en-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export default function CategoryPage() {
  const params = useParams();
  const category = () => CATEGORIES[params.game ?? ""];
  const [clientReady, setClientReady] = createSignal(false);
  const [productFilter, setProductFilter] = createSignal<ProductFilter>("all");
  const [selectedSet, setSelectedSet] = createSignal("all");
  const [databaseCatalog] = createResource(
    clientReady,
    () => fetchDatabaseCatalogState(),
  );

  const products = createMemo<ShopProduct[]>(() => {
    const cat = category();
    if (!cat) return [];
    const starter = cat.products.map(product => ({
      ...product,
      game: cat.slug,
      gameName: cat.name,
      theme: product.theme ?? cat.theme,
    }));
    const managed = (databaseCatalog()?.products ?? []).filter(
      product => product.game === params.game,
    );
    const managedIds = new Set(databaseCatalog()?.managedSlugs ?? []);
    return [
      ...starter.filter(product => !managedIds.has(product.id)),
      ...managed,
    ];
  });

  const upcoming = createMemo(() =>
    products()
      .filter(isUpcoming)
      .sort((a, b) => {
        const aTime = releaseTime(a) || Number.MAX_SAFE_INTEGER;
        const bTime = releaseTime(b) || Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      }),
  );

  const latest = createMemo(() =>
    products()
      .filter(product => !isUpcoming(product))
      .sort((a, b) => releaseTime(b) - releaseTime(a))
      .slice(0, 8),
  );

  const sets = createMemo(() => {
    const grouped = new Map<string, { name: string; code?: string; count: number }>();
    for (const product of products()) {
      if (!product.set) continue;
      const current = grouped.get(product.set);
      grouped.set(product.set, {
        name: product.set,
        code: current?.code ?? product.setCode,
        count: (current?.count ?? 0) + 1,
      });
    }
    return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name));
  });

  const visibleProducts = createMemo(() => products().filter(product => {
    const matchesType =
      productFilter() === "all" || product.productType === productFilter();
    const matchesSet = selectedSet() === "all" || product.set === selectedSet();
    return matchesType && matchesSet;
  }));

  const heroProduct = createMemo(() =>
    upcoming().find(product => product.image) ?? products().find(product => product.image),
  );

  const chooseSet = (set: string) => {
    setSelectedSet(set);
    document.getElementById("catalogue")?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });
  };

  onMount(() => setClientReady(true));

  return (
    <Show
      when={category()}
      fallback={
        <main class={styles.page}>
          <div class={styles.wide}>
            <p class={styles.sub}>We couldn't find that game.</p>
            <A href="/categories" class={styles.backLink}>Browse all games</A>
          </div>
        </main>
      }
    >
      {cat => (
        <main class={styles.page}>
          <Title>{cat().name} cards and sealed products | TCGHaven</Title>

          <section class={`${styles.hero} ${styles[cat().theme]}`}>
            <div class={styles.heroTexture} aria-hidden="true" />
            <div class={`${styles.wide} ${styles.heroInner}`}>
              <div class={styles.heroCopy}>
                <nav class={styles.breadcrumb} aria-label="Breadcrumb">
                  <A href="/">Home</A>
                  <span>/</span>
                  <A href="/categories">Games</A>
                  <span>/</span>
                  <span>{cat().name}</span>
                </nav>
                <h1>{cat().name}</h1>
                <p>{cat().blurb}</p>
                <div class={styles.heroActions}>
                  <a href="#latest" class={styles.primaryLink}>Browse new releases</a>
                  <a href="#catalogue" class={styles.secondaryLink}>Shop everything</a>
                </div>
                <ul class={styles.highlights} aria-label="Popular collections">
                  <For each={cat().highlights}>
                    {highlight => <li>{highlight}</li>}
                  </For>
                </ul>
              </div>

              <Show when={heroProduct()}>
                {product => (
                  <A href={product().href} class={styles.heroProduct}>
                    <span class={styles.heroProductMeta}>
                      <span>{isUpcoming(product()) ? "Upcoming release" : "Featured release"}</span>
                      <Show when={product().releaseDate}>
                        <time datetime={product().releaseDate}>{formatReleaseDate(product().releaseDate)}</time>
                      </Show>
                    </span>
                    <img src={product().image} alt={product().name} />
                    <strong>{product().name}</strong>
                    <span>{product().set ?? cat().name}</span>
                  </A>
                )}
              </Show>
            </div>
          </section>

          <nav class={`${styles.wide} ${styles.sectionNav}`} aria-label={`${cat().name} sections`}>
            <a href="#upcoming">Upcoming</a>
            <a href="#latest">Latest releases</a>
            <a href="#sets">Browse sets</a>
            <a href="#catalogue">Full catalogue</a>
            <span>{products().length} products</span>
          </nav>

          <section id="upcoming" class={`${styles.wide} ${styles.releaseSection}`}>
            <header class={styles.sectionHeader}>
              <div>
                <h2>Upcoming releases</h2>
                <p>Pre-orders and announced sets for {cat().name}.</p>
              </div>
              <Show when={upcoming().length}>
                <span>{upcoming().length} announced</span>
              </Show>
            </header>
            <Show
              when={upcoming().length}
              fallback={
                <div class={styles.releaseEmpty}>
                  <div>
                    <strong>No announced release is listed yet.</strong>
                    <p>Confirmed dates and pre-orders will appear here as soon as they are added.</p>
                  </div>
                  <a href="#catalogue">Browse current products</a>
                </div>
              }
            >
              <div class={styles.releaseList}>
                <For each={upcoming().slice(0, 6)}>
                  {product => (
                    <A href={product.href} class={styles.releaseItem}>
                      <span class={styles.releaseDate}>{formatReleaseDate(product.releaseDate)}</span>
                      <span class={styles.releaseName}>
                        <strong>{product.name}</strong>
                        <span>{product.setCode ? `${product.setCode} · ` : ""}{product.set ?? product.gameName}</span>
                      </span>
                      <span class={styles.releaseArrow} aria-hidden="true">↗</span>
                    </A>
                  )}
                </For>
              </div>
            </Show>
          </section>

          <section id="latest" class={styles.latestSection}>
            <ProductSection
              heading="Latest releases"
              sub={`Recently added ${cat().name} products, singles, and sealed sets.`}
              products={latest()}
              viewAllHref={`/products?q=${encodeURIComponent(cat().name)}`}
            />
          </section>

          <section id="sets" class={`${styles.wide} ${styles.setSection}`}>
            <header class={styles.sectionHeader}>
              <div>
                <h2>Browse by set</h2>
                <p>Jump straight into a release, expansion, or collection.</p>
              </div>
            </header>
            <div class={styles.setDirectory}>
              <For each={sets()}>
                {set => (
                  <button type="button" onClick={() => chooseSet(set.name)}>
                    <span>{set.code ?? "Set"}</span>
                    <strong>{set.name}</strong>
                    <small>{set.count} {set.count === 1 ? "product" : "products"}</small>
                  </button>
                )}
              </For>
            </div>
          </section>

          <section id="catalogue" class={`${styles.wide} ${styles.catalogue}`}>
            <header class={styles.catalogueHeader}>
              <div>
                <h2>Shop {cat().name}</h2>
                <p>Filter the live catalogue by product type or set.</p>
              </div>
              <Show when={selectedSet() !== "all"}>
                <button type="button" class={styles.clearSet} onClick={() => setSelectedSet("all")}>
                  Clear set: {selectedSet()}
                </button>
              </Show>
            </header>
            <div class={styles.filters} role="group" aria-label="Filter products by type">
              <For each={FILTERS}>
                {filter => (
                  <button
                    type="button"
                    classList={{ [styles.filterActive]: productFilter() === filter.value }}
                    aria-pressed={productFilter() === filter.value}
                    onClick={() => setProductFilter(filter.value)}
                  >
                    {filter.label}
                  </button>
                )}
              </For>
            </div>
            <Show
              when={visibleProducts().length}
              fallback={<p class={styles.emptyProducts}>No products match this set and product type.</p>}
            >
              <ProductGrid products={visibleProducts()} />
            </Show>
          </section>
        </main>
      )}
    </Show>
  );
}
