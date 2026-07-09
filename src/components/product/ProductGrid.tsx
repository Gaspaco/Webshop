import { A } from "@solidjs/router";
import { createMemo, createSignal, For, Show } from "solid-js";
import { formatPrice, useCart } from "~/lib/cart";
import { BoxArt, Stars, type SectionProduct } from "./ProductCard";
import styles from "./ProductGrid.module.scss";

type SortKey = "featured" | "price-asc" | "price-desc" | "name";

function priceOf(product: SectionProduct) {
  return product.priceRangeCents ? product.priceRangeCents[0] : product.priceCents ?? 0;
}

export default function ProductGrid(props: { products: SectionProduct[] }) {
  const cart = useCart();
  const [sort, setSort] = createSignal<SortKey>("featured");
  const [justAdded, setJustAdded] = createSignal<Set<string>>(new Set());

  const sorted = createMemo(() => {
    const list = [...props.products];
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
    <div>
      <div class={styles.toolbar}>
        <p class={styles.count}>{props.products.length} products</p>
        <label class={styles.sortLabel}>
          Sort by
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

      <div class={styles.grid}>
        <For each={sorted()}>
          {product => (
            <article class={styles.card}>
              <A href={product.href} class={styles.media}>
                <Show
                  when={product.image}
                  fallback={<BoxArt theme={product.theme ?? "pokemon"} label={product.set ?? product.name} />}
                >
                  <img src={product.image} alt={product.set ? `${product.name}, ${product.set}` : product.name} draggable={false} loading="lazy" />
                </Show>
                <Show when={product.badge}>
                  <span class={styles.badge}>{product.badge}</span>
                </Show>
              </A>

              <div class={styles.body}>
                <A href={product.href} class={styles.info}>
                  <span class={styles.name}>{product.name}</span>
                  <Show when={product.set}>
                    <span class={styles.set}>{product.set}</span>
                  </Show>
                  <Show when={product.rating}>
                    <Stars rating={product.rating!} />
                  </Show>
                </A>

                <div class={styles.priceRow}>
                  <span class={styles.price}>
                    <Show
                      when={!product.priceRangeCents}
                      fallback={
                        <>
                          {formatPrice(product.priceRangeCents![0])} – {formatPrice(product.priceRangeCents![1])}
                        </>
                      }
                    >
                      {formatPrice(product.priceCents ?? 0)}
                    </Show>
                  </span>
                </div>

                <Show
                  when={!product.priceRangeCents}
                  fallback={
                    <A href={product.href} class={styles.addBtn}>
                      View options
                    </A>
                  }
                >
                  <button
                    type="button"
                    class={styles.addBtn}
                    classList={{ [styles.addBtnDone]: justAdded().has(product.id) }}
                    onClick={() => addToCart(product)}
                  >
                    {justAdded().has(product.id) ? "Added" : "Add to cart"}
                  </button>
                </Show>
              </div>
            </article>
          )}
        </For>
      </div>
    </div>
  );
}
