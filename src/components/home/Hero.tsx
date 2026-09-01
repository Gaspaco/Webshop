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
  theme: string;
};

const SLIDES: Slide[] = [
  {
    id: "umbreon-vmax-alt-art",
    set: "Evolving Skies",
    game: "Pokémon",
    tag: "Alt-art single",
    title: "Umbreon VMAX has landed",
    blurb: "A collector favourite, photographed honestly and ready to ship from our Dutch stock.",
    priceCents: 18995,
    href: "/categories/pokemon",
    image: "/images/cards/umbreon.png",
    alt: "Umbreon VMAX alternate-art card",
    theme: "#6d4bc3",
  },
  {
    id: "charizard-base-set",
    set: "Base Set",
    game: "Pokémon",
    tag: "Vintage icon",
    title: "The original Charizard",
    blurb: "The Base Set holo collectors never stopped chasing, with the condition stated clearly before you buy.",
    priceCents: 24995,
    href: "/categories/pokemon",
    image: "/images/cards/charizard.png",
    alt: "Base Set Charizard holographic card",
    theme: "#d35a23",
  },
  {
    id: "rayquaza-vmax",
    set: "Silver Tempest",
    game: "Pokémon",
    tag: "Back in stock",
    title: "Rayquaza VMAX returns",
    blurb: "A vivid modern chase card, packed carefully and dispatched with PostNL tracking.",
    priceCents: 15995,
    href: "/categories/pokemon",
    image: "/images/cards/rayquaza.png",
    alt: "Rayquaza VMAX card",
    theme: "#0f9f75",
  },
];

export default function Hero(props: {
  managedTitle?: string;
  managedCopy?: string;
}) {
  const cart = useCart();
  const [active, setActive] = createSignal(0);
  const [paused, setPaused] = createSignal(false);
  const [justAdded, setJustAdded] = createSignal(false);

  const selectSlide = (index: number) => {
    setActive(index);
    setJustAdded(false);
  };

  onMount(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      if (!paused()) selectSlide((active() + 1) % SLIDES.length);
    }, 6800);
    onCleanup(() => window.clearInterval(id));
  });

  const addActiveToCart = () => {
    const slide = SLIDES[active()];
    cart.addItem({
      id: slide.id,
      name: slide.title,
      image: slide.image,
      priceCents: slide.priceCents,
    });
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 1500);
  };

  return (
    <section
      class={styles.hero}
      style={{ "--hero-accent": SLIDES[active()].theme }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div class={styles.atmosphere} aria-hidden="true" />
      <div class={styles.shell}>
        <div class={styles.topline}>
          <span>Rotterdam card supply</span>
          <span class={styles.toplineRule} />
          <span>Drop {String(active() + 1).padStart(2, "0")} / {String(SLIDES.length).padStart(2, "0")}</span>
        </div>

        <div class={styles.composition}>
          <div class={styles.copy}>
            <span class={styles.kicker}>{SLIDES[active()].tag}</span>
            <h1>{props.managedTitle || SLIDES[active()].title}</h1>
            <p>{props.managedCopy || SLIDES[active()].blurb}</p>

            <div class={styles.actions}>
              <A href={SLIDES[active()].href} class={styles.primaryAction}>
                Shop {SLIDES[active()].set}
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </A>
              <A href="/products" class={styles.secondaryAction}>Browse all cards</A>
            </div>

            <dl class={styles.facts}>
              <div><dt>Condition</dt><dd>Checked by hand</dd></div>
              <div><dt>Dispatch</dt><dd>From the Netherlands</dd></div>
            </dl>
          </div>

          <div class={styles.cardStage} aria-live="polite">
            <div class={styles.orbit} aria-hidden="true"><span /></div>
            <For each={SLIDES}>
              {(slide, index) => (
                <img
                  class={styles.cardArt}
                  classList={{ [styles.cardArtActive]: index() === active() }}
                  src={slide.image}
                  alt={index() === active() ? slide.alt : ""}
                  aria-hidden={index() === active() ? "false" : "true"}
                  draggable={false}
                />
              )}
            </For>

            <div class={styles.priceTicket}>
              <span>Available now</span>
              <strong>{formatPrice(SLIDES[active()].priceCents)}</strong>
              <button
                type="button"
                onClick={addActiveToCart}
                classList={{ [styles.added]: justAdded() }}
              >
                <Show when={!justAdded()} fallback="Added to cart">
                  Add featured card
                </Show>
              </button>
            </div>
          </div>

          <nav class={styles.dropNav} aria-label="Featured card drops">
            <For each={SLIDES}>
              {(slide, index) => (
                <button
                  type="button"
                  class={styles.dropButton}
                  classList={{ [styles.dropButtonActive]: index() === active() }}
                  onClick={() => selectSlide(index())}
                  aria-current={index() === active() ? "true" : undefined}
                >
                  <span class={styles.dropNumber}>{String(index() + 1).padStart(2, "0")}</span>
                  <span class={styles.dropText}>
                    <strong>{slide.title}</strong>
                    <small>{slide.game} · {slide.set}</small>
                  </span>
                  <span class={styles.dropArrow} aria-hidden="true">↗</span>
                </button>
              )}
            </For>
          </nav>
        </div>

        <div class={styles.serviceBar}>
          <span><i aria-hidden="true" /> Real stock, no supplier listings</span>
          <span><i aria-hidden="true" /> PostNL delivery with tracking</span>
          <span><i aria-hidden="true" /> Free shipping from €300</span>
        </div>
      </div>
    </section>
  );
}
