import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import { For, Show } from "solid-js";
import { formatPrice, useCart } from "~/lib/cart";
import styles from "./cart.module.scss";

export default function Cart() {
  const cart = useCart();

  return (
    <main class={styles.page}>
      <div class="container">
        <Title>Cart — TCGHaven</Title>
        <h1 class={styles.heading}>Your cart</h1>

        <Show
          when={cart.items().length > 0}
          fallback={
            <div class={styles.empty}>
              <span class={styles.emptyIcon}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
                  <path d="M3 6h18" />
                  <path d="M16 10a4 4 0 0 1-8 0" />
                </svg>
              </span>
              <p class={styles.emptyTitle}>Your cart is empty</p>
              <p class={styles.emptyText}>
                Browse singles, sealed product, and accessories, then add something
                to your cart to see it here.
              </p>
              <A href="/products" class={styles.emptyCta}>
                Browse the shop
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </A>
            </div>
          }
        >
          <div class={styles.layout}>
            <div class={styles.list}>
              <For each={cart.items()}>
                {(item, index) => (
                  <div class={styles.row} style={{ "--row-index": index() }}>
                    <span class={styles.thumb}>
                      <img src={item.image} alt="" draggable={false} />
                    </span>

                    <div class={styles.rowInfo}>
                      <span class={styles.rowName}>{item.name}</span>
                      <span class={styles.rowUnitPrice}>{formatPrice(item.priceCents)} each</span>

                      <div class={styles.qtyControl}>
                        <button
                          type="button"
                          class={styles.qtyBtn}
                          aria-label={`Decrease quantity of ${item.name}`}
                          onClick={() => cart.setQuantity(item.id, item.quantity - 1)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
                            <path d="M5 12h14" />
                          </svg>
                        </button>
                        <span class={styles.qtyValue}>{item.quantity}</span>
                        <button
                          type="button"
                          class={styles.qtyBtn}
                          aria-label={`Increase quantity of ${item.name}`}
                          onClick={() => cart.setQuantity(item.id, item.quantity + 1)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
                            <path d="M12 5v14M5 12h14" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    <div class={styles.rowEnd}>
                      <span class={styles.lineTotal}>
                        {formatPrice(item.priceCents * item.quantity)}
                      </span>
                      <button
                        type="button"
                        class={styles.removeBtn}
                        onClick={() => cart.removeItem(item.id)}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M3 6h18" />
                          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        </svg>
                        Remove
                      </button>
                    </div>
                  </div>
                )}
              </For>
            </div>

            <aside class={styles.summary}>
              <h2 class={styles.summaryTitle}>Order summary</h2>

              <div class={styles.summaryRow}>
                <span>Subtotal</span>
                <span>{formatPrice(cart.subtotalCents())}</span>
              </div>
              <div class={styles.summaryRow}>
                <span>Shipping</span>
                <span>Calculated at checkout</span>
              </div>

              <div class={styles.summaryTotal}>
                <span>Total</span>
                <span>{formatPrice(cart.subtotalCents())}</span>
              </div>

              <A href="/checkout" class={styles.checkoutBtn}>
                Checkout
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </A>

              <A href="/products" class={styles.continueLink}>
                Continue shopping
              </A>
            </aside>
          </div>
        </Show>
      </div>
    </main>
  );
}
