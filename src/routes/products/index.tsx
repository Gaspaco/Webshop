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
import { ALL_PRODUCTS, CATEGORY_LIST, type ShopProduct } from "~/lib/categories";
import { fetchDatabaseCatalogState } from "~/lib/catalog";
import { useCart } from "~/lib/cart";
import styles from "./index.module.scss";

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

export default function Products() {
  const cart = useCart();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = createSignal(
    typeof searchParams.q === "string" ? searchParams.q : "",
  );
  const [game, setGame] = createSignal("all");
  const [type, setType] = createSignal("all");
  const [price, setPrice] = createSignal("all");
  const [sort, setSort] = createSignal<SortKey>("featured");
  const [justAdded, setJustAdded] = createSignal<Set<string>>(new Set());
  const [clientReady, setClientReady] = createSignal(false);
  const [databaseCatalog] = createResource(
    clientReady,
    () => fetchDatabaseCatalogState(),
  );
  const allProducts = createMemo(() => {
    const managed = databaseCatalog()?.products ?? [];
    const managedIds = new Set(databaseCatalog()?.managedSlugs ?? []);
    return [
      ...ALL_PRODUCTS.filter(product => !managedIds.has(product.id)),
      ...managed,
    ];
  });

  onMount(() => setClientReady(true));

  createEffect(
    on(
      () => searchParams.q,
      query => setSearch(typeof query === "string" ? query : ""),
      { defer: true },
    ),
  );

  const visible = createMemo(() => {
    const query = search().trim().toLocaleLowerCase();
    const queryParts = query.split(/\s+/).filter(Boolean);
    const list = allProducts().filter(
      product => {
        const searchable = [
          product.name,
          product.set,
          product.game,
          product.gameName,
          product.description,
          product.badge,
          product.releaseDate,
          product.preorder ? "pre-order upcoming" : "",
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

        return (
          queryParts.every(part => searchable.includes(part)) &&
          (game() === "all" || product.game === game()) &&
          (type() === "all" || typeOf(product) === type()) &&
          (price() === "all" || priceBucket(product) === price())
        );
      },
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
    if (searchParams.q) {
      setSearchParams({ q: undefined }, { replace: true });
    }
    setGame("all");
    setType("all");
    setPrice("all");
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
        <header class={styles.header}>
          <h1>Everything in stock</h1>
          <p>
            Singles, sealed product, and decks across every game we carry, each
            one condition-checked before it ships.
          </p>
          <p class={styles.stockLine}>
            <strong>{allProducts().length}</strong>
            {allProducts().length === 1 ? " product" : " products"} listed
            &middot; updated daily
          </p>
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

        <Show when={hasFilters()}>
          <div class={styles.catalogHead}>
            <button type="button" onClick={clearFilters}>Reset filters</button>
          </div>
        </Show>

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
