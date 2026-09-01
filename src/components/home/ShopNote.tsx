import { A } from "@solidjs/router";
import styles from "./ShopNote.module.scss";

/**
 * The one section on the homepage that isn't a product grid. TCGHaven is a
 * one-person shop, so the page says so in the owner's own voice.
 */
export default function ShopNote() {
  return (
    <section class={styles.section}>
      <div class={styles.wide}>
        <div class={styles.panel}>
          <div class={styles.art}>
            <img
              src="/images/cards/charizard.png"
              alt="First-edition Base Set Charizard holographic card"
              draggable={false}
            />
          </div>

          <div class={styles.note}>
            <h2 class={styles.heading}>
              Every card that leaves here, I graded myself.
            </h2>

            <p>
              TCGHaven is one person in Rotterdam. I buy the stock, photograph
              each card as it actually looks, write the condition notes, and
              pack the mailers on my kitchen table.
            </p>
            <p>
              That is the whole operation. If something arrives wrong, you are
              emailing the person who packed it, and I will make it right.
            </p>

            <p class={styles.signature}>Alex</p>

            <A href="/about" class={styles.link}>
              Read the full story
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </A>
          </div>
        </div>
      </div>
    </section>
  );
}
