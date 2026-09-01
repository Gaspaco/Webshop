import { Title } from "@solidjs/meta";
import { A, useParams } from "@solidjs/router";
import { createMemo, Show } from "solid-js";
import GameSubpageShell from "~/components/game/GameSubpageShell";
import ProductGrid from "~/components/product/ProductGrid";
import { CATEGORIES } from "~/lib/categories";
import { createGameCatalog } from "~/lib/game-catalog";
import { groupProductsBySet, setPathSegment } from "~/lib/game-storefront";
import styles from "../game-pages.module.scss";

export default function GameSetPage() {
  const params = useParams();
  const game = () => params.game ?? "";
  const setPath = () => params.set ?? "";
  const category = () => CATEGORIES[game()];
  const { products } = createGameCatalog(game);
  const setGroup = createMemo(() =>
    groupProductsBySet(products()).find(set => set.path === setPath()),
  );
  const setProducts = createMemo(() =>
    products().filter(product => product.set && setPathSegment(product.set) === setPath()),
  );

  return (
    <Show when={category()} fallback={<main class={styles.missing}><h1>Game not found</h1><A href="/categories">Browse all games</A></main>}>
      {cat => (
        <Show
          when={setGroup()}
          fallback={<GameSubpageShell category={cat()} active="sets" title="Set not found" description="This set has not been published for this game."><div class={styles.empty}><div><strong>We could not find that set.</strong><p>It may have been renamed or removed from the catalogue.</p></div><A href={`/categories/${game()}/sets`}>Browse all sets</A></div></GameSubpageShell>}
        >
          {set => (
            <GameSubpageShell
              category={cat()}
              active="sets"
              title={set().name}
              description={`${set().code ? `${set().code}. ` : ""}${set().count} ${set().count === 1 ? "product" : "products"} published in this set.`}
            >
              <Title>{set().name} | {cat().name} | TCGHaven</Title>
              <ProductGrid products={setProducts()} />
            </GameSubpageShell>
          )}
        </Show>
      )}
    </Show>
  );
}
