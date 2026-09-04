import { A } from "@solidjs/router";
import { createMemo, For, Show } from "solid-js";
import type { ShopProduct } from "~/lib/categories";
import { CATEGORIES } from "~/lib/categories";
import { setPathSegment } from "~/lib/game-storefront";
import styles from "./SetCollections.module.scss";

type SetCollectionsProps = { products: ShopProduct[] };

type SetEntry = {
  key: string;
  name: string;
  code?: string;
  game: string;
  gameName: string;
  theme: string;
  count: number;
  image?: string;
  href: string;
};

// Built from the catalogue rather than a hardcoded list, so the home page can
// never advertise a set the shop does not actually carry.
function collectSets(products: ShopProduct[]): SetEntry[] {
  const grouped = new Map<string, SetEntry>();

  for (const product of products) {
    if (!product.set || !product.game) continue;
    const key = `${product.game}:${product.set}`;
    const current = grouped.get(key);
    grouped.set(key, {
      key,
      name: product.set,
      code: current?.code ?? product.setCode,
      game: product.game,
      gameName: product.gameName ?? CATEGORIES[product.game]?.name ?? product.game,
      theme: product.theme ?? CATEGORIES[product.game]?.theme ?? "pokemon",
      count: (current?.count ?? 0) + 1,
      image: current?.image ?? product.image,
      href: `/categories/${product.game}/sets/${setPathSegment(product.set)}`,
    });
  }

  return [...grouped.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 4);
}

export default function SetCollections(props: SetCollectionsProps) {
  const sets = createMemo(() => collectSets(props.products));

  return (
    <Show when={sets().length}>
      <section class={styles.section}>
        <div class={styles.wide}>
          <header class={styles.header}>
            <h2>Shop by set</h2>
            <A href="/products" class={styles.viewAll}>All products</A>
          </header>

          <div class={styles.rail}>
            <For each={sets()}>
              {set => (
                <A
                  href={set.href}
                  class={`${styles.collection} ${styles[set.theme] ?? ""}`}
                >
                  <Show when={set.image}>
                    {image => (
                      <span class={styles.art} aria-hidden="true">
                        <img src={image()} alt="" draggable={false} loading="lazy" />
                      </span>
                    )}
                  </Show>

                  <span class={styles.game}>{set.gameName}</span>
                  <h3>{set.name}</h3>
                  <span class={styles.count}>
                    {set.count} {set.count === 1 ? "product" : "products"}
                  </span>
                </A>
              )}
            </For>
          </div>
        </div>
      </section>
    </Show>
  );
}
