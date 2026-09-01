import { A } from "@solidjs/router";
import { For } from "solid-js";
import styles from "./SetCollections.module.scss";

const COLLECTIONS = [
  {
    game: "Pokémon",
    title: "Base Set icons",
    note: "Vintage singles and collector favourites",
    href: "/categories/pokemon",
    code: "BASE",
    theme: "pokemon",
  },
  {
    game: "Yu-Gi-Oh!",
    title: "Crystal Revenge",
    note: "Booster packs and complete display boxes",
    href: "/products/crystal-revenge-box",
    code: "BLCR",
    theme: "yugioh",
  },
  {
    game: "Magic: The Gathering",
    title: "Bloomburrow",
    note: "Play boosters and sealed booster boxes",
    href: "/products/bloomburrow-box",
    code: "BLB",
    theme: "magic",
  },
  {
    game: "All games",
    title: "Upcoming releases",
    note: "Preorders published from the release calendar",
    href: "/products?q=pre-order",
    code: "NEXT",
    theme: "upcoming",
  },
];

export default function SetCollections() {
  return (
    <section class={styles.section}>
      <div class={styles.wide}>
        <header class={styles.header}>
          <div>
            <h2>Sets and releases</h2>
            <p>Enter through a set collection, then choose the exact product format before adding it to your cart.</p>
          </div>
          <A href="/products" class={styles.viewAll}>Shop all products</A>
        </header>

        <div class={styles.rail}>
          <For each={COLLECTIONS}>
            {collection => (
              <A
                href={collection.href}
                class={styles.collection}
                classList={{ [styles[collection.theme]]: true }}
              >
                <span class={styles.game}>{collection.game}</span>
                <div>
                  <h3>{collection.title}</h3>
                  <p>{collection.note}</p>
                </div>
                <span class={styles.open}>
                  Open collection
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </span>
              </A>
            )}
          </For>
        </div>
      </div>
    </section>
  );
}
