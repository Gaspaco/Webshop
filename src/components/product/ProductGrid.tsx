import { createMemo, createSignal, For } from "solid-js";
import { useCart } from "~/lib/cart";
import ProductCard, {
  type ProductVariantOption,
  type SectionProduct,
} from "./ProductCard";
import styles from "./ProductGrid.module.scss";

type SortKey = "featured" | "price-asc" | "price-desc" | "name";

function priceOf(product: SectionProduct) {
  const mainVariant =
    product.variants?.find(variant => variant.isDefault) ??
    product.variants?.find(variant => variant.id === product.variantId) ??
    product.variants?.[0];
  return mainVariant?.priceCents ?? product.priceCents ?? product.priceRangeCents?.[0] ?? 0;
}

export default function ProductGrid(props: { products: SectionProduct[] }) {
  const cart = useCart();
  const [sort, setSort] = createSignal<SortKey>("featured");
  const [justAdded, setJustAdded] = createSignal<Set<string>>(new Set());

  const sorted = createMemo(() => {
    const list = [...props.products];
    switch (sort()) {
      case "price-asc":
        return list.sort((a, b) => priceOf(a) - priceOf(b));
      case "price-desc":
        return list.sort((a, b) => priceOf(b) - priceOf(a));
      case "name":
        return list.sort((a, b) => a.name.localeCompare(b.name));
      default:
        return list;
    }
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
    <div>
      <div class={styles.toolbar}>
        <p class={styles.count}>
          <strong>{props.products.length}</strong>
          {props.products.length === 1 ? " product" : " products"}
        </p>
        <label class={styles.sortLabel}>
          Sort by
          <select
            class={styles.sortSelect}
            value={sort()}
            onChange={e => setSort(e.currentTarget.value as SortKey)}
          >
            <option value="featured">Featured</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
            <option value="name">Name: A to Z</option>
          </select>
        </label>
      </div>

      <div class={styles.grid}>
        <For each={sorted()}>
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
  );
}
