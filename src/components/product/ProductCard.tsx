import { A } from "@solidjs/router";
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { formatPrice } from "~/lib/cart";
import styles from "./ProductSection.module.scss";

export type BoxTheme =
  | "pokemon"
  | "yugioh"
  | "magic"
  | "lorcana"
  | "riftbound"
  | "digimon"
  | "cyberpunk";

export type ProductVariantOption = {
  id: string;
  name: string;
  sku: string;
  condition?: string;
  language?: string;
  finish?: string;
  image?: string;
  isDefault?: boolean;
  priceCents: number;
  compareAtPriceCents?: number;
  stock: number;
};

export type SectionProduct = {
  id: string;
  name: string;
  set?: string;
  image?: string;
  theme?: BoxTheme;
  priceCents?: number;
  compareAtPriceCents?: number;
  priceRangeCents?: [number, number];
  rating?: number;
  href: string;
  badge?: string;
  variants?: ProductVariantOption[];
  variantId?: string;
};

export function Stars(props: { rating: number }) {
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

export function BoxArt(props: { theme: BoxTheme; label: string }) {
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

type ProductCardProps = {
  product: SectionProduct;
  isJustAdded: () => boolean;
  onAdd: (product: SectionProduct, variant?: ProductVariantOption) => void;
  fill?: boolean;
};

export default function ProductCard(props: ProductCardProps) {
  const p = props.product;
  const [quickViewOpen, setQuickViewOpen] = createSignal(false);
  const [selectedVariantId, setSelectedVariantId] = createSignal("");
  const selectedVariant = createMemo(() =>
    p.variants?.find(variant => variant.id === selectedVariantId()),
  );
  const mainVariant = createMemo(() =>
    p.variants?.find(variant => variant.isDefault) ??
    p.variants?.find(variant => variant.id === p.variantId) ??
    p.variants?.[0],
  );
  const displayVariant = createMemo(() => selectedVariant() ?? mainVariant());
  const displayPrice = createMemo(
    () => displayVariant()?.priceCents ?? p.priceCents ?? p.priceRangeCents?.[0] ?? 0,
  );
  const displayCompareAtPrice = createMemo(
    () => displayVariant()?.compareAtPriceCents ?? p.compareAtPriceCents,
  );
  const hasChoices = () => (p.variants?.length ?? 0) > 1;

  const openQuickView = () => {
    setSelectedVariantId("");
    setQuickViewOpen(true);
  };

  const confirmVariant = () => {
    const variant = selectedVariant();
    if (!variant || variant.stock <= 0) return;
    props.onAdd(p, variant);
    setQuickViewOpen(false);
  };

  createEffect(() => {
    if (!quickViewOpen()) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setQuickViewOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    onCleanup(() => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    });
  });

  return (
    <article
      class={styles.card}
      classList={{
        [styles.cardFill]: props.fill,
      }}
    >
      <A href={p.href} class={styles.cardMedia}>
        <Show when={p.image} fallback={<BoxArt theme={p.theme ?? "pokemon"} label={p.set ?? p.name} />}>
          <img src={p.image} alt={p.set ? `${p.name}, ${p.set}` : p.name} draggable={false} loading="lazy" />
        </Show>
        <Show when={p.badge}>
          <span class={styles.badge}>{p.badge}</span>
        </Show>
      </A>

      <div class={styles.cardBody}>
        <A href={p.href} class={styles.cardInfo}>
          <span class={styles.cardName}>{p.name}</span>
          <Show when={p.set}>
            <span class={styles.cardSet}>{p.set}</span>
          </Show>
          <Show when={p.rating}>
            <Stars rating={p.rating!} />
          </Show>
        </A>

        <div class={styles.cardFooter}>
          <span class={styles.cardPricing}>
            <Show when={displayCompareAtPrice() && displayCompareAtPrice()! > displayPrice()}>
              <del>{formatPrice(displayCompareAtPrice()!)}</del>
            </Show>
            <span class={styles.cardPrice}>
              {formatPrice(displayPrice())}
            </span>
          </span>

          <Show
            when={!hasChoices()}
            fallback={
              <button type="button" class={styles.addBtn} aria-label={`Choose ${p.name} options`} onClick={openQuickView}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            }
          >
            <button
              type="button"
              class={styles.addBtn}
              classList={{ [styles.addBtnDone]: props.isJustAdded() }}
              onClick={() => props.onAdd(p, p.variants?.[0])}
              aria-label={`Add ${p.name} to cart`}
            >
              <Show
                when={!props.isJustAdded()}
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

      <Show when={quickViewOpen()}>
        <Portal>
          <div
            class={styles.quickViewBackdrop}
            role="presentation"
            onClick={event => {
              if (event.target === event.currentTarget) setQuickViewOpen(false);
            }}
          >
            <section
              class={styles.quickView}
              role="dialog"
              aria-modal="true"
              aria-labelledby={`quick-view-title-${p.id}`}
            >
              <button
                type="button"
                class={styles.quickViewClose}
                aria-label="Close product options"
                onClick={() => setQuickViewOpen(false)}
              >
                ×
              </button>

              <div class={styles.quickViewMedia}>
                <Show
                  when={displayVariant()?.image ?? p.image}
                  fallback={<BoxArt theme={p.theme ?? "pokemon"} label={p.set ?? p.name} />}
                >
                  {image => <img src={image()} alt="" />}
                </Show>
              </div>

              <div class={styles.quickViewBody}>
                <span class={styles.quickViewSet}>{p.set ?? "Choose a format"}</span>
                <h2 id={`quick-view-title-${p.id}`}>{p.name}</h2>
                <p>Select the exact format before adding this product to your cart.</p>

                <div class={styles.quickVariants}>
                  <For each={p.variants}>
                    {variant => (
                      <button
                        type="button"
                        disabled={variant.stock <= 0}
                        classList={{ [styles.quickVariantActive]: selectedVariantId() === variant.id }}
                        onClick={() => setSelectedVariantId(variant.id)}
                      >
                        <span>
                          <strong>{variant.name}</strong>
                          <small>
                            {[variant.condition, variant.language, variant.finish].filter(Boolean).join(" · ") || variant.sku}
                          </small>
                        </span>
                        <span>
                          <strong>{formatPrice(variant.priceCents)}</strong>
                          <small>{variant.stock > 0 ? `${variant.stock} available` : "Sold out"}</small>
                        </span>
                      </button>
                    )}
                  </For>
                </div>

                <button
                  type="button"
                  class={styles.quickAdd}
                  disabled={!selectedVariant() || selectedVariant()!.stock <= 0}
                  onClick={confirmVariant}
                >
                  {selectedVariant() ? `Add ${selectedVariant()!.name} to cart` : "Choose a variant"}
                </button>
                <A href={p.href} class={styles.quickDetails}>View full product details</A>
              </div>
            </section>
          </div>
        </Portal>
      </Show>
    </article>
  );
}
