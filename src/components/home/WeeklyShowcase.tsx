import { A } from "@solidjs/router";
import { formatPrice } from "~/lib/cart";
import styles from "./WeeklyShowcase.module.scss";

export default function WeeklyShowcase() {
  return (
    <section class={styles.section}>
      <div class={styles.wide}>
        <header class={styles.header}>
          <h2 class={styles.heading}>This week at the Haven</h2>
          <p class={styles.sub}>One spotlight card, one deal, and what's landing next.</p>
        </header>

        <div class={styles.bento}>
          {/* Card of the week, large spotlight */}
          <A href="/products" class={`${styles.tile} ${styles.spotlight}`}>
            <img
              class={styles.spotlightArt}
              src="/images/cards/charizard.png"
              alt="First-edition Base Set Charizard holographic card"
              draggable={false}
            />
            <div class={styles.spotlightScrim} />
            <div class={styles.tileBody}>
              <span class={styles.kicker}>Card of the week</span>
              <h3 class={styles.spotlightTitle}>First-edition Charizard</h3>
              <p class={styles.spotlightBlurb}>
                The 1999 holo that started it all, graded and photographed in
                our own hands.
              </p>
              <span class={styles.priceLine}>
                {formatPrice(24995)}
                <span class={styles.cta}>
                  View card
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </span>
              </span>
            </div>
          </A>

          {/* Deal of the week */}
          <A href="/products" class={`${styles.tile} ${styles.deal}`}>
            <img
              class={styles.smallArt}
              src="/images/cards/pikachu.png"
              alt="Pikachu special-illustration rare card"
              draggable={false}
            />
            <div class={styles.tileBody}>
              <span class={`${styles.kicker} ${styles.kickerGold}`}>Deal of the week</span>
              <h3 class={styles.tileTitle}>Pikachu · Crown Zenith</h3>
              <span class={styles.priceLine}>
                <s class={styles.oldPrice}>{formatPrice(2495)}</s>
                {formatPrice(1795)}
              </span>
            </div>
          </A>

          {/* New in */}
          <A href="/products" class={`${styles.tile} ${styles.newIn}`}>
            <img
              class={styles.smallArt}
              src="/images/cards/palkia.png"
              alt="Palkia V card from Astral Radiance"
              draggable={false}
            />
            <div class={styles.tileBody}>
              <span class={styles.kicker}>Just landed</span>
              <h3 class={styles.tileTitle}>Palkia V · Astral Radiance</h3>
              <span class={styles.priceLine}>{formatPrice(3495)}</span>
            </div>
          </A>

          {/* Preorder, tall panel */}
          <A href="/products" class={`${styles.tile} ${styles.preorder}`}>
            <div class={styles.tileBody}>
              <span class={`${styles.kicker} ${styles.kickerViolet}`}>Preorder</span>
              <h3 class={styles.preorderTitle}>Mega Evolution Booster Box</h3>
              <p class={styles.preorderBlurb}>
                Reserve now, pay at release. Limited allocation per customer.
              </p>
              <ul class={styles.preorderList}>
                <li>Pokémon · English</li>
                <li>36 packs per box</li>
                <li>Releases this autumn</li>
              </ul>
              <span class={styles.cta}>
                Reserve yours
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
            </div>
          </A>
        </div>
      </div>
    </section>
  );
}
