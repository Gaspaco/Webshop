import { A } from "@solidjs/router";
import { createSignal, For, Show } from "solid-js";
import { formatPrice, useCart } from "~/lib/cart";
import styles from "./ProductSection.module.scss";

export type BoxTheme = "pokemon" | "yugioh" | "magic";

export type SectionProduct = {
  id: string;
  name: string;
  set?: string;
  image?: string;
  theme?: BoxTheme;
  priceCents?: number;
  priceRangeCents?: [number, number];
  rating?: number;
  href: string;
  badge?: string;
};

type ProductSectionProps = {
  heading: string;
  sub?: string;
  products: SectionProduct[];
  viewAllHref?: string;
};

function Stars(props: { rating: number }) {
  return (
    <span class={styles.stars} aria-label={`${props.rating} out of 5 stars`}>
      <For each={[1, 2, 3, 4, 5]}>
        {n => (
          <svg viewBox="0 0 24 24" classList={{ [styles.starOn]: n <= props.rating }} aria-hidden="true">
            <path d="m12 2 2.9 6.3 6.9.7-5.1 4.6 1.4 6.7L12 17.8 5.9 20.6l1.4-6.7L2.2 9.3l6.9-.7L12 2Z" />
          </svg>
        )}
      </For>
    </span>
  );
}

function BoxArt(props: { theme: BoxTheme; label: string }) {
  return (
    <div class={`${styles.boxArt} ${styles[props.theme]}`}>
      <svg class={styles.boxIcon} viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <rect x="5" y="15" width="38" height="27" rx="3" stroke="currentColor" stroke-opacity="0.8" stroke-width="1.6" />
        <path d="M5 22h38" stroke="currentColor" stroke-opacity="0.5" stroke-width="1.6" />
        <path d="M24 15v27" stroke="currentColor" stroke-opacity="0.35" stroke-width="1.4" />
        <path d="M13 15 18 6h12l5 9" stroke="currentColor" stroke-opacity="0.8" stroke-width="1.6" stroke-linejoin="round" />
      </svg>
      <span class={styles.boxLabel}>{props.label}</span>
    </div>
  );
}

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
      <div class="container">
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
              <article class={styles.card}>
                <A href={product.href} class={styles.cardMedia}>
                  <Show
                    when={product.image}
                    fallback={<BoxArt theme={product.theme ?? "pokemon"} label={product.set ?? product.name} />}
                  >
                    <img src={product.image} alt={product.set ? `${product.name}, ${product.set}` : product.name} draggable={false} loading="lazy" />
                  </Show>
                  <Show when={product.badge}>
                    <span class={styles.badge}>{product.badge}</span>
                  </Show>
                </A>

                <div class={styles.cardBody}>
                  <A href={product.href} class={styles.cardInfo}>
                    <span class={styles.cardName}>{product.name}</span>
                    <Show when={product.set}>
                      <span class={styles.cardSet}>{product.set}</span>
                    </Show>
                    <Show when={product.rating}>
                      <Stars rating={product.rating!} />
                    </Show>
                  </A>

                  <div class={styles.cardFooter}>
                    <span class={styles.cardPrice}>
                      <Show
                        when={!product.priceRangeCents}
                        fallback={
                          <>
                            {formatPrice(product.priceRangeCents![0])} – {formatPrice(product.priceRangeCents![1])}
                          </>
                        }
                      >
                        {formatPrice(product.priceCents ?? 0)}
                      </Show>
                    </span>

                    <Show
                      when={!product.priceRangeCents}
                      fallback={
                        <A href={product.href} class={styles.addBtn} aria-label={`View ${product.name} options`}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M5 12h14M13 6l6 6-6 6" />
                          </svg>
                        </A>
                      }
                    >
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
                    </Show>
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
