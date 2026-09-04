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
          description="Open a set to see only the products, formats, and variants released for it."
        >
          <Title>{cat().name} sets | TCGHaven</Title>
          <Show when={sets().length}>
            <p class={styles.resultCount}>
              <strong>{sets().length}</strong>
              {sets().length === 1 ? " collection" : " collections"}
            </p>
          </Show>
          <Show when={sets().length} fallback={<div class={styles.empty}><strong>No sets yet</strong><p>{cat().name} sets will appear here as products are added.</p><A href={`/categories/${game()}/products`}>Shop all products</A></div>}>
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
