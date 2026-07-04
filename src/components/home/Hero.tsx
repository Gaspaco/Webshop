import { A } from "@solidjs/router";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { formatPrice, useCart } from "~/lib/cart";
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
};

const SLIDES: Slide[] = [
  {
    id: "umbreon-vmax-alt-art",
    set: "Evolving Skies",
    game: "Pokémon",
    tag: "Alt-art singles",
    title: "Umbreon VMAX has landed",
    blurb:
      "The moonlit alt-art everyone chases, freshly graded and ready to ship from our Dutch stock.",
    priceCents: 18995,
    href: "/categories/pokemon",
    image: "/images/cards/umbreon.png",
    alt: "Umbreon VMAX alternate-art card under a moonlit rainbow sky",
    theme: "#5b3aa6",
  },
  {
    id: "charizard-base-set",
    set: "Base Set Originals",
    game: "Pokémon",
    tag: "Vintage vault",
    title: "First-edition Charizard",
    blurb:
      "The 1999 holo that started it all. Honest grades, real photos, no surprises at checkout.",
    priceCents: 24995,
    href: "/categories/pokemon",
    image: "/images/cards/charizard.png",
    alt: "First-edition Base Set Charizard holographic card",
    theme: "#c2410c",
  },
  {
    id: "rayquaza-vmax",
    set: "Silver Tempest",
    game: "Pokémon",
    tag: "New arrivals",
    title: "Rayquaza VMAX restock",
    blurb:
      "Back on the shelf in near-mint and PSA-ready condition. Limited copies, weekly drops.",
    priceCents: 15995,
    href: "/categories/pokemon",
    image: "/images/cards/rayquaza.png",
    alt: "Rayquaza VMAX alternate-art card",
    theme: "#047857",
  },
];

type Product = {
  id: string;
  name: string;
  game: string;
  image: string;
  rating: number;
  priceCents: number;
  href: string;
};

const BESTSELLERS: Product[] = [
  { id: "umbreon-vmax-alt-art", name: "Umbreon VMAX Alt Art", game: "Pokémon", image: "/images/cards/umbreon.png", rating: 5, priceCents: 18995, href: "/products" },
  { id: "charizard-base-set", name: "Charizard · Base Set", game: "Pokémon", image: "/images/cards/charizard.png", rating: 5, priceCents: 24995, href: "/products" },
  { id: "pikachu-crown-zenith", name: "Pikachu · Crown Zenith", game: "Pokémon", image: "/images/cards/pikachu.png", rating: 4, priceCents: 2495, href: "/products" },
  { id: "blastoise-base-set", name: "Blastoise · Base Set", game: "Pokémon", image: "/images/cards/blastoise.png", rating: 4, priceCents: 11995, href: "/products" },
  { id: "mewtwo-base-set", name: "Mewtwo · Base Set", game: "Pokémon", image: "/images/cards/mewtwo.png", rating: 5, priceCents: 8995, href: "/products" },
];

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

export default function Hero() {
  const cart = useCart();
  const [active, setActive] = createSignal(0);
  const [paused, setPaused] = createSignal(false);
  const [justAdded, setJustAdded] = createSignal<Set<string>>(new Set());

  onMount(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      if (!paused()) setActive(i => (i + 1) % SLIDES.length);
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
      name: slide.title,
      image: slide.image,
      priceCents: slide.priceCents,
    });
    flashAdded(slide.id);
  };

  const addProductToCart = (product: Product) => {
    cart.addItem({
      id: product.id,
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
          <For each={SLIDES}>
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
                  <h2 class={styles.slideTitle}>{slide.title}</h2>
                  <p class={styles.slideBlurb}>{slide.blurb}</p>
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

          <div class={styles.dots} role="tablist" aria-label="Featured sets">
            <For each={SLIDES}>
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
        </div>

        <aside class={styles.bestsellers} aria-label="Bestsellers">
          <header class={styles.bestHeader}>
            <h2>Bestsellers</h2>
            <A href="/products" class={styles.viewAll}>View all</A>
          </header>

          <ul class={styles.bestList}>
            <For each={BESTSELLERS}>
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
      </div>
    </section>
  );
}
