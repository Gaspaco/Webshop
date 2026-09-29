import { Title } from "@solidjs/meta";
import { useSearchParams } from "@solidjs/router";
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  on,
  onMount,
  Show,
} from "solid-js";
import ProductCard, {
  type ProductVariantOption,
  type SectionProduct,
} from "~/components/product/ProductCard";
import { CATEGORY_LIST, type ShopProduct } from "~/lib/categories";
import { fetchDatabaseCatalogState } from "~/lib/catalog";
import { useCart } from "~/lib/cart";
import { isActivePreorder } from "~/lib/game-storefront";
import styles from "./index.module.scss";

const GAME_OPTIONS = [
  { key: "all", label: "All games" },
  ...CATEGORY_LIST.map(category => ({ key: category.slug, label: category.name })),
];

const TYPE_OPTIONS = [
  { key: "all", label: "All" },
  { key: "sealed", label: "Sealed" },
  { key: "single", label: "Singles" },
];

const PRICE_OPTIONS = [
  { key: "all", label: "Any price" },
  { key: "under25", label: "Under €25" },
  { key: "25to100", label: "€25 – €100" },
  { key: "over100", label: "€100 and up" },
];

const SORT_OPTIONS = [
  { key: "featured", label: "Featured" },
  { key: "price-asc", label: "Price: low to high" },
  { key: "price-desc", label: "Price: high to low" },
  { key: "name", label: "Name: A to Z" },
];

type SortKey = "featured" | "price-asc" | "price-desc" | "name";

function searchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function validOption(
  value: string | string[] | undefined,
  options: Array<{ key: string }>,
  fallback: string,
) {
  const candidate = searchValue(value);
  return options.some(option => option.key === candidate) ? candidate : fallback;
}

function priceOf(product: SectionProduct) {
  const mainVariant =
    product.variants?.find(variant => variant.isDefault) ??
    product.variants?.find(variant => variant.id === product.variantId) ??
    product.variants?.[0];
  return mainVariant?.priceCents ?? product.priceCents ?? product.priceRangeCents?.[0] ?? 0;
}

function typeOf(product: ShopProduct) {
  return product.productType ?? (product.image ? "single" : "sealed");
}

function priceBucket(product: ShopProduct) {
  const cents = priceOf(product);
  if (cents < 2500) return "under25";
  if (cents < 10000) return "25to100";
  return "over100";
}

function inStock(product: ShopProduct) {
  if (product.variants?.length) {
    return product.variants.some(variant => variant.stock > 0);
  }
  return product.stock === undefined || product.stock > 0;
}

