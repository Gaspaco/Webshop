import { A } from "@solidjs/router";
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { formatPrice, useCart } from "~/lib/cart";
import type { ShopProduct } from "~/lib/categories";
import styles from "./Hero.module.scss";

type Slide = {
  id: string;
  set: string;
  game: string;
  tag: string;
  title: string;
  blurb: string;
  priceCents: number;
  href: string;
  image: string;
  alt: string;
  theme: string; // accent used for the slide wash
  variantId?: string;
};

const GAME_ACCENTS: Record<string, string> = {
  pokemon: "#216b4d",
  yugioh: "#72522b",
  magic: "#7a3828",
  lorcana: "#6d4ba3",
  riftbound: "#287a8c",
  digimon: "#315fa8",
  cyberpunk: "#9b7a13",
};

type Product = {
  id: string;
  name: string;
  game: string;
  image: string;
  rating: number;
  priceCents: number;
  href: string;
  variantId?: string;
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

export default function Hero(props: {
  managedTitle?: string;
  managedCopy?: string;
  products?: ShopProduct[];
}) {
  const cart = useCart();
  const [active, setActive] = createSignal(0);
  const [paused, setPaused] = createSignal(false);
  const [justAdded, setJustAdded] = createSignal<Set<string>>(new Set());

  const slides = createMemo<Slide[]>(() =>
    (props.products ?? [])
      .filter(product => product.image && (product.stock ?? 0) > 0)
      .slice(0, 3)
      .map(product => {
        const mainVariant =
          product.variants?.find(variant => variant.isDefault) ??
          product.variants?.find(variant => variant.stock > 0) ??
          product.variants?.[0];
        return {
          id: product.id,
          set: product.set ?? product.gameName,
          game: product.gameName,
          tag: product.badge ?? (product.productType === "sealed" ? "Sealed" : "Single card"),
          title: product.name,
          blurb: product.description ?? `Available now from our ${product.gameName} catalogue.`,
          priceCents: mainVariant?.priceCents ?? product.priceCents ?? 0,
          href: product.href,
          image: mainVariant?.image ?? product.image!,
          alt: product.name,
          theme: GAME_ACCENTS[product.game] ?? "#216b4d",
          variantId: mainVariant?.id,
        };
      }),
  );

  const bestsellers = createMemo<Product[]>(() => {
    const live = (props.products ?? [])
      .filter(product => product.image && (product.stock ?? 0) > 0)
      .slice(0, 5)
      .map(product => {
        const mainVariant =
          product.variants?.find(variant => variant.isDefault) ??
          product.variants?.find(variant => variant.id === product.variantId) ??
          product.variants?.[0];
        return {
          id: product.id,
          name: product.set ? `${product.name} · ${product.set}` : product.name,
          game: product.gameName,
          image: mainVariant?.image ?? product.image!,
          rating: product.rating ?? 5,
          priceCents: mainVariant?.priceCents ?? product.priceCents ?? 0,
          href: product.href,
          variantId: mainVariant?.id,
        };
      });
    return live;
  });

  onMount(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      const count = slides().length;
      if (!paused() && count > 1) setActive(i => (i + 1) % count);
    }, 6000);
    onCleanup(() => clearInterval(id));
  });

  const flashAdded = (id: string) => {
    setJustAdded(prev => new Set(prev).add(id));
    setTimeout(() => {
      setJustAdded(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 1400);
  };

  const addSlideToCart = (slide: Slide) => {
    cart.addItem({
      id: slide.id,
      variantId: slide.variantId,
      name: slide.title,
      image: slide.image,
      priceCents: slide.priceCents,
    });
    flashAdded(slide.id);
  };

  const addProductToCart = (product: Product) => {
    cart.addItem({
      id: product.id,
      variantId: product.variantId,
      name: product.name,
      image: product.image,
      priceCents: product.priceCents,
    });
    flashAdded(product.id);
  };

  return (
    <section class={styles.showcase}>
      <div class={styles.grid}>
        <div
          class={styles.featured}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <Show
            when={slides().length}
            fallback={
              <article
                class={styles.slide}
                classList={{ [styles.slideActive]: true }}
                style={{ "--theme": "#216b4d" }}
              >
                <div class={styles.slideWash} />
                <div class={styles.slideScrim} />
                <div class={styles.slideBody}>
                  <div class={styles.slideTags}><span class={styles.gameTag}>TCGHaven</span></div>
                  <h2 class={styles.slideTitle}>{props.managedTitle ?? "Real stock, ready when you are"}</h2>
                  <p class={styles.slideBlurb}>{props.managedCopy ?? "Published products appear here as soon as they are available."}</p>
                  <div class={styles.slideFooter}>
                    <A href="/products" class={styles.slideCta}>Browse live stock</A>
                  </div>
                </div>
              </article>
            }
          >
          <For each={slides()}>
            {(slide, i) => (
              <article
                class={styles.slide}
                classList={{ [styles.slideActive]: i() === active() }}
                style={{ "--theme": slide.theme }}
                aria-hidden={i() === active() ? "false" : "true"}
              >
                <div class={styles.slideWash} />
                <img class={styles.slideArt} src={slide.image} alt={slide.alt} draggable={false} />
                <div class={styles.slideScrim} />

                <div class={styles.slideBody}>
                  <div class={styles.slideTags}>
                    <span class={styles.gameTag}>{slide.game}</span>
                    <span class={styles.setTag}>{slide.tag}</span>
                  </div>
                  <h2 class={styles.slideTitle}>
                    {i() === 0 && props.managedTitle
                      ? props.managedTitle
                      : slide.title}
                  </h2>
                  <p class={styles.slideBlurb}>
                    {i() === 0 && props.managedCopy
                      ? props.managedCopy
                      : slide.blurb}
                  </p>
                  <div class={styles.slideFooter}>
                    <A href={slide.href} class={styles.slideCta}>
                      Shop {slide.set}
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </A>
                    <button
                      type="button"
                      class={styles.slideAddBtn}
                      classList={{ [styles.addBtnDone]: justAdded().has(slide.id) }}
                      onClick={() => addSlideToCart(slide)}
                      aria-label={`Add ${slide.title} to cart`}
                    >
                      <Show
                        when={!justAdded().has(slide.id)}
                        fallback={
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        }
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <circle cx="9" cy="20" r="1.4" />
                          <circle cx="18" cy="20" r="1.4" />
                          <path d="M2 3h2.2l2.3 11.4a2 2 0 0 0 2 1.6h8.4a2 2 0 0 0 2-1.6L21 7H6" />
                        </svg>
                      </Show>
                    </button>
                    <span class={styles.slidePrice}>From {formatPrice(slide.priceCents)}</span>
                  </div>
                </div>
              </article>
            )}
          </For>
          </Show>

          <Show when={slides().length > 1}>
          <div class={styles.dots} role="tablist" aria-label="Featured sets">
            <For each={slides()}>
              {(slide, i) => (
                <button
                  type="button"
                  role="tab"
                  class={styles.dot}
                  classList={{ [styles.dotActive]: i() === active() }}
                  aria-selected={i() === active() ? "true" : "false"}
                  aria-label={`Show ${slide.set}`}
                  onClick={() => setActive(i())}
                />
              )}
            </For>
          </div>
          </Show>
        </div>

        <Show when={bestsellers().length}>
        <aside class={styles.bestsellers} aria-label="Bestsellers">
          <header class={styles.bestHeader}>
            <h2>Bestsellers</h2>
            <A href="/products" class={styles.viewAll}>View all</A>
          </header>

          <ul class={styles.bestList}>
            <For each={bestsellers()}>
              {product => (
                <li class={styles.bestItem}>
                  <A href={product.href} class={styles.bestLink}>
                    <span class={styles.bestThumb}>
                      <img src={product.image} alt="" draggable={false} loading="lazy" />
                    </span>
                    <span class={styles.bestInfo}>
                      <span class={styles.bestName}>{product.name}</span>
                      <span class={styles.bestRating}>
                        <Stars rating={product.rating} />
                      </span>
                      <span class={styles.bestPrice}>{formatPrice(product.priceCents)}</span>
                    </span>
                  </A>
                  <button
                    type="button"
                    class={styles.addBtn}
                    classList={{ [styles.addBtnDone]: justAdded().has(product.id) }}
                    onClick={() => addProductToCart(product)}
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
                </li>
              )}
            </For>
          </ul>
        </aside>
        </Show>
      </div>
    </section>
  );
}
