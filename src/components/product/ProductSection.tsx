import { A } from "@solidjs/router";
import { createSignal, createUniqueId, For, Show } from "solid-js";
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

          <A href={props.viewAllHref ?? "/products"} class={styles.viewAll}>
            View all
          </A>
        </header>

        {/* A grid rather than a scroll rail: on a wide screen the rail always
            left a card sliced in half at the edge, and hid the rest behind
            arrows. */}
        <div class={styles.grid}>
          <For each={props.products}>
            {product => (
              <ProductCard
                product={product}
                isJustAdded={() => justAdded().has(product.id)}
                onAdd={addToCart}
                fill
              />
            )}
          </For>
        </div>
      </div>
    </section>
  );
}
