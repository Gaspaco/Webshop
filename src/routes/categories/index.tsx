import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import {
  createMemo,
  createResource,
  createSignal,
  For,
  onMount,
  Show,
} from "solid-js";
import { formatPrice } from "~/lib/cart";
import type { SectionProduct } from "~/components/product/ProductCard";
import { CATEGORY_LIST } from "~/lib/categories";
import { fetchDatabaseCatalogState } from "~/lib/catalog";
import styles from "./index.module.scss";

function priceOf(product: SectionProduct) {
  return product.priceRangeCents ? product.priceRangeCents[0] : product.priceCents ?? 0;
}

export default function Categories() {
  const [clientReady, setClientReady] = createSignal(false);
  const [databaseCatalog] = createResource(
    clientReady,
    () => fetchDatabaseCatalogState(),
  );

  onMount(() => setClientReady(true));

  // The shop page counts static and database products together, so this page
  // has to as well - otherwise the two disagree about how much is in stock.
  const games = createMemo(() => {
    const managed = databaseCatalog()?.products ?? [];
    const managedIds = new Set(databaseCatalog()?.managedSlugs ?? []);

    return CATEGORY_LIST.map(game => {
      const products = [
        ...game.products.filter(product => !managedIds.has(product.id)),
        ...managed.filter(product => product.game === game.slug),
      ];
      const priced = products.map(priceOf).filter(cents => cents > 0);

      return {
        ...game,
        count: products.length,
        from: priced.length ? Math.min(...priced) : null,
        preview: products.filter(product => product.image).slice(0, 3),
      };
    }).sort((a, b) => b.count - a.count);
  });

  const totals = createMemo(() => {
    const list = games();
    return {
      products: list.reduce((sum, game) => sum + game.count, 0),
      stocked: list.filter(game => game.count > 0).length,
    };
  });

  return (
    <main class={styles.page}>
      <Title>Browse by game | TCGHaven</Title>

      <div class={styles.wide}>
        <header class={styles.head}>
          <h1>Games</h1>
          <p>
            <strong>{totals().products}</strong> products across{" "}
            <strong>{totals().stocked}</strong> of {games().length} games
          </p>
        </header>

        <ul class={styles.directory}>
          <For each={games()}>
            {game => {
              const stocked = () => game.count > 0;

              return (
                <li>
                  <A
                    href={`/categories/${game.slug}`}
                    class={`${styles.card} ${styles[game.theme]}`}
                    classList={{ [styles.cardQuiet]: !stocked() }}
                  >
                    <div class={styles.cardText}>
                      <h2>{game.name}</h2>
                      <p>{game.tagline}</p>
                    </div>

                    <Show when={game.preview.length}>
                      <div class={styles.preview} aria-hidden="true">
                        <For each={game.preview}>
                          {(product, index) => (
                            <img
                              src={product.image}
                              alt=""
                              draggable={false}
                              loading="lazy"
                              style={{ "--i": `${index()}` }}
                            />
                          )}
                        </For>
                      </div>
                    </Show>

                    <div class={styles.cardFoot}>
                      <Show
                        when={stocked()}
                        fallback={<span class={styles.soon}>Coming soon</span>}
                      >
                        <span class={styles.meta}>
                          <strong>{game.count}</strong>
                          {game.count === 1 ? " product" : " products"}
                          <Show when={game.from}>
                            {value => <> · from <strong>{formatPrice(value())}</strong></>}
                          </Show>
                        </span>
                        <span class={styles.enter}>
                          Shop
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M5 12h14M13 6l6 6-6 6" />
                          </svg>
                        </span>
                      </Show>
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
