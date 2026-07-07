import { A } from "@solidjs/router";
import { createSignal, For, Show } from "solid-js";
import { useCart } from "~/lib/cart";
import ProductCard, { type SectionProduct } from "./ProductCard";
import styles from "./ProductSection.module.scss";

export type { BoxTheme, SectionProduct } from "./ProductCard";

type ProductSectionProps = {
  heading: string;
  sub?: string;
  products: SectionProduct[];
  viewAllHref?: string;
};

export default function ProductSection(props: ProductSectionProps) {
  const cart = useCart();
  const [justAdded, setJustAdded] = createSignal<Set<string>>(new Set());
  let trackRef: HTMLDivElement | undefined;

  const scrollTrack = (dir: 1 | -1) => {
    if (!trackRef) return;
    const amount = Math.min(trackRef.clientWidth * 0.8, 640);
    trackRef.scrollBy({ left: dir * amount, behavior: "smooth" });
  };

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
    <section class={styles.section}>
      <div class={styles.wide}>
        <header class={styles.header}>
          <div>
            <h2 class={styles.heading}>{props.heading}</h2>
            <Show when={props.sub}>
              <p class={styles.sub}>{props.sub}</p>
            </Show>
          </div>

          <div class={styles.headerActions}>
            <A href={props.viewAllHref ?? "/products"} class={styles.viewAll}>
              Discover all
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </A>
            <div class={styles.navBtns}>
              <button type="button" class={styles.navBtn} aria-label="Scroll left" onClick={() => scrollTrack(-1)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M15 6l-6 6 6 6" />
                </svg>
              </button>
              <button type="button" class={styles.navBtn} aria-label="Scroll right" onClick={() => scrollTrack(1)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            </div>
          </div>
        </header>

        <div class={styles.track} ref={trackRef}>
          <For each={props.products}>
            {product => (
              <ProductCard
                product={product}
                isJustAdded={() => justAdded().has(product.id)}
                onAdd={addToCart}
              />
            )}
          </For>
        </div>
      </div>
    </section>
  );
}
