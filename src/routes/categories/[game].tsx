import { Title } from "@solidjs/meta";
import { A, useParams } from "@solidjs/router";
import {
  createMemo,
  createResource,
  createSignal,
  onMount,
  Show,
} from "solid-js";
import ProductGrid from "~/components/product/ProductGrid";
import { CATEGORIES } from "~/lib/categories";
import { fetchDatabaseCatalogState } from "~/lib/catalog";
import styles from "./[game].module.scss";

export default function CategoryPage() {
  const params = useParams();
  const category = () => CATEGORIES[params.game ?? ""];
  const [clientReady, setClientReady] = createSignal(false);
  const [databaseCatalog] = createResource(
    clientReady,
    () => fetchDatabaseCatalogState(),
  );
  const products = createMemo(() => {
    const starter = category()?.products ?? [];
    const managed = (databaseCatalog()?.products ?? []).filter(
      product => product.game === params.game,
    );
    const managedIds = new Set(databaseCatalog()?.managedSlugs ?? []);
    return [
      ...starter.filter(product => !managedIds.has(product.id)),
      ...managed,
    ];
  });

  onMount(() => setClientReady(true));

  return (
    <Show
      when={category()}
      fallback={
        <main class={styles.page}>
          <div class={styles.wide}>
            <p class={styles.sub}>We couldn't find that category.</p>
            <A href="/categories" class={styles.backLink}>Back to categories</A>
          </div>
        </main>
      }
    >
      {cat => (
        <main class={styles.page}>
          <Title>{cat().name} | TCGHaven</Title>

          <div class={`${styles.banner} ${styles[cat().theme]}`}>
            <div class={styles.wide}>
              <nav class={styles.breadcrumb} aria-label="Breadcrumb">
                <A href="/categories">Categories</A>
                <span>/</span>
                <span>{cat().name}</span>
              </nav>
              <h1 class={styles.heading}>{cat().name}</h1>
              <p class={styles.sub}>{cat().tagline}</p>
            </div>
          </div>

          <div class={styles.wide}>
            <ProductGrid products={products()} />
          </div>
        </main>
      )}
    </Show>
  );
}
