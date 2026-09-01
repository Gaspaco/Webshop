import { A } from "@solidjs/router";
import styles from "./AboutHaven.module.scss";

export default function AboutHaven() {
  return (
    <section class={styles.section}>
      <div class={styles.wide}>
        <div class={styles.panel}>
          <div class={styles.frame}>
            <img
              class={styles.frameArt}
              src="/images/cards/charizard.png"
              alt="First-edition Base Set Charizard holographic card"
              draggable={false}
            />
            <div class={styles.frameScrim} />
          </div>

          <div class={styles.copy}>
            <h2 class={styles.heading}>A Dutch card shop with stock you can actually buy.</h2>
            <p class={styles.blurb}>
              TCGHaven keeps singles and sealed products together in one clear
              catalogue. Product formats, conditions, prices, and available
              quantities are shown before you add anything to your cart.
            </p>

            <div class={styles.statRow}>
              <div class={styles.stat}>
                <span class={styles.statNumber}>In hand</span>
                <span class={styles.statLabel}>Real stock shown online</span>
              </div>
              <div class={styles.stat}>
                <span class={styles.statNumber}>PostNL</span>
                <span class={styles.statLabel}>Tracked delivery options</span>
              </div>
              <div class={styles.stat}>
                <span class={styles.statNumber}>Mollie</span>
                <span class={styles.statLabel}>Secure payment processing</span>
              </div>
            </div>

            <A href="/about" class={styles.cta}>
              About TCGHaven
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </A>
          </div>
        </div>
      </div>
    </section>
  );
}
