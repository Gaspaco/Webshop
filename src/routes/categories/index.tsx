import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import { For, Show } from "solid-js";
import { formatPrice } from "~/lib/cart";
import type { SectionProduct } from "~/components/product/ProductCard";
import { CATEGORY_LIST } from "~/lib/categories";
import styles from "./index.module.scss";

function priceOf(product: SectionProduct) {
  return product.priceRangeCents ? product.priceRangeCents[0] : product.priceCents ?? 0;
}

function fromPrice(products: SectionProduct[]) {
  return products.length ? Math.min(...products.map(priceOf)) : null;
}

const totalProducts = CATEGORY_LIST.reduce((sum, c) => sum + c.products.length, 0);

export default function Categories() {
  return (
    <main class={styles.page}>
      <Title>Browse by game | TCGHaven</Title>

      <div class={styles.wide}>
        <header class={styles.hero}>
          <h1 class={styles.heading}>Browse by game</h1>
          <p class={styles.sub}>
            Every game we stock, each with its own storefront. Condition-checked
            and shipped from the Netherlands.
          </p>
          <p class={styles.stockLine}>
            <strong>{totalProducts}</strong> products across{" "}
            <strong>{CATEGORY_LIST.length}</strong> games &middot; free PostNL
            shipping over &euro;300
          </p>
        </header>

        <ul class={styles.directory}>
          <For each={CATEGORY_LIST}>
            {game => {
              const preview = game.products.filter(product => product.image).slice(0, 3);
              const from = fromPrice(game.products);

              return (
                <li>
                  <A
                    href={`/categories/${game.slug}`}
                    class={`${styles.card} ${styles[game.theme]}`}
                  >
                    <div class={styles.cardTop}>
                      <div class={styles.cardText}>
                        <h2>{game.name}</h2>
                        <p>{game.tagline}</p>
                      </div>

                      <Show when={preview.length}>
                        <div class={styles.preview} aria-hidden="true">
                          <For each={preview}>
                            {(product, index) => (
                              <img
                                src={product.image}
                                alt=""
                                draggable={false}
                                style={{ "--i": `${index()}` }}
                              />
                            )}
                          </For>
                        </div>
                      </Show>
                    </div>

                    <div class={styles.cardFoot}>
                      <span class={styles.meta}>
                        <Show
                          when={game.products.length}
                          fallback="Coming soon"
                        >
                          <strong>{game.products.length}</strong>
                          {game.products.length === 1 ? " product" : " products"}
                          <Show when={from}>
                            {value => (
                              <>
                                <span class={styles.dot} aria-hidden="true">&middot;</span>
                                from <strong>{formatPrice(value())}</strong>
                              </>
                            )}
                          </Show>
                        </Show>
                      </span>

                      <span class={styles.enter}>
                        Shop
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                          <path d="M5 12h14M13 6l6 6-6 6" />
                        </svg>
                      </span>
                    </div>
                  </A>
                </li>
              );
            }}
          </For>
        </ul>
      </div>
    </main>
  );
}
