import { createMemo, createResource, createSignal, onMount, type Accessor } from "solid-js";
import { CATEGORIES, type ShopProduct } from "~/lib/categories";
import { fetchDatabaseCatalogState } from "~/lib/catalog";

export function createGameCatalog(game: Accessor<string>) {
  const [clientReady, setClientReady] = createSignal(false);
  const [databaseCatalog] = createResource(
    clientReady,
    () => fetchDatabaseCatalogState(),
  );

  const products = createMemo<ShopProduct[]>(() => {
    const category = CATEGORIES[game()];
    if (!category) return [];
    const starter = category.products.map(product => ({
      ...product,
      game: category.slug,
      gameName: category.name,
      theme: product.theme ?? category.theme,
    }));
    const managed = (databaseCatalog()?.products ?? []).filter(
      product => product.game === game(),
    );
    const managedIds = new Set(databaseCatalog()?.managedSlugs ?? []);
    return [
      ...starter.filter(product => !managedIds.has(product.id)),
      ...managed,
    ];
  });

  onMount(() => setClientReady(true));

  return {
    products,
    loading: databaseCatalog.loading,
  };
}
