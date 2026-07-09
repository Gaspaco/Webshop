import { Title } from "@solidjs/meta";
import { createMemo, createSignal, For, Show } from "solid-js";
import { useCart } from "~/lib/cart";
import ProductCard, { type SectionProduct } from "~/components/product/ProductCard";
import { CATEGORY_LIST } from "~/lib/categories";
import styles from "./index.module.scss";

type ShopProduct = SectionProduct & { game: string; gameName: string };

const ALL: ShopProduct[] = CATEGORY_LIST.flatMap(cat =>
  cat.products.map(p => ({ ...p, game: cat.slug, gameName: cat.name })),
);

const GAME_OPTIONS = [
  { key: "all", label: "All games" },
  ...CATEGORY_LIST.map(cat => ({ key: cat.slug, label: cat.name })),
];

const TYPE_OPTIONS = [
  { key: "all", label: "Everything" },
  { key: "single", label: "Singles" },
  { key: "sealed", label: "Sealed & decks" },
];

const PRICE_OPTIONS = [
  { key: "all", label: "Any price" },
  { key: "under25", label: "Under €25" },
  { key: "25to100", label: "€25 – €100" },
  { key: "over100", label: "€100 and up" },
];

type SortKey = "featured" | "price-asc" | "price-desc" | "name";

function priceOf(product: SectionProduct) {
  return product.priceRangeCents ? product.priceRangeCents[0] : product.priceCents ?? 0;
}

function typeOf(product: ShopProduct) {
  return product.image ? "single" : "sealed";
}

function priceBucket(product: ShopProduct) {
  const cents = priceOf(product);
  if (cents < 2500) return "under25";
  if (cents < 10000) return "25to100";
  return "over100";
}

export default function Products() {
  const cart = useCart();
  const [game, setGame] = createSignal("all");
  const [type, setType] = createSignal("all");
  const [price, setPrice] = createSignal("all");
  const [sort, setSort] = createSignal<SortKey>("featured");
  const [justAdded, setJustAdded] = createSignal<Set<string>>(new Set());

  const gameCount = (key: string) =>
    key === "all" ? ALL.length : ALL.filter(p => p.game === key).length;

  const visible = createMemo(() => {
    const list = ALL.filter(
      p =>
        (game() === "all" || p.game === game()) &&
        (type() === "all" || typeOf(p) === type()) &&
        (price() === "all" || priceBucket(p) === price()),
    );
    switch (sort()) {
      case "price-asc":
        return list.sort((a, b) => priceOf(a) - priceOf(b));
      case "price-desc":
        return list.sort((a, b) => priceOf(b) - priceOf(a));
      case "name":
        return list.sort((a, b) => a.name.localeCompare(b.name));
      default:
        return list;
    }
  });

  const hasFilters = () => game() !== "all" || type() !== "all" || price() !== "all";

  const clearFilters = () => {
    setGame("all");
    setType("all");
    setPrice("all");
  };

  const addToCart = (product: SectionProduct) => {
    if (product.priceRangeCents || product.priceCents === undefined) return;
    cart.addItem({
      id: product.id,
      name: product.set ? `${product.name} · ${product.set}` : product.name,
      image: product.image ?? "/images/logo-mark.png",
      priceCents: product.priceCents,
    });
    setJustAdded(prev => new Set(prev).add(product.id));
    setTimeout(() => {
      setJustAdded(prev => {
        const next = new Set(prev);
        next.delete(product.id);
        return next;
      });
    }, 1400);
  };

  return (
    <main class={styles.page}>
      <Title>Shop | TCGHaven</Title>

      <div class={styles.wide}>
        <header class={styles.header}>
          <h1 class={styles.heading}>Shop everything</h1>
          <p class={styles.sub}>
            The full shelf: every game, every set. Narrow it down on the left,
            then sort by what matters to you.
          </p>
        </header>

        <div class={styles.layout}>
          <aside class={styles.sidebar}>
            <div class={styles.sidebarHead}>
              <span class={styles.sidebarTitle}>Filters</span>
              <Show when={hasFilters()}>
                <button type="button" class={styles.clearBtn} onClick={clearFilters}>
                  Clear all
                </button>
              </Show>
            </div>

            <div class={styles.filterGroup}>
              <span class={styles.groupTitle}>Game</span>
              <For each={GAME_OPTIONS}>
                {opt => (
                  <button
                    type="button"
                    class={styles.option}
                    classList={{ [styles.optionActive]: game() === opt.key }}
                    aria-pressed={game() === opt.key}
                    onClick={() => setGame(opt.key)}
                  >
                    <span>{opt.label}</span>
                    <span class={styles.optionCount}>{gameCount(opt.key)}</span>
                  </button>
                )}
              </For>
            </div>

            <div class={styles.filterGroup}>
              <span class={styles.groupTitle}>Type</span>
              <For each={TYPE_OPTIONS}>
                {opt => (
                  <button
                    type="button"
                    class={styles.option}
                    classList={{ [styles.optionActive]: type() === opt.key }}
                    aria-pressed={type() === opt.key}
                    onClick={() => setType(opt.key)}
                  >
                    <span>{opt.label}</span>
                  </button>
                )}
              </For>
            </div>

            <div class={styles.filterGroup}>
              <span class={styles.groupTitle}>Price</span>
              <For each={PRICE_OPTIONS}>
                {opt => (
                  <button
                    type="button"
                    class={styles.option}
                    classList={{ [styles.optionActive]: price() === opt.key }}
                    aria-pressed={price() === opt.key}
                    onClick={() => setPrice(opt.key)}
                  >
                    <span>{opt.label}</span>
                  </button>
                )}
              </For>
            </div>
          </aside>

          <div class={styles.main}>
            <div class={styles.toolbar}>
              <p class={styles.resultCount}>
                <strong>{visible().length}</strong>
                {visible().length === 1 ? " product" : " products"}
                <Show when={hasFilters()}>
                  <span class={styles.resultTotal}> of {ALL.length}</span>
                </Show>
              </p>

              <label class={styles.sortLabel}>
                Sort
                <select
                  class={styles.sortSelect}
                  value={sort()}
                  onChange={e => setSort(e.currentTarget.value as SortKey)}
                >
                  <option value="featured">Featured</option>
                  <option value="price-asc">Price: low to high</option>
                  <option value="price-desc">Price: high to low</option>
                  <option value="name">Name A–Z</option>
                </select>
              </label>
            </div>

            <Show
              when={visible().length}
              fallback={
                <div class={styles.empty}>
                  <p class={styles.emptyTitle}>No matches</p>
                  <p class={styles.emptyText}>Nothing fits those filters yet.</p>
                  <button type="button" class={styles.emptyBtn} onClick={clearFilters}>
                    Clear filters
                  </button>
                </div>
              }
            >
              <div class={styles.grid}>
                <For each={visible()}>
                  {product => (
                    <ProductCard
                      product={product}
                      isJustAdded={() => justAdded().has(product.id)}
                      onAdd={addToCart}
                      fill
                    />
                  )}
                </For>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </main>
  );
}
