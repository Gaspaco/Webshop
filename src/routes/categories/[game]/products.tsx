import { Title } from "@solidjs/meta";
import { A, useParams, useSearchParams } from "@solidjs/router";
import { createMemo, createSignal, For, Show } from "solid-js";
import GameSubpageShell from "~/components/game/GameSubpageShell";
import ProductGrid from "~/components/product/ProductGrid";
import { CATEGORIES } from "~/lib/categories";
import { createGameCatalog } from "~/lib/game-catalog";
import styles from "./game-pages.module.scss";
import SetFilter from "~/components/product/SetFilter";
import { matchesSetFilter, productForSet } from "~/lib/product-sets";

type ProductFilter = "all" | "single" | "sealed" | "graded" | "accessory";

const FILTERS: Array<{ value: ProductFilter; label: string }> = [
  { value: "all", label: "Everything" },
  { value: "sealed", label: "Sealed" },
  { value: "single", label: "Singles" },
  { value: "graded", label: "Graded" },
  { value: "accessory", label: "Accessories" },
];

export default function GameProductsPage() {
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedSet = () => typeof searchParams.set === "string" ? searchParams.set : "";
  const game = () => params.game ?? "";
  const category = () => CATEGORIES[game()];
  const { products } = createGameCatalog(game);
  // Defaulting to "Sealed" silently hid most of the catalogue behind a control
  // the shopper had not touched.
  const [filter, setFilter] = createSignal<ProductFilter>("all");

  const counts = createMemo(() => {
    const totals = new Map<ProductFilter, number>([["all", products().length]]);
    for (const product of products()) {
      const key = product.productType as ProductFilter | undefined;
      if (key) totals.set(key, (totals.get(key) ?? 0) + 1);
    }
    return totals;
  });

  const visible = createMemo(() =>
    products().filter(product => (filter() === "all" || product.productType === filter()) && matchesSetFilter(product, selectedSet()))
      .map(product => selectedSet() ? productForSet(product, selectedSet().slice(selectedSet().indexOf(":") + 1)) : product),
  );

  return (
    <Show when={category()} fallback={<main class={styles.missing}><h1>Game not found</h1><A href="/categories">Browse all games</A></main>}>
      {cat => (
        <GameSubpageShell
          category={cat()}
          active="products"
          title={`Shop ${cat().name}`}
          description={`Singles, sealed products and collector pieces from the ${cat().name} catalogue.`}
        >
          <Title>Shop {cat().name} | TCGHaven</Title>

          <SetFilter products={products()} game={game()} value={selectedSet()} onChange={value => setSearchParams({ set: value || undefined }, { replace: true })} class={styles.setFilter} />
          <div class={styles.filters} role="group" aria-label="Filter products by type">
            <For each={FILTERS}>{item => (
              <Show when={item.value === "all" || counts().get(item.value)}>
                <button
                  type="button"
                  classList={{ [styles.filterActive]: filter() === item.value }}
                  aria-pressed={filter() === item.value}
                  onClick={() => setFilter(item.value)}
                >
                  {item.label}
                  <span>{counts().get(item.value) ?? 0}</span>
                </button>
              </Show>
            )}</For>
          </div>

          <Show
            when={visible().length}
            fallback={
              <div class={styles.empty}>
                <strong>Nothing here yet</strong>
                <p>
                  <Show when={products().length} fallback={`${cat().name} stock is on its way.`}>
                    No {cat().name} products match this filter.
                  </Show>
                </p>
                <Show when={products().length}>
                  <button type="button" onClick={() => { setFilter("all"); setSearchParams({ set: undefined }, { replace: true }); }}>Show everything</button>
                </Show>
              </div>
            }
          >
            <ProductGrid products={visible()} />
          </Show>
        </GameSubpageShell>
      )}
    </Show>
  );
}
