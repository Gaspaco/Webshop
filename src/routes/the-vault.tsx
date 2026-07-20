import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import { createSignal, For } from "solid-js";
import ProductCard, { type SectionProduct } from "~/components/product/ProductCard";
import { useCart } from "~/lib/cart";
import { ALL_PRODUCTS } from "~/lib/categories";
import styles from "./the-vault.module.scss";

const valueCeiling = (product: SectionProduct) =>
  product.priceRangeCents?.[1] ?? product.priceCents ?? 0;

const VAULT_PRODUCTS = ALL_PRODUCTS
  .filter(product => product.badge === "Vintage" || valueCeiling(product) >= 6995)
  .sort((a, b) => valueCeiling(b) - valueCeiling(a))
  .slice(0, 8);

const HAVEN_SCORES = ["9.9", "9.8", "9.7", "9.6", "9.5", "9.4", "9.3", "9.2"];

export default function TheVault() {
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

    setJustAdded(current => new Set(current).add(product.id));
    setTimeout(() => {
      setJustAdded(current => {
        const next = new Set(current);
        next.delete(product.id);
        return next;
      });
    }, 1400);
  };

  return (
    <main class={styles.page}>
      <Title>The Vault | TCGHaven</Title>

      <div class={styles.wide}>
        <header class={styles.header}>
          <div class={styles.headerCopy}>
            <h1 class={styles.heading}>The Vault</h1>
            <p class={styles.sub}>
              A tighter shelf of standout singles, nostalgic icons, and sealed sets worth a closer look.
            </p>
          </div>

          <A href="/products" class={styles.shopAll}>
            Explore the full shop
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </A>
        </header>

        <div class={styles.catalogHead}>
          <p>
            <strong>{VAULT_PRODUCTS.length}</strong>
            {VAULT_PRODUCTS.length === 1 ? " vault pick" : " vault picks"}
          </p>
          <span>Haven scores, not PSA grades</span>
        </div>

        <div class={styles.grid}>
          <For each={VAULT_PRODUCTS}>
            {(product, index) => (
              <div class={styles.vaultCard}>
                <div class={styles.vaultMark}>
                  <span class={styles.vaultNumber}>
                    Vault selection {String(index() + 1).padStart(2, "0")}
                  </span>
                  <span
                    class={styles.score}
                    aria-label={`Haven collector score ${HAVEN_SCORES[index()]} out of 10`}
                  >
                    <span>Haven score</span>
                    <strong>{HAVEN_SCORES[index()]}</strong>
                  </span>
                </div>
                <ProductCard
                  product={product}
                  isJustAdded={() => justAdded().has(product.id)}
                  onAdd={addToCart}
                  fill
                />
              </div>
            )}
          </For>
        </div>
      </div>
    </main>
  );
}