function searchableText(product: ShopProduct) {
  return [
    product.name,
    product.set,
    product.game,
    product.gameName,
    product.description,
    product.badge,
    product.releaseDate,
    isActivePreorder(product) ? "pre-order upcoming" : "",
    product.productType,
    product.condition,
    product.language,
    product.finish,
    product.cardNumber,
    product.rarity,
    product.setCode,
    product.illustrator,
    product.gradingCompany,
    product.grade,
    product.certificationNumber,
    product.sku,
    ...(product.variants ?? []).flatMap(variant => [
      variant.name,
      variant.sku,
      variant.condition,
      variant.language,
      variant.finish,
    ]),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLocaleLowerCase();
}

export default function Products() {
  const cart = useCart();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = createSignal(
    searchValue(searchParams.q),
  );
  const [game, setGame] = createSignal(validOption(searchParams.game, GAME_OPTIONS, "all"));
  const [type, setType] = createSignal(validOption(searchParams.type, TYPE_OPTIONS, "all"));
  const [price, setPrice] = createSignal(validOption(searchParams.price, PRICE_OPTIONS, "all"));
  const [stockOnly, setStockOnly] = createSignal(searchValue(searchParams.stock) === "1");
  const [sort, setSort] = createSignal<SortKey>(
    validOption(searchParams.sort, SORT_OPTIONS, "featured") as SortKey,
  );
  const [filtersOpen, setFiltersOpen] = createSignal(false);
  const [justAdded, setJustAdded] = createSignal<Set<string>>(new Set());
  const [clientReady, setClientReady] = createSignal(false);
  const [databaseCatalog] = createResource(
    clientReady,
    () => fetchDatabaseCatalogState(),
  );
  const catalogPending = () =>
    !clientReady() || databaseCatalog.loading || databaseCatalog() === undefined;
  const allProducts = createMemo(() => {
    return databaseCatalog()?.products ?? [];
  });

  onMount(() => setClientReady(true));

  createEffect(
    on(
      () => [
        searchParams.q,
        searchParams.game,
        searchParams.type,
        searchParams.price,
        searchParams.stock,
        searchParams.sort,
      ] as const,
      ([query, gameFilter, typeFilter, priceFilter, stockFilter, sortFilter]) => {
        setSearch(searchValue(query));
        setGame(validOption(gameFilter, GAME_OPTIONS, "all"));
        setType(validOption(typeFilter, TYPE_OPTIONS, "all"));
        setPrice(validOption(priceFilter, PRICE_OPTIONS, "all"));
        setStockOnly(searchValue(stockFilter) === "1");
        setSort(validOption(sortFilter, SORT_OPTIONS, "featured") as SortKey);
      },
      { defer: true },
    ),
  );

  // Keep the active catalogue view in the URL. Browser Back then restores the
  // exact search, facets, and sort after somebody opens a product.
  createEffect(() => {
    if (!clientReady()) return;
    setSearchParams(
      {
        q: search().trim() || undefined,
        game: game() === "all" ? undefined : game(),
        type: type() === "all" ? undefined : type(),
        price: price() === "all" ? undefined : price(),
        stock: stockOnly() ? "1" : undefined,
        sort: sort() === "featured" ? undefined : sort(),
      },
      { replace: true },
    );
  });

  // Everything except the game facet, so the sidebar can show honest counts
  // for each game against the rest of the current filter state.
  const matchesRest = (product: ShopProduct, query: string[]) =>
    query.every(part => searchableText(product).includes(part)) &&
    (type() === "all" || typeOf(product) === type()) &&
    (price() === "all" || priceBucket(product) === price()) &&
    (!stockOnly() || inStock(product));

  const queryParts = createMemo(() =>
    search().trim().toLocaleLowerCase().split(/\s+/).filter(Boolean),
  );

  const gameCounts = createMemo(() => {
    const parts = queryParts();
    const counts = new Map<string, number>();
    let total = 0;
    for (const product of allProducts()) {
      if (!matchesRest(product, parts)) continue;
      total += 1;
      counts.set(product.game, (counts.get(product.game) ?? 0) + 1);
    }
    counts.set("all", total);
    return counts;
  });

  const visible = createMemo(() => {
    const parts = queryParts();
    const list = allProducts().filter(
      product =>
        matchesRest(product, parts) && (game() === "all" || product.game === game()),
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

  const clearSearch = () => {
    setSearch("");
  };

  // Every active filter as a removable chip, so the current state of the
  // catalogue is never hidden inside a control you have to go looking for.
  const activeChips = createMemo(() => {
    const chips: { label: string; clear: () => void }[] = [];
    if (search().trim()) {
      chips.push({ label: `“${search().trim()}”`, clear: clearSearch });
    }
    if (game() !== "all") {
      chips.push({
        label: GAME_OPTIONS.find(option => option.key === game())?.label ?? game(),
        clear: () => setGame("all"),
      });
    }
    if (type() !== "all") {
      chips.push({
        label: TYPE_OPTIONS.find(option => option.key === type())?.label ?? type(),
        clear: () => setType("all"),
      });
    }
    if (price() !== "all") {
      chips.push({
        label: PRICE_OPTIONS.find(option => option.key === price())?.label ?? price(),
        clear: () => setPrice("all"),
      });
    }
    if (stockOnly()) {
      chips.push({ label: "In stock", clear: () => setStockOnly(false) });
    }
    return chips;
  });

  const clearFilters = () => {
    clearSearch();
    setGame("all");
    setType("all");
    setPrice("all");
    setStockOnly(false);
  };

  const addToCart = (
    product: SectionProduct,
    variant?: ProductVariantOption,
  ) => {
    const priceCents = variant?.priceCents ?? product.priceCents;
    if (priceCents === undefined) return;

    cart.addItem({
      id: product.id,
      variantId: variant?.id,
      name: `${product.set ? `${product.name} · ${product.set}` : product.name}${variant ? ` (${variant.name})` : ""}`,
      image: variant?.image ?? product.image ?? "/images/logo-mark.png",
      priceCents,
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
        <header class={styles.head}>
          <h1>Shop</h1>

          <div class={styles.searchRow}>
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
                placeholder="Search a card, set, or game…"
              />
              <Show when={search()}>
                <button type="button" onClick={clearSearch} aria-label="Clear search">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </Show>
            </label>

            <button
              type="button"
              class={styles.filterToggle}
              aria-expanded={filtersOpen()}
              onClick={() => setFiltersOpen(open => !open)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                <path d="M3 6h18M6 12h12M10 18h4" />
              </svg>
              <span>Filters</span>
              <Show when={activeChips().length}>
                <span class={styles.filterCount}>{activeChips().length}</span>
              </Show>
            </button>
          </div>
        </header>

        <div class={styles.shell}>
          <Show when={filtersOpen()}>
            <button
              type="button"
              class={styles.scrim}
              aria-label="Close filters"
              onClick={() => setFiltersOpen(false)}
            />
          </Show>

          <aside
            class={styles.rail}
            classList={{ [styles.railOpen]: filtersOpen() }}
            aria-label="Shop filters"
          >
            <div class={styles.railHead}>
              <h2>Filters</h2>
              <button type="button" class={styles.railClose} onClick={() => setFiltersOpen(false)} aria-label="Close filters">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div class={styles.group} role="group" aria-labelledby="filter-format">
              <p id="filter-format">Format</p>
              <div class={styles.segmented}>
                <For each={TYPE_OPTIONS}>
                  {option => (
                    <button
                      type="button"
                      classList={{ [styles.segmentActive]: type() === option.key }}
                      aria-pressed={type() === option.key}
                      onClick={() => setType(option.key)}
                    >
                      {option.label}
                    </button>
                  )}
                </For>
              </div>
            </div>

            <div class={styles.group} role="group" aria-labelledby="filter-game">
              <p id="filter-game">Game</p>
              <div class={styles.optionList}>
                <For each={GAME_OPTIONS}>
                  {option => (
                    <button
                      type="button"
                      class={styles.option}
                      classList={{ [styles.optionActive]: game() === option.key }}
                      aria-pressed={game() === option.key}
                      disabled={option.key !== "all" && !gameCounts().get(option.key)}
                      onClick={() => setGame(option.key)}
                    >
                      <span class={styles.optionDot} aria-hidden="true" />
                      <span class={styles.optionLabel}>{option.label}</span>
                      <span class={styles.optionCount}>{gameCounts().get(option.key) ?? 0}</span>
                    </button>
                  )}
                </For>
              </div>
            </div>

            <div class={styles.group} role="group" aria-labelledby="filter-price">
              <p id="filter-price">Price</p>
              <div class={styles.optionList}>
                <For each={PRICE_OPTIONS}>
                  {option => (
                    <button
                      type="button"
                      class={styles.option}
                      classList={{ [styles.optionActive]: price() === option.key }}
                      aria-pressed={price() === option.key}
                      onClick={() => setPrice(option.key)}
                    >
                      <span class={styles.optionDot} aria-hidden="true" />
                      <span class={styles.optionLabel}>{option.label}</span>
                    </button>
                  )}
                </For>
              </div>
            </div>

            <div class={styles.group}>
              <label class={styles.switch}>
                <input
                  type="checkbox"
                  checked={stockOnly()}
                  onChange={event => setStockOnly(event.currentTarget.checked)}
                />
                <span class={styles.switchTrack} aria-hidden="true"><span /></span>
                <span>In stock only</span>
              </label>
            </div>

            <div class={styles.railFoot}>
              <button
                type="button"
                class={styles.railApply}
                onClick={() => setFiltersOpen(false)}
              >
                Show {visible().length} {visible().length === 1 ? "product" : "products"}
              </button>
              <Show when={activeChips().length}>
                <button type="button" class={styles.railReset} onClick={clearFilters}>
                  Reset filters
                </button>
              </Show>
            </div>
          </aside>

          <section class={styles.results} aria-label="Products">
            <div class={styles.toolbar}>
              <Show
                when={!catalogPending()}
                fallback={<p class={styles.resultCount}>Loading products</p>}
              >
                <p class={styles.resultCount}>
                  <strong>{visible().length}</strong>
                  {visible().length === 1 ? " product" : " products"}
                </p>
              </Show>

              <label class={styles.sortField}>
                <span>Sort</span>
                <select value={sort()} onChange={event => setSort(event.currentTarget.value as SortKey)}>
                  <For each={SORT_OPTIONS}>
                    {option => <option value={option.key}>{option.label}</option>}
                  </For>
                </select>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </label>
            </div>

            <Show when={activeChips().length}>
              <div class={styles.chips}>
                <For each={activeChips()}>
                  {chip => (
                    <button type="button" class={styles.chip} onClick={chip.clear}>
                      <span>{chip.label}</span>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </For>
                <button type="button" class={styles.chipClear} onClick={clearFilters}>Clear all</button>
              </div>
            </Show>

            <Show
              when={!catalogPending()}
              fallback={
                <div class={styles.loadingGrid} role="status" aria-label="Loading products">
                  <span class={styles.srOnly}>Loading products</span>
                  <For each={[0, 1, 2, 3, 4, 5, 6, 7]}>
                    {() => (
                      <div class={styles.loadingCard} aria-hidden="true">
                        <span class={styles.loadingArt} />
                        <span class={styles.loadingName} />
                        <span class={styles.loadingMeta} />
                      </div>
                    )}
                  </For>
                </div>
              }
            >
              <Show
                when={visible().length}
                fallback={
                  <div class={styles.empty}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                      <circle cx="11" cy="11" r="7" />
                      <path d="m20 20-4-4" />
                    </svg>
                    <p class={styles.emptyTitle}>No products match</p>
                    <p>Try a different search, or clear a filter or two.</p>
                    <button type="button" onClick={clearFilters}>Clear all filters</button>
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
            </Show>
          </section>
        </div>
      </div>
    </main>
  );
}
