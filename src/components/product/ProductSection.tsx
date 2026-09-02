import { A } from "@solidjs/router";
import {
  createEffect,
  createSignal,
  createUniqueId,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { useCart } from "~/lib/cart";
import ProductCard, {
  type ProductVariantOption,
  type SectionProduct,
} from "./ProductCard";
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
  const headingId = `products-${createUniqueId()}`;
  const [justAdded, setJustAdded] = createSignal<Set<string>>(new Set());
  const [canScrollBack, setCanScrollBack] = createSignal(false);
  const [canScrollForward, setCanScrollForward] = createSignal(false);
  let trackRef: HTMLDivElement | undefined;

  const updateTrackState = () => {
    if (!trackRef) return;
    const maxScroll = Math.max(0, trackRef.scrollWidth - trackRef.clientWidth);
    setCanScrollBack(trackRef.scrollLeft > 4);
    setCanScrollForward(trackRef.scrollLeft < maxScroll - 4);
  };

  const scrollTrack = (dir: 1 | -1) => {
    if (!trackRef) return;
    const amount = Math.min(trackRef.clientWidth * 0.8, 640);
    trackRef.scrollBy({ left: dir * amount, behavior: "smooth" });
  };

  onMount(() => {
    updateTrackState();
    const observer = new ResizeObserver(updateTrackState);
    if (trackRef) observer.observe(trackRef);
    window.addEventListener("resize", updateTrackState);
    onCleanup(() => {
      observer.disconnect();
      window.removeEventListener("resize", updateTrackState);
    });
  });

  createEffect(() => {
    props.products.length;
    queueMicrotask(updateTrackState);
  });

  const addToCart = (
    product: SectionProduct,
    variant?: ProductVariantOption,
  ) => {
    const priceCents = variant?.priceCents ?? product.priceCents;
    if (priceCents === undefined) return;
    cart.addItem({
      id: product.id,
      variantId: variant?.id,
      name: `${product.set ? `${product.name} · ${product.set}` : product.name}${variant ? ` (${variant.name})` : ""}`,
      image: variant?.image ?? product.image ?? "/images/logo-mark.png",
      priceCents,
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
    <section class={styles.section} aria-labelledby={headingId}>
      <div class={styles.wide}>
        <header class={styles.header}>
          <div>
            <h2 class={styles.heading} id={headingId}>{props.heading}</h2>
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
            <Show when={canScrollBack() || canScrollForward()}>
              <div class={styles.navBtns}>
                <button
                  type="button"
                  class={styles.navBtn}
                  aria-label={`View previous ${props.heading.toLocaleLowerCase()}`}
                  disabled={!canScrollBack()}
                  onClick={() => scrollTrack(-1)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M15 6l-6 6 6 6" />
                  </svg>
                </button>
                <button
                  type="button"
                  class={styles.navBtn}
                  aria-label={`View more ${props.heading.toLocaleLowerCase()}`}
                  disabled={!canScrollForward()}
                  onClick={() => scrollTrack(1)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </button>
              </div>
            </Show>
          </div>
        </header>

        <div class={styles.track} ref={trackRef} onScroll={updateTrackState}>
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
