import { Title } from "@solidjs/meta";
import { A, useParams } from "@solidjs/router";
import { createMemo, For, Show } from "solid-js";
import GameSubpageShell from "~/components/game/GameSubpageShell";
import { CATEGORIES } from "~/lib/categories";
import { createGameCatalog } from "~/lib/game-catalog";
import { groupProductsBySet } from "~/lib/game-storefront";
import styles from "../game-pages.module.scss";

export default function GameSetsPage() {
  const params = useParams();
  const game = () => params.game ?? "";
  const category = () => CATEGORIES[game()];
  const { products } = createGameCatalog(game);
  const sets = createMemo(() => groupProductsBySet(products()));

  return (
    <Show when={category()} fallback={<main class={styles.missing}><h1>Game not found</h1><A href="/categories">Browse all games</A></main>}>
      {cat => (
        <GameSubpageShell
          category={cat()}
          active="sets"
          title={`${cat().name} sets`}
          description="Every published expansion and collection has its own product page."
        >
          <Title>{cat().name} sets | TCGHaven</Title>
          <header class={styles.sectionHead}>
            <div><h2>Set directory</h2><p>Open a set to see only the products, formats, and variants released for it.</p></div>
            <Show when={sets().length}><span>{sets().length} collections</span></Show>
          </header>
          <Show when={sets().length} fallback={<div class={styles.empty}><div><strong>No sets are published yet.</strong><p>Adding a set name and set code to a product creates its own set page automatically.</p></div><A href={`/categories/${game()}/products`}>Shop all products</A></div>}>
            <div class={styles.setGrid}>
              <For each={sets()}>{set => (
                <A href={`/categories/${game()}/sets/${set.path}`} class={styles.setLink}>
                  <span>{set.code ?? "SET"}</span>
                  <strong>{set.name}</strong>
                  <small>{set.count} {set.count === 1 ? "product" : "products"}</small>
                  <span aria-hidden="true">{set.code ?? "SET"}</span>
                </A>
              )}</For>
            </div>
          </Show>
        </GameSubpageShell>
      )}
    </Show>
  );
}
