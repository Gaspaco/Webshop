import { A } from "@solidjs/router";
import { For, Show } from "solid-js";
import { formatPrice } from "~/lib/cart";
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
  onAdd: (product: SectionProduct) => void;
  fill?: boolean;
};

export default function ProductCard(props: ProductCardProps) {
  const p = props.product;

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
          <span class={styles.cardPrice}>
            <Show
              when={!p.priceRangeCents}
              fallback={
                <>
                  {formatPrice(p.priceRangeCents![0])} to {formatPrice(p.priceRangeCents![1])}
                </>
              }
            >
              {formatPrice(p.priceCents ?? 0)}
            </Show>
          </span>

          <Show
            when={!p.priceRangeCents}
            fallback={
              <A href={p.href} class={styles.addBtn} aria-label={`View ${p.name} options`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </A>
            }
          >
            <button
              type="button"
              class={styles.addBtn}
              classList={{ [styles.addBtnDone]: props.isJustAdded() }}
              onClick={() => props.onAdd(p)}
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
    </article>
  );
}
