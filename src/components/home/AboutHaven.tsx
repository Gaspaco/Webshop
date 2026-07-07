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
            <span class={styles.eyebrow}>Our story</span>
            <h2 class={styles.heading}>Built by collectors, for collectors.</h2>
            <p class={styles.blurb}>
              My Little TCG Haven started with one card, then a shoebox, then a
              spare room that ran out of shelves. We grade every card
              ourselves and keep stock counts honest, so what you see is what
              lands on your doorstep.
            </p>

            <div class={styles.statRow}>
              <div class={styles.stat}>
                <span class={styles.statNumber}>10K+</span>
                <span class={styles.statLabel}>Cards in stock</span>
              </div>
              <div class={styles.stat}>
                <span class={styles.statNumber}>3</span>
                <span class={styles.statLabel}>Games we carry</span>
              </div>
              <div class={styles.stat}>
                <span class={styles.statNumber}>NL</span>
                <span class={styles.statLabel}>Based & shipped</span>
              </div>
            </div>

            <A href="/about" class={styles.cta}>
              Read our story
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
