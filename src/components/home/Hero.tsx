import { A } from "@solidjs/router";
import { gsap } from "gsap";
import { createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show } from "solid-js";
import { formatPrice, useCart } from "~/lib/cart";
import type { ShopProduct } from "~/lib/categories";
import { isActivePreorder } from "~/lib/game-storefront";
import { flyToCart, prefersReducedMotion } from "~/lib/motion";
import styles from "./Hero.module.scss";

type Slide = {
  id: string;
  set: string;
  game: string;
  tag: string;
  title: string;
  blurb: string;
  priceCents?: number;
  href: string;
  image?: string;
  fallbackImage?: string;
  alt: string;
  theme: string; // accent used for the slide wash
  variantId?: string;
  purchasable: boolean;
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

const HERO_GAME_ORDER = ["yugioh", "pokemon", "pokemon", "magic", "magic"] as const;

const HERO_FALLBACKS: Record<"yugioh" | "pokemon" | "magic", Array<{
  set: string;
  title: string;
  blurb: string;
}>> = {
  yugioh: [{
    set: "Yu-Gi-Oh! sealed",
    title: "Fresh duels start sealed",
    blurb: "Browse booster displays, structure decks, and the latest Yu-Gi-Oh! releases.",
  }],
  pokemon: [
    {
      set: "Pokémon sealed",
      title: "Open your next Pokémon set",
      blurb: "Booster boxes, collection products, and sealed releases for collectors and players.",
    },
    {
      set: "Pokémon releases",
      title: "Keep the chase unopened",
      blurb: "Discover current Pokémon stock and upcoming sealed products in one place.",
    },
  ],
  magic: [
    {
      set: "Magic sealed",
      title: "Build from a fresh box",
      blurb: "Play boosters, collector displays, and Commander releases from Magic: The Gathering.",
    },
    {
      set: "Magic releases",
      title: "Your next table starts here",
      blurb: "Shop sealed Magic releases for drafting, collecting, and Commander night.",
    },
  ],
};

type Product = {
  id: string;
  name: string;
  set?: string;
  cartName: string;
  image: string;
  fallbackImage: string;
  priceCents: number;
  href: string;
  variantId?: string;
};

function useFallbackImage(event: Event) {
  const image = event.currentTarget as HTMLImageElement;
  const fallback = image.dataset.fallback;
  if (!fallback || image.src === fallback) return;
  image.dataset.fallback = "/images/logo-mark.png";
  image.src = fallback;
}

export default function Hero(props: {
  managedTitle?: string;
  managedCopy?: string;
  products?: ShopProduct[];
  loading?: boolean;
}) {
  const cart = useCart();
  const [active, setActive] = createSignal(0);
  const [paused, setPaused] = createSignal(false);
  const [autoplay, setAutoplay] = createSignal(false);
  const [justAdded, setJustAdded] = createSignal<Set<string>>(new Set());
  const [now, setNow] = createSignal(Date.now());

  const slides = createMemo<Slide[]>(() => {
    const pools = new Map(
      (["yugioh", "pokemon", "magic"] as const).map(game => [
        game,
        (props.products ?? []).filter(
          product =>
            product.game === game &&
            product.productType === "sealed" &&
            (product.stock ?? 0) > 0,
        ),
      ]),
    );
    const fallbackIndexes = new Map<string, number>();

    return HERO_GAME_ORDER.map((game, slideIndex): Slide => {
      const product = pools.get(game)?.shift();
      if (product) {
        const mainVariant =
          product.variants?.find(variant => variant.isDefault && variant.stock > 0) ??
          product.variants?.find(variant => variant.stock > 0) ??
          product.variants?.find(variant => variant.isDefault) ??
          product.variants?.[0];
        const image = mainVariant?.image || product.image;
        const fallbackImage =
          mainVariant?.image && product.image && mainVariant.image !== product.image
            ? product.image
            : "/images/logo-mark.png";
        return {
          id: product.id,
          set: product.set ?? product.gameName,
          game: product.gameName,
          tag: isActivePreorder(product, now())
            ? "Pre-order"
            : product.badge ?? (product.productType === "sealed" ? "Sealed" : "Single card"),
          title: product.name,
          blurb: product.description ?? `Available now from our ${product.gameName} catalogue.`,
          priceCents: mainVariant?.priceCents ?? product.priceCents ?? 0,
          href: product.href,
          image,
          fallbackImage,
          alt: product.name,
          theme: GAME_ACCENTS[product.game] ?? "#216b4d",
          variantId: mainVariant?.id,
          purchasable: Boolean(mainVariant && mainVariant.stock > 0),
        };
      }

      const fallbackIndex = fallbackIndexes.get(game) ?? 0;
      fallbackIndexes.set(game, fallbackIndex + 1);
      const fallback = HERO_FALLBACKS[game][fallbackIndex % HERO_FALLBACKS[game].length]!;
      const gameName = game === "yugioh"
        ? "Yu-Gi-Oh!"
        : game === "pokemon"
          ? "Pokémon"
          : "Magic: The Gathering";
      return {
        id: `sealed-placeholder-${game}-${slideIndex}`,
        set: fallback.set,
        game: gameName,
        tag: "Sealed",
        title: fallback.title,
        blurb: fallback.blurb,
        href: `/categories/${game}/products?type=sealed`,
        alt: "",
        theme: GAME_ACCENTS[game],
        purchasable: false,
      };
    });
  });

  const bestsellers = createMemo<Product[]>(() => {
    const live = (props.products ?? [])
      .filter(product => (product.stock ?? 0) > 0)
      .map((product): Product | undefined => {
        const mainVariant =
          product.variants?.find(variant => variant.isDefault && variant.stock > 0) ??
          product.variants?.find(variant => variant.id === product.variantId && variant.stock > 0) ??
          product.variants?.find(variant => variant.stock > 0) ??
          product.variants?.find(variant => variant.isDefault) ??
          product.variants?.[0];
        const image = mainVariant?.image || product.image;
        if (!image) return undefined;
        const hasOwnSet = Boolean(
          product.set && product.set.trim().toLowerCase() !== product.name.trim().toLowerCase(),
        );
        const fallbackImage =
          mainVariant?.image && product.image && mainVariant.image !== product.image
            ? product.image
            : "/images/logo-mark.png";
        return {
          id: product.id,
          name: product.name,
          set: hasOwnSet ? product.set : product.gameName,
          cartName: hasOwnSet ? `${product.name} · ${product.set}` : product.name,
          image,
          fallbackImage,
          priceCents: mainVariant?.priceCents ?? product.priceCents ?? 0,
          href: product.href,
          variantId: mainVariant?.id,
        };
      })
      .filter((product): product is Product => Boolean(product))
      .slice(0, 5);
    return live;
  });

  onMount(() => {
    const clockId = window.setInterval(() => setNow(Date.now()), 60_000);
    onCleanup(() => window.clearInterval(clockId));
    // The progress bar's animation is the timer, so the bar and the slide
    // change can never drift apart. Reduced motion: no autoplay at all.
    setAutoplay(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  });

  const advance = () => {
    const count = slides().length;
    if (count > 1) setActive(i => (i + 1) % count);
  };

  let stageRef: HTMLDivElement | undefined;

  // Each slide change is one GSAP timeline: copy rises in sequence while the
  // product is set down on the stage.
  createEffect(on(active, index => {
    if (!stageRef || prefersReducedMotion()) return;
    const slide = stageRef.querySelectorAll<HTMLElement>(`.${styles.slide}`)[index];
    if (!slide) return;
    const timeline = gsap.timeline();
    timeline
      .from(slide.querySelectorAll(`.${styles.copy} > *`), {
        autoAlpha: 0,
        y: 18,
        duration: 0.75,
        stagger: 0.07,
        ease: "expo.out",
      })
      .from(slide.querySelectorAll(`.${styles.artImage}, .${styles.sealedPlaceholder}`), {
        autoAlpha: 0,
        y: 36,
        scale: 0.9,
        rotation: -4,
        duration: 1.1,
        ease: "expo.out",
      }, 0.05)
      .from(slide.querySelectorAll(`.${styles.floor}`), {
        autoAlpha: 0,
        scaleX: 0.5,
        duration: 1,
        ease: "expo.out",
      }, 0.1);
    onCleanup(() => {
      timeline.kill();
      gsap.set(slide.querySelectorAll("*"), { clearProps: "opacity,visibility,transform" });
    });
  }));

  // A spotlight that follows the pointer across the stage. Mouse and pen
  // only, and at most one style write per frame.
  let pointerFrame = 0;
  const trackPointer = (event: PointerEvent & { currentTarget: HTMLDivElement }) => {
    if (event.pointerType === "touch" || pointerFrame) return;
    const stage = event.currentTarget;
    const { clientX, clientY } = event;
    pointerFrame = requestAnimationFrame(() => {
      pointerFrame = 0;
      const bounds = stage.getBoundingClientRect();
      stage.style.setProperty("--mx", ((clientX - bounds.left) / bounds.width).toFixed(3));
      stage.style.setProperty("--my", ((clientY - bounds.top) / bounds.height).toFixed(3));
    });
  };

  const resetPointer = (event: PointerEvent & { currentTarget: HTMLDivElement }) => {
    cancelAnimationFrame(pointerFrame);
    pointerFrame = 0;
    event.currentTarget.style.removeProperty("--mx");
    event.currentTarget.style.removeProperty("--my");
    setPaused(false);
  };

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
    if (!slide.purchasable || slide.priceCents === undefined) return;
    cart.addItem({
      id: slide.id,
      variantId: slide.variantId,
      name: slide.title,
      image: slide.image ?? "/images/logo-mark.png",
      priceCents: slide.priceCents,
    });
    flashAdded(slide.id);
  };

  const addProductToCart = (product: Product) => {
    cart.addItem({
      id: product.id,
      variantId: product.variantId,
      name: product.cartName,
      image: product.image,
      priceCents: product.priceCents,
    });
    flashAdded(product.id);
  };


  const CartIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
      <path d="M2 3h2.2l2.3 11.4a2 2 0 0 0 2 1.6h8.4a2 2 0 0 0 2-1.6L21 7H6" />
    </svg>
  );

  const CheckIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );

  const PlusIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );

  return (
    <section class={styles.showcase}>
      <div class={styles.grid}>
        <div
          ref={stageRef}
          class={styles.stage}
          data-motion-card="5"
          onPointerEnter={() => setPaused(true)}
          onPointerMove={trackPointer}
          onPointerLeave={resetPointer}
          onFocusIn={() => setPaused(true)}
          onFocusOut={() => setPaused(false)}
        >
          <div class={styles.spotlight} aria-hidden="true" />

          <Show
            when={slides().length}
            fallback={
              <article class={styles.slide} classList={{ [styles.slideActive]: true }} style={{ "--theme": "#216b4d" }}>
                <Show
                  when={props.loading}
                  fallback={
                    <div class={styles.copy}>
                      <h2 class={styles.title}>{props.managedTitle ?? "Browse the current collection"}</h2>
                      <p class={styles.blurb}>{props.managedCopy ?? "There are no published products available right now."}</p>
                      <div class={styles.actions}>
                        <A href="/products" class={styles.primaryCta}>Browse products</A>
                      </div>
                    </div>
                  }
                >
                  <div class={styles.loadingCards} aria-label="Loading current products" role="status">
                    <img src="/images/cards/charizard.png" alt="" />
                    <img src="/images/cards/umbreon.png" alt="" />
                    <img src="/images/cards/rayquaza.png" alt="" />
                  </div>
                </Show>
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
                  inert={i() !== active()}
                >
                  <div class={styles.copy}>
                    <p class={styles.meta}>
                      <span class={styles.game}>{slide.game}</span>
                      <span class={styles.tag} classList={{ [styles.tagPreorder]: slide.tag === "Pre-order" }}>
                        {slide.tag}
                      </span>
                    </p>
                    <h2 class={styles.title}>
                      {i() === 0 && props.managedTitle ? props.managedTitle : slide.title}
                    </h2>
                    <p class={styles.blurb}>
                      {i() === 0 && props.managedCopy ? props.managedCopy : slide.blurb}
                    </p>
                    <div class={styles.actions}>
                      <A href={slide.href} class={styles.primaryCta}>Shop {slide.set}</A>
                      <Show when={slide.purchasable && slide.priceCents !== undefined}>
                        <button
                          type="button"
                          class={styles.addCta}
                          classList={{ [styles.done]: justAdded().has(slide.id) }}
                          onClick={event => {
                            addSlideToCart(slide);
                            flyToCart(event.currentTarget.closest("article")?.querySelector("img"));
                          }}
                          aria-label={`Add ${slide.title} to cart, ${formatPrice(slide.priceCents!)}`}
                        >
                          <Show when={justAdded().has(slide.id)} fallback={<CartIcon />}>
                            <CheckIcon />
                          </Show>
                          <span>{justAdded().has(slide.id) ? "Added" : formatPrice(slide.priceCents!)}</span>
                        </button>
                      </Show>
                    </div>
                  </div>

                  <div class={styles.art} data-motion-art>
                    <Show
                      when={slide.image}
                      fallback={
                        <div class={styles.sealedPlaceholder} aria-hidden="true">
                          <img src="/images/logo-mark.png" alt="" />
                          <span>{slide.game}</span>
                        </div>
                      }
                    >
                      {image => (
                        <img
                          class={styles.artImage}
                          src={image()}
                          data-fallback={slide.fallbackImage}
                          alt={slide.alt}
                          draggable={false}
                          loading="eager"
                          decoding="async"
                          onError={useFallbackImage}
                        />
                      )}
                    </Show>
                    <span class={styles.floor} aria-hidden="true" />
                  </div>
                </article>
              )}
            </For>
          </Show>

          <Show when={slides().length > 1}>
            <div class={styles.progress} role="tablist" aria-label="Featured products">
              <For each={slides()}>
                {(slide, i) => (
                  <button
                    type="button"
                    role="tab"
                    class={styles.segment}
                    classList={{
                      [styles.segmentDone]: i() < active(),
                      [styles.segmentActive]: i() === active(),
                    }}
                    aria-selected={i() === active() ? "true" : "false"}
                    aria-label={`Show ${slide.title}`}
                    onClick={() => setActive(i())}
                  >
                    {/* The fill's CSS animation is the autoplay timer, so the
                        bar and the slide change can never drift apart. */}
                    <span
                      class={styles.segmentFill}
                      classList={{ [styles.segmentTimed]: autoplay() && i() === active() }}
                      style={{ "animation-play-state": paused() ? "paused" : "running" }}
                      onAnimationEnd={() => {
                        if (autoplay() && i() === active()) advance();
                      }}
                    />
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>

        <Show
          when={bestsellers().length}
          fallback={
            <Show when={props.loading}>
              <aside class={`${styles.shelf} ${styles.shelfLoading}`} aria-hidden="true">
                <header class={styles.shelfHeader}>
                  <h2>Ready to ship</h2>
                </header>
                <ul class={styles.shelfList}>
                  <For each={[0, 1, 2, 3, 4]}>
                    {() => (
                      <li class={styles.loadingItem}>
                        <span class={styles.loadingThumb} />
                        <span class={styles.loadingCopy}>
                          <i />
                          <i />
                        </span>
                      </li>
                    )}
                  </For>
                </ul>
              </aside>
            </Show>
          }
        >
          <aside class={styles.shelf} aria-labelledby="ready-to-ship-title">
            <header class={styles.shelfHeader}>
              <h2 id="ready-to-ship-title">Ready to ship</h2>
              <A href="/products" class={styles.viewAll}>View all</A>
            </header>

            <ul class={styles.shelfList}>
              <For each={bestsellers()}>
                {product => (
                  <li class={styles.shelfItem} data-motion-card="10">
                    <A href={product.href} class={styles.shelfLink}>
                      <span class={styles.thumb}>
                        <img
                          data-motion-art
                          src={product.image}
                          data-fallback={product.fallbackImage}
                          alt=""
                          draggable={false}
                          loading="eager"
                          decoding="async"
                          onError={useFallbackImage}
                        />
                      </span>
                      <span class={styles.itemInfo}>
                        <span class={styles.itemName}>{product.name}</span>
                        <Show when={product.set}>
                          <span class={styles.itemSet}>{product.set}</span>
                        </Show>
                        <span class={styles.itemPrice}>{formatPrice(product.priceCents)}</span>
                      </span>
                    </A>
                    <button
                      type="button"
                      class={styles.addBtn}
                      classList={{ [styles.done]: justAdded().has(product.id) }}
                      onClick={event => {
                        addProductToCart(product);
                        flyToCart(event.currentTarget.closest("li")?.querySelector("img"));
                      }}
                      aria-label={`Add ${product.name} to cart`}
                    >
                      <Show when={justAdded().has(product.id)} fallback={<PlusIcon />}>
                        <CheckIcon />
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
