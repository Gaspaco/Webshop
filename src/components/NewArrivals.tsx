import { A } from "@solidjs/router";
import { createSignal, For, Show } from "solid-js";
import { formatPrice, useCart } from "~/lib/cart";
import styles from "./NewArrivals.module.scss";

type Product = {
  id: string;
  name: string;
  set: string;
  image: string;
  priceCents: number;
  href: string;
  badge?: string;
};

const PRODUCTS: Product[] = [
  { id: "palkia-v-astral", name: "Palkia V", set: "Astral Radiance", image: "/images/cards/palkia.png", priceCents: 3495, href: "/products", badge: "New" },
  { id: "venusaur-base", name: "Venusaur", set: "Base Set", image: "/images/cards/venusaur.png", priceCents: 6995, href: "/products" },
  { id: "rayquaza-vmax-st", name: "Rayquaza VMAX", set: "Silver Tempest", image: "/images/cards/rayquaza.png", priceCents: 15995, href: "/products", badge: "New" },
  { id: "blastoise-base", name: "Blastoise", set: "Base Set", image: "/images/cards/blastoise.png", priceCents: 11995, href: "/products" },
  { id: "mewtwo-base", name: "Mewtwo", set: "Base Set", image: "/images/cards/mewtwo.png", priceCents: 8995, href: "/products" },
  { id: "charizard-base", name: "Charizard", set: "Base Set", image: "/images/cards/charizard.png", priceCents: 24995, href: "/products", badge: "Vintage" },
];

export default function NewArrivals() {
  const cart = useCart();
  const [justAdded, setJustAdded] = createSignal<Set<string>>(new Set());

  const addToCart = (product: Product) => {
    cart.addItem({
      id: product.id,
      name: `${product.name} · ${product.set}`,
      image: product.image,
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
    <section class={styles.section}>
      <div class="container">
        <header class={styles.header}>
          <div>
            <h2 class={styles.heading}>New arrivals</h2>
            <p class={styles.sub}>Fresh stock, added this week.</p>
          </div>
          <A href="/products" class={styles.viewAll}>
            View all
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </A>
        </header>

        <div class={styles.grid}>
          <For each={PRODUCTS}>
            {product => (
              <article class={styles.card}>
                <A href={product.href} class={styles.cardMedia}>
                  <img src={product.image} alt={`${product.name}, ${product.set}`} draggable={false} loading="lazy" />
                  <Show when={product.badge}>
                    <span class={styles.badge}>{product.badge}</span>
                  </Show>
                </A>

                <div class={styles.cardBody}>
                  <A href={product.href} class={styles.cardInfo}>
                    <span class={styles.cardName}>{product.name}</span>
                    <span class={styles.cardSet}>{product.set}</span>
                  </A>

                  <div class={styles.cardFooter}>
                    <span class={styles.cardPrice}>{formatPrice(product.priceCents)}</span>
                    <button
                      type="button"
                      class={styles.addBtn}
                      classList={{ [styles.addBtnDone]: justAdded().has(product.id) }}
                      onClick={() => addToCart(product)}
                      aria-label={`Add ${product.name} to cart`}
                    >
                      <Show
                        when={!justAdded().has(product.id)}
                        fallback={
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        }
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                      </Show>
                    </button>
                  </div>
                </div>
              </article>
            )}
          </For>
        </div>
      </div>
    </section>
  );
}
