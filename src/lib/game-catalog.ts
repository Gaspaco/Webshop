import { createMemo, createResource, createSignal, onMount, type Accessor } from "solid-js";
import { CATEGORIES, type ShopProduct } from "~/lib/categories";
import { fetchDatabaseCatalogState } from "~/lib/catalog";

export function createGameCatalog(game: Accessor<string>) {
  const [clientReady, setClientReady] = createSignal(false);
  // Only this game's products: loading the whole catalogue made every game
  // page wait for all of them.
  const [databaseCatalog] = createResource(
    () => (clientReady() && CATEGORIES[game()] ? game() : undefined),
    slug => fetchDatabaseCatalogState({ game: slug }),
  );

  const products = createMemo<ShopProduct[]>(() => {
    const category = CATEGORIES[game()];
    if (!category) return [];
    return (databaseCatalog()?.products ?? []).filter(
      product => product.game === game(),
    );
  });

  onMount(() => setClientReady(true));

  return {
    products,
    loading: () => !clientReady() || databaseCatalog.loading,
  };
}
