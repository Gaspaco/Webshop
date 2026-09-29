import { Title } from "@solidjs/meta";
import { A, useParams } from "@solidjs/router";
import { createMemo, For, Show } from "solid-js";
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
  const spotlight = createMemo(() =>
    [...products()]
      .sort((a, b) => {
        const aPreorder = isActivePreorder(a);
        const bPreorder = isActivePreorder(b);
        if (aPreorder !== bPreorder) return aPreorder ? -1 : 1;
        return releaseTime(b) - releaseTime(a);
      })
      .filter(product => product.image)
      .slice(0, 3),
  );
  const featured = () => spotlight()[0];

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
            <div class={styles.wide}>
              <nav class={styles.breadcrumb} aria-label="Breadcrumb">
                <A href="/">Home</A>
                <span aria-hidden="true">/</span>
                <A href="/categories">Games</A>
                <span aria-hidden="true">/</span>
                <span>{cat().name}</span>
              </nav>

              <div class={styles.masthead}>
                <div class={styles.intro}>
                  <h1>{cat().name}</h1>
                  <p class={styles.descriptor}>{identity().descriptor}</p>
                  <p class={styles.blurb}>{cat().blurb}</p>

                  <div class={styles.actions}>
                    <A href={`/categories/${game()}/products`} class={styles.primaryAction}>
                      Enter the shop
                      <Arrow />
                    </A>
                    <A href={`/categories/${game()}/releases`} class={styles.secondaryAction}>
                      Release calendar
                    </A>
                  </div>

                  <p class={styles.stockLine}>
                    <Show
                      when={products().length}
                      fallback={`${cat().name} stock is on its way.`}
                    >
                      <strong>{products().length}</strong>
                      {products().length === 1 ? " product" : " products"}
                      {" across "}
                      <strong>{sets().length}</strong>
                      {sets().length === 1 ? " set" : " sets"}
                      <Show when={upcoming().length}>
                        {", "}
                        <strong>{upcoming().length}</strong> arriving soon
                      </Show>
                    </Show>
                  </p>
                </div>

                <Show
                  when={featured()}
                  fallback={
                    <div class={styles.emptyArtwork}>
                      <strong>Nothing on the shelf yet</strong>
                      <p>The first published {cat().name} product will show up here.</p>
                    </div>
                  }
                >
                  {product => (
                    <div class={styles.showcase}>
                      <div class={styles.productStage}>
                        <For each={spotlight().slice(1)}>
                          {(supporting, index) => (
                            <A
                              href={supporting.href}
                              class={styles.supportingProduct}
                              classList={{ [styles.supportingProductLast]: index() === 1 }}
                              aria-label={supporting.name}
                            >
                              <img src={supporting.image} alt="" draggable={false} />
                            </A>
                          )}
                        </For>

                        <A href={product().href} class={styles.featuredProduct}>
                          <img src={product().image} alt={product().name} draggable={false} />
                        </A>
                      </div>

                      <div class={styles.showcaseCaption}>
                        <span>{isUpcoming(product()) ? "Next release" : "On the shelf"}</span>
                        <A href={product().href}>{product().name}</A>
                        <small>{product().setCode ?? product().set ?? cat().name}</small>
                      </div>
                    </div>
                  )}
                </Show>
              </div>

              <nav class={styles.destinations} aria-label={`${cat().name} store pages`}>
                <p>Explore {cat().name}</p>
                <A href={`/categories/${game()}/products`}>
                  <strong>Catalogue</strong>
                  <small>Every {cat().name} product in stock</small>
                  <Arrow />
                </A>
                <A href={`/categories/${game()}/sets`}>
                  <strong>Set archive</strong>
                  <small>Browse by expansion</small>
                  <Arrow />
                </A>
                <A href={`/categories/${game()}/releases`}>
                  <strong>Releases</strong>
                  <small>What is arriving next</small>
                  <Arrow />
                </A>
              </nav>
            </div>
          </section>
        </main>
      )}
    </Show>
  );
}
