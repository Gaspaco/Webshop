import { createSignal, For } from "solid-js";
import { useCart } from "~/lib/cart";
import ProductCard, { type SectionProduct } from "./ProductCard";
import styles from "./ProductGrid.module.scss";

export default function ProductGrid(props: { products: SectionProduct[] }) {
  const cart = useCart();
  const [justAdded, setJustAdded] = createSignal<Set<string>>(new Set());

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
  );
}
