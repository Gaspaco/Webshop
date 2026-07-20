import { Title } from "@solidjs/meta";
import { createMemo, createSignal, For, Show } from "solid-js";
import ProductCard, { type SectionProduct } from "~/components/product/ProductCard";
import { CATEGORY_LIST } from "~/lib/categories";
import { useCart } from "~/lib/cart";
import styles from "./index.module.scss";

type ShopProduct = SectionProduct & { game: string; gameName: string };

const ALL: ShopProduct[] = CATEGORY_LIST.flatMap(category =>
  category.products.map(product => ({
    ...product,
    game: category.slug,
    gameName: category.name,
    theme: product.theme ?? category.theme,
  })),
);

const GAME_OPTIONS = [
  { key: "all", label: "All games" },
  ...CATEGORY_LIST.map(category => ({ key: category.slug, label: category.name })),
];

const TYPE_OPTIONS = [
  { key: "all", label: "Everything" },
  { key: "single", label: "Singles" },
  { key: "sealed", label: "Sealed" },
];

const PRICE_OPTIONS = [
  { key: "all", label: "Any price" },
  { key: "under25", label: "Under €25" },
  { key: "25to100", label: "€25 to €100" },
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
  const [search, setSearch] = createSignal("");
  const [game, setGame] = createSignal("all");
  const [type, setType] = createSignal("all");
  const [price, setPrice] = createSignal("all");
  const [sort, setSort] = createSignal<SortKey>("featured");
  const [justAdded, setJustAdded] = createSignal<Set<string>>(new Set());

  const visible = createMemo(() => {
    const query = search().trim().toLocaleLowerCase();
    const list = ALL.filter(
      product =>
        (!query ||
          product.name.toLocaleLowerCase().includes(query) ||
          product.set?.toLocaleLowerCase().includes(query) ||
          product.gameName.toLocaleLowerCase().includes(query)) &&
        (game() === "all" || product.game === game()) &&
        (type() === "all" || typeOf(product) === type()) &&
        (price() === "all" || priceBucket(product) === price()),
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

  const hasFilters = () =>
    search().trim() !== "" || game() !== "all" || type() !== "all" || price() !== "all";

  const clearFilters = () => {
    setSearch("");
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

    setJustAdded(previous => new Set(previous).add(product.id));
    setTimeout(() => {
      setJustAdded(previous => {
        const next = new Set(previous);
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
          <div class={styles.headerCopy}>
            <h1>Shop</h1>
            <p>Browse singles, sealed products, and decks across every game we carry.</p>
          </div>

          <div class={styles.inventoryNote}>
            <strong>{ALL.length}</strong>
            <span>products available</span>
          </div>
        </header>

        <section class={styles.filters} aria-label="Shop filters">
          <div class={styles.filterTop}>
            <label class={styles.searchField}>
              <span class={styles.srOnly}>Search cards and sets</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-4-4" />
              </svg>
              <input
                type="search"
                value={search()}
                onInput={event => setSearch(event.currentTarget.value)}
                placeholder="Search cards, sets, or games"
              />
            </label>

            <nav class={styles.gameOptions} aria-label="Filter by game">
              <For each={GAME_OPTIONS}>
                {option => (
                  <button
                    type="button"
                    class={styles.gameOption}
                    classList={{ [styles.gameOptionActive]: game() === option.key }}
                    aria-pressed={game() === option.key}
                    onClick={() => setGame(option.key)}
                  >
                    {option.label}
                  </button>
                )}
              </For>
            </nav>
          </div>

          <div class={styles.filterBottom}>
            <div class={styles.typeOptions} aria-label="Filter by product type">
              <For each={TYPE_OPTIONS}>
                {option => (
                  <button
                    type="button"
                    class={styles.typeOption}
                    classList={{ [styles.typeOptionActive]: type() === option.key }}
                    aria-pressed={type() === option.key}
                    onClick={() => setType(option.key)}
                  >
                    {option.label}
                  </button>
                )}
              </For>
            </div>

            <div class={styles.selects}>
              <label>
                <span>Price</span>
                <select value={price()} onChange={event => setPrice(event.currentTarget.value)}>
                  <For each={PRICE_OPTIONS}>{option => <option value={option.key}>{option.label}</option>}</For>
                </select>
              </label>

              <label>
                <span>Sort</span>
                <select value={sort()} onChange={event => setSort(event.currentTarget.value as SortKey)}>
                  <option value="featured">Featured</option>
                  <option value="price-asc">Price: low to high</option>
                  <option value="price-desc">Price: high to low</option>
                  <option value="name">Name: A to Z</option>
                </select>
              </label>
            </div>
          </div>
        </section>

        <div class={styles.catalogHead}>
          <p aria-live="polite">
            <strong>{visible().length}</strong> {visible().length === 1 ? "product" : "products"}
          </p>
          <Show when={hasFilters()}>
            <button type="button" onClick={clearFilters}>Reset filters</button>
          </Show>
        </div>

        <Show
          when={visible().length}
          fallback={
            <div class={styles.empty}>
              <p class={styles.emptyTitle}>No products found</p>
              <p>Try another search or reset the filters.</p>
              <button type="button" onClick={clearFilters}>Reset filters</button>
            </div>
          }
        >
          <div class={styles.grid}>
            <For each={visible()}>
              {(product, index) => (
                <div
                  class={styles.gridItem}
                  style={`--card-index: ${Math.min(index(), 6)}`}
                >
                  <ProductCard
                    product={product}
                    isJustAdded={() => justAdded().has(product.id)}
                    onAdd={addToCart}
                    fill
                  />
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </main>
  );
}
