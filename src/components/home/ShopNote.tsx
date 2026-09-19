import { A } from "@solidjs/router";
import styles from "./ShopNote.module.scss";

export default function ShopNote() {
  return (
    <section class={styles.section} aria-labelledby="catalogue-finder-title">
      <div class={styles.wide}>
        <div class={styles.finder}>
          <div class={styles.heading}>
            <h2 id="catalogue-finder-title">Looking for a specific card?</h2>
            <p>Search by card name, set code, or rarity.</p>
          </div>

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
              placeholder="Card name, set code, or rarity"
              autocomplete="off"
              maxlength={80}
              required
            />
            <button type="submit">Search</button>
          </form>

          <div class={styles.belowSearch}>
            <nav class={styles.shortcuts} aria-label="Catalogue shortcuts">
              <span>Browse:</span>
              <A href="/products?q=yu-gi-oh">Yu-Gi-Oh!</A>
              <A href="/products?q=pokemon">Pokémon</A>
              <A href="/products?q=single">Singles</A>
              <A href="/products?q=pre-order">Pre-orders</A>
            </nav>
            <p class={styles.request}>Can’t find it? <A href="/contact">Ask us to look for it.</A></p>
          </div>
        </div>
      </div>
    </section>
  );
}
