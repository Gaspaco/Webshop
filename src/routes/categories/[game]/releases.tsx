import { Title } from "@solidjs/meta";
import { A, useParams } from "@solidjs/router";
import { createMemo, For, Show } from "solid-js";
import GameSubpageShell from "~/components/game/GameSubpageShell";
import ProductGrid from "~/components/product/ProductGrid";
import { CATEGORIES } from "~/lib/categories";
import { createGameCatalog } from "~/lib/game-catalog";
import {
  formatReleaseDate,
  getGameIdentity,
  isUpcoming,
  releaseTime,
} from "~/lib/game-storefront";
import styles from "./game-pages.module.scss";

export default function GameReleasesPage() {
  const params = useParams();
  const game = () => params.game ?? "";
  const category = () => CATEGORIES[game()];
  const identity = () => getGameIdentity(game());
  const { products } = createGameCatalog(game);
  const upcoming = createMemo(() =>
    products().filter(isUpcoming).sort((a, b) => (releaseTime(a) || Number.MAX_SAFE_INTEGER) - (releaseTime(b) || Number.MAX_SAFE_INTEGER)),
  );
  const latest = createMemo(() =>
    products().filter(product => !isUpcoming(product)).sort((a, b) => releaseTime(b) - releaseTime(a)),
  );

  return (
    <Show when={category()} fallback={<main class={styles.missing}><h1>Game not found</h1><A href="/categories">Browse all games</A></main>}>
      {cat => (
        <GameSubpageShell
          category={cat()}
          active="releases"
          title={`${cat().name} releases`}
          description={identity().releaseCopy}
        >
          <Title>{cat().name} releases | TCGHaven</Title>
          <section class={styles.section}>
            <header class={styles.sectionHead}>
              <div><h2>Upcoming releases</h2><p>Preorders and products with an announced future release date.</p></div>
              <Show when={upcoming().length}><span>{upcoming().length} announced</span></Show>
            </header>
            <Show when={upcoming().length} fallback={<div class={styles.empty}><div><strong>No upcoming release is published yet.</strong><p>The owner can publish one by adding a release date or enabling preorder in the dashboard.</p></div><A href={`/categories/${game()}/products`}>Shop current products</A></div>}>
              <div class={styles.releaseList}>
                <For each={upcoming()}>{product => (
                  <A href={product.href} class={styles.releaseItem}>
                    <time datetime={product.releaseDate}>{formatReleaseDate(product.releaseDate)}</time>
                    <div><strong>{product.name}</strong><span>{product.setCode ? `${product.setCode} · ` : ""}{product.set ?? cat().name}</span></div>
                    <span aria-hidden="true">↗</span>
                  </A>
                )}</For>
              </div>
            </Show>
          </section>

          <Show when={latest().length}>
            <section class={styles.section}>
              <header class={styles.sectionHead}><div><h2>Latest products</h2><p>Recently published products for {cat().name}.</p></div></header>
              <ProductGrid products={latest()} />
            </section>
          </Show>
        </GameSubpageShell>
      )}
    </Show>
  );
}
