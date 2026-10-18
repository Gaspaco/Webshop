import { A, useLocation, useSearchParams } from "@solidjs/router";
import { For } from "solid-js";
import styles from "./CheckoutChrome.module.scss";

const STEPS = [
  { id: "cart", label: "Cart" },
  { id: "checkout", label: "Checkout" },
  { id: "confirmed", label: "Confirmation" },
] as const;

// Cart and checkout are a task: the full storefront navigation is swapped for
// this slim bar so the only ways out are deliberate ones.
export function CheckoutHeader() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const current = () =>
    location.pathname === "/cart" ? 0 : searchParams.order ? 2 : 1;

  return (
    <header class={styles.header}>
      <div class={styles.inner}>
        <A href="/" class={styles.logo} aria-label="TCGHaven home">
          <img src="/images/logo-mark.png" alt="" width="409" height="379" />
          <span>TCG<span class={styles.logoAccent}>Haven</span></span>
        </A>

        <ol class={styles.steps} aria-label="Checkout progress">
          <For each={STEPS}>
            {(step, index) => (
              <li
                classList={{
                  [styles.stepDone]: index() < current(),
                  [styles.stepCurrent]: index() === current(),
                }}
                aria-current={index() === current() ? "step" : undefined}
              >
                {/* Only the cart is worth going back to; payment cannot be revisited. */}
                {step.id === "cart" && current() === 1 ? (
                  <A href="/cart" class={styles.stepLink}>
                    <span class={styles.stepDot} aria-hidden="true">{index() + 1}</span>
                    <span class={styles.stepLabel}>{step.label}</span>
                  </A>
                ) : (
                  <span class={styles.stepLink}>
                    <span class={styles.stepDot} aria-hidden="true">{index() + 1}</span>
                    <span class={styles.stepLabel}>{step.label}</span>
                  </span>
                )}
              </li>
            )}
          </For>
        </ol>

        <div class={styles.end}>
          <span class={styles.secure}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="4" y="10.5" width="16" height="10" rx="2.5" />
              <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
            </svg>
            Secure checkout
          </span>
          <A href="/products" class={styles.continue} aria-label="Continue shopping">
            <span class={styles.continueLong} aria-hidden="true">Continue shopping</span>
            <span class={styles.continueShort} aria-hidden="true">Shop</span>
          </A>
        </div>
      </div>
    </header>
  );
}

export function CheckoutFooter() {
  return (
    <footer class={styles.footer}>
      <span>Payments are processed securely by Mollie.</span>
      <nav aria-label="Legal">
        <A href="/shipping">Shipping & returns</A>
        <A href="/terms">Terms</A>
        <A href="/privacy">Privacy</A>
        <A href="/contact">Help</A>
      </nav>
    </footer>
  );
}
