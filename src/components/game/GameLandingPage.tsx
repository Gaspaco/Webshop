import { Title } from "@solidjs/meta";
import { A, useParams } from "@solidjs/router";
import { createMemo, Show } from "solid-js";
import GameHeader from "~/components/game/GameHeader";
import ProductSection from "~/components/product/ProductSection";
import { CATEGORIES } from "~/lib/categories";
import { createGameCatalog } from "~/lib/game-catalog";
import {
  getGameIdentity,
  groupProductsBySet,
  isActivePreorder,
  isUpcoming,
  releaseTime,
} from "~/lib/game-storefront";
import styles from "./GameLandingPage.module.scss";

export default function GameLandingPage() {
  const params = useParams();
  const game = () => params.game ?? "";
  const category = () => CATEGORIES[game()];
  const identity = () => getGameIdentity(game());
  const { products } = createGameCatalog(game);
  const upcoming = createMemo(() => products().filter(isUpcoming));
  const sets = createMemo(() => groupProductsBySet(products()));
  const byNewest = createMemo(() =>
    [...products()].sort((a, b) => releaseTime(b) - releaseTime(a)),
  );
  const featured = createMemo(() =>
    [...products()]
      .sort((a, b) => {
        const aPreorder = isActivePreorder(a);
        const bPreorder = isActivePreorder(b);
        if (aPreorder !== bPreorder) return aPreorder ? -1 : 1;
        return releaseTime(b) - releaseTime(a);
      })
      .find(product => product.image),
  );
  const newest = createMemo(() =>
    byNewest().filter(product => product.id !== featured()?.id).slice(0, 4),
  );

  return (
    <Show
      when={category()}
      fallback={
        <main class={styles.missing}>
          <h1>Game not found</h1>
          <A href="/categories">Browse all games</A>
        </main>
      }
    >
      {cat => (
        <main class={styles.page}>
          <Title>{cat().name} | TCGHaven</Title>

          <div class={styles.wide}>
            <GameHeader slug={game()} name={cat().name} active="overview" />

            {/* The game's own stage, lit in its colour. */}
            <section class={styles.hero} data-game={game()}>
              <div class={styles.intro}>
                <p class={styles.descriptor}>{identity().descriptor}</p>
                <p class={styles.blurb}>{cat().blurb}</p>

                <div class={styles.actions}>
                  <A href={`/categories/${game()}/products`} class={styles.primaryAction}>
                    Shop {cat().name}
                  </A>
                  <A href={`/categories/${game()}/releases`} class={styles.secondaryAction}>
                    Release calendar
                  </A>
                </div>

                <Show when={products().length}>
                  <div class={styles.stats}>
                    <span>{products().length} {products().length === 1 ? "product" : "products"}</span>
                    <span>{sets().length} {sets().length === 1 ? "set" : "sets"}</span>
                    <Show when={upcoming().length}>
                      <span class={styles.statSoon}>{upcoming().length} arriving soon</span>
                    </Show>
                  </div>
                </Show>
              </div>

              <Show
                when={featured()}
                fallback={
                  <div class={styles.emptyArtwork}>
                    <strong>Nothing on the shelf yet</strong>
                    <p>The first {cat().name} product will appear here.</p>
                  </div>
                }
              >
                {product => (
                  <A href={product().href} class={styles.showcase}>
                    <span class={styles.productStage}>
                      <img src={product().image} alt="" draggable={false} />
                    </span>
                    <span class={styles.showcaseCaption}>
                      <small>{isUpcoming(product()) ? "Next release" : "Newest on the shelf"}</small>
                      <strong>{product().name}</strong>
                    </span>
                  </A>
                )}
              </Show>
            </section>

            <nav class={styles.destinations} aria-label={`${cat().name} store pages`} data-game={game()}>
              <A href={`/categories/${game()}/products`}>
                <strong>Shop</strong>
                <small>Every {cat().name} product in stock</small>
              </A>
              <A href={`/categories/${game()}/sets`}>
                <strong>Sets</strong>
                <small>Browse by expansion</small>
              </A>
              <A href={`/categories/${game()}/releases`}>
                <strong>Releases</strong>
                <small>What is arriving next</small>
              </A>
            </nav>
          </div>

          <Show when={newest().length}>
            <ProductSection
              heading={`Newest in ${cat().name}`}
              products={newest()}
              viewAllHref={`/categories/${game()}/products`}
            />
          </Show>
        </main>
      )}
    </Show>
  );
}
