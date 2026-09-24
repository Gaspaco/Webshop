import { A } from "@solidjs/router";
import styles from "./ShopNote.module.scss";

export default function ShopNote() {
  return (
    <section class={styles.section} aria-labelledby="catalogue-finder-title">
      <div class={styles.wide}>
        <div class={styles.heading}>
          <h2 id="catalogue-finder-title">Search by card details.</h2>
          <p>Enter a name, set number, or rarity to narrow down the printing.</p>
        </div>

        <div class={styles.finder}>
          <form action="/products" method="get" class={styles.search} role="search">
            <label for="catalogue-search" class={styles.srOnly}>Search the catalogue</label>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-4-4" />
            </svg>
            <input
              id="catalogue-search"
              name="q"
              type="search"
              placeholder="Try a card name, set number, or rarity"
              autocomplete="off"
              maxlength={80}
              required
            />
            <button type="submit">Search catalogue</button>
          </form>

          <nav class={styles.shortcuts} aria-label="Catalogue shortcuts">
            <A href="/products?q=pokemon">Pokémon</A>
            <A href="/products?q=yu-gi-oh">Yu-Gi-Oh!</A>
            <A href="/products?q=magic">Magic: The Gathering</A>
            <A href="/products?q=pre-order">Pre-orders</A>
          </nav>

          <div class={styles.request}>
            <p><strong>Missing a printing?</strong> Send us the card name and set number.</p>
            <A href="/contact">
              Request a card
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </A>
          </div>
        </div>
      </div>
    </section>
  );
}
