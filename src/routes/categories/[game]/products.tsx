import { Title } from "@solidjs/meta";
import { A, useParams } from "@solidjs/router";
import { createMemo, createSignal, For, Show } from "solid-js";
import GameSubpageShell from "~/components/game/GameSubpageShell";
import ProductGrid from "~/components/product/ProductGrid";
import { CATEGORIES } from "~/lib/categories";
import { createGameCatalog } from "~/lib/game-catalog";
import styles from "./game-pages.module.scss";

type ProductFilter = "all" | "single" | "sealed" | "graded" | "accessory";

const FILTERS: Array<{ value: ProductFilter; label: string }> = [
  { value: "all", label: "All products" },
  { value: "sealed", label: "Sealed" },
  { value: "single", label: "Singles" },
  { value: "graded", label: "Graded" },
  { value: "accessory", label: "Accessories" },
];

export default function GameProductsPage() {
  const params = useParams();
  const game = () => params.game ?? "";
  const category = () => CATEGORIES[game()];
  const { products } = createGameCatalog(game);
  const [filter, setFilter] = createSignal<ProductFilter>("all");
  const visible = createMemo(() =>
    products().filter(product => filter() === "all" || product.productType === filter()),
  );

  return (
    <Show when={category()} fallback={<main class={styles.missing}><h1>Game not found</h1><A href="/categories">Browse all games</A></main>}>
      {cat => (
        <GameSubpageShell
          category={cat()}
          active="products"
          title={`Shop ${cat().name}`}
          description="The complete live catalogue, with product formats, stock, prices, and variants."
        >
          <Title>Shop {cat().name} | TCGHaven</Title>
          <div class={styles.filters} role="group" aria-label="Filter products by type">
            <For each={FILTERS}>{item => (
              <button
                type="button"
                classList={{ [styles.filterActive]: filter() === item.value }}
                aria-pressed={filter() === item.value}
                onClick={() => setFilter(item.value)}
              >
                {item.label}
              </button>
            )}</For>
          </div>
          <Show when={visible().length} fallback={<div class={styles.empty}><div><strong>No products match this filter.</strong><p>Choose another product type or publish stock from the dashboard.</p></div></div>}>
            <ProductGrid products={visible()} />
          </Show>
        </GameSubpageShell>
      )}
    </Show>
  );
}
