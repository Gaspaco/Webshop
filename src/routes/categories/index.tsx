import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import { createSignal, For } from "solid-js";
import { formatPrice, useCart } from "~/lib/cart";
import ProductCard, { type SectionProduct } from "~/components/product/ProductCard";
import { CATEGORY_LIST } from "~/lib/categories";
import styles from "./index.module.scss";

function priceOf(product: SectionProduct) {
  return product.priceRangeCents ? product.priceRangeCents[0] : product.priceCents ?? 0;
}

function fromPrice(products: SectionProduct[]) {
  return Math.min(...products.map(priceOf));
}

const totalProducts = CATEGORY_LIST.reduce((sum, c) => sum + c.products.length, 0);

export default function Categories() {
  const cart = useCart();
  const [justAdded, setJustAdded] = createSignal<Set<string>>(new Set());

  const addToCart = (product: SectionProduct) => {
    if (product.priceRangeCents || product.priceCents === undefined) return;
    cart.addItem({
      id: product.id,
      name: product.set ? `${product.name} · ${product.set}` : product.name,
      image: product.image ?? "/images/logo-mark.png",
      priceCents: product.priceCents,
    });
    setJustAdded(prev => new Set(prev).add(product.id));
    setTimeout(() => {
      setJustAdded(prev => {
        const next = new Set(prev);
        next.delete(product.id);
        return next;
      });
    }, 1400);
  };

  return (
    <main class={styles.page}>
      <Title>Categories | TCGHaven</Title>

      <div class={styles.wide}>
        <header class={styles.hero}>
          <div class={styles.heroText}>
            <h1 class={styles.heading}>Browse by game</h1>
            <p class={styles.sub}>
              Every game we stock, in one place, with a taste of what's on each
              shelf. Condition-checked and ready to ship from the Netherlands.
            </p>
          </div>

          <dl class={styles.stats}>
            <div class={styles.stat}>
              <dd class={styles.statValue}>{CATEGORY_LIST.length}</dd>
              <dt class={styles.statLabel}>Games</dt>
            </div>
            <div class={styles.stat}>
              <dd class={styles.statValue}>{totalProducts}</dd>
              <dt class={styles.statLabel}>In stock</dt>
            </div>
            <div class={styles.stat}>
              <dd class={styles.statValue}>Free</dd>
              <dt class={styles.statLabel}>EU shipping over €50</dt>
            </div>
          </dl>
        </header>

        <nav class={styles.quicknav} aria-label="Jump to game">
          <For each={CATEGORY_LIST}>
            {game => (
              <a href={`#${game.slug}`} class={`${styles.quicklink} ${styles[game.theme]}`}>
                {game.name}
              </a>
            )}
          </For>
        </nav>

        <For each={CATEGORY_LIST}>
          {game => (
            <section id={game.slug} class={styles.gameSection}>
              <header class={`${styles.sectionHead} ${styles[game.theme]}`}>
                <div class={styles.sectionHeadText}>
                  <h2 class={styles.gameName}>{game.name}</h2>
                  <p class={styles.gameTagline}>{game.tagline}</p>
                </div>

                <div class={styles.sectionHeadMeta}>
                  <span class={styles.meta}>
                    <strong>{game.products.length}</strong> products
                    <span class={styles.metaSep} aria-hidden="true">·</span>
                    from <strong class={styles.price}>{formatPrice(fromPrice(game.products))}</strong>
                  </span>
                  <A href={`/categories/${game.slug}`} class={styles.viewAll}>
                    View all
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </A>
                </div>
              </header>

              <div class={styles.productGrid}>
                <For each={game.products.slice(0, 4)}>
                  {product => (
                    <ProductCard
                      product={product}
                      isJustAdded={() => justAdded().has(product.id)}
                      onAdd={addToCart}
                      fill
                    />
                  )}
                </For>
              </div>
            </section>
          )}
        </For>
      </div>
    </main>
  );
}
