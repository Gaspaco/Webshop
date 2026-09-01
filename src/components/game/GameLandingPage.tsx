import { Title } from "@solidjs/meta";
import { A, useParams } from "@solidjs/router";
import { createMemo, Show } from "solid-js";
import { CATEGORIES } from "~/lib/categories";
import { createGameCatalog } from "~/lib/game-catalog";
import {
  getGameIdentity,
  groupProductsBySet,
  isUpcoming,
  releaseTime,
} from "~/lib/game-storefront";
import styles from "./GameLandingPage.module.scss";

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export default function GameLandingPage() {
  const params = useParams();
  const game = () => params.game ?? "";
  const category = () => CATEGORIES[game()];
  const identity = () => getGameIdentity(game());
  const { products } = createGameCatalog(game);
  const upcoming = createMemo(() => products().filter(isUpcoming));
  const sets = createMemo(() => groupProductsBySet(products()));
  const featured = createMemo(() =>
    [...products()]
      .sort((a, b) => {
        if (a.preorder !== b.preorder) return a.preorder ? -1 : 1;
        return releaseTime(b) - releaseTime(a);
      })
      .find(product => product.image),
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
        <main
          class={styles.page}
          style={`--game-accent:${identity().accent};--game-accent-strong:${identity().accentStrong};--game-ink:${identity().accentInk}`}
        >
          <Title>{cat().name} | TCGHaven</Title>

          <section class={styles.hero}>
            <div class={styles.heroGlow} aria-hidden="true" />
            <div class={styles.wide}>
              <nav class={styles.breadcrumb} aria-label="Breadcrumb">
                <A href="/">Home</A>
                <span>/</span>
                <A href="/categories">Games</A>
                <span>/</span>
                <span>{cat().name}</span>
              </nav>

              <div class={styles.heroGrid}>
                <div class={styles.heroCopy}>
                  <span class={styles.gameCode}>{identity().code}</span>
                  <h1>{cat().name}</h1>
                  <p class={styles.descriptor}>{identity().descriptor}</p>
                  <p class={styles.blurb}>{cat().blurb}</p>
                  <div class={styles.actions}>
                    <A href={`/categories/${game()}/products`} class={styles.primaryAction}>
                      Shop {cat().name}
                      <Arrow />
                    </A>
                    <A href={`/categories/${game()}/releases`} class={styles.secondaryAction}>
                      View releases
                    </A>
                  </div>
                </div>

                <Show
                  when={featured()}
                  fallback={
                    <div class={styles.emptyFeature}>
                      <span aria-hidden="true">{identity().code}</span>
                      <div>
                        <strong>{cat().name} catalogue</strong>
                        <p>Products will appear here when the owner publishes them.</p>
                      </div>
                    </div>
                  }
                >
                  {product => (
                    <A href={product().href} class={styles.featuredProduct}>
                      <div class={styles.featuredTopline}>
                        <span>{isUpcoming(product()) ? "Upcoming" : "Featured"}</span>
                        <span>{product().setCode ?? identity().code}</span>
                      </div>
                      <img src={product().image} alt={product().name} />
                      <div class={styles.featuredCopy}>
                        <strong>{product().name}</strong>
                        <span>{product().set ?? cat().name}</span>
                      </div>
                    </A>
                  )}
                </Show>
              </div>
            </div>
          </section>

          <nav class={`${styles.wide} ${styles.destinations}`} aria-label={`${cat().name} store pages`}>
            <A href={`/categories/${game()}/releases`}>
              <span>Releases</span>
              <strong>{upcoming().length ? `${upcoming().length} upcoming` : "Release calendar"}</strong>
              <Arrow />
            </A>
            <A href={`/categories/${game()}/sets`}>
              <span>Sets</span>
              <strong>{sets().length ? `${sets().length} collections` : "Browse expansions"}</strong>
              <Arrow />
            </A>
            <A href={`/categories/${game()}/products`}>
              <span>Catalogue</span>
              <strong>{products().length ? `${products().length} products` : "All products"}</strong>
              <Arrow />
            </A>
          </nav>
        </main>
      )}
    </Show>
  );
}
