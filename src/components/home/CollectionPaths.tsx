import { A } from "@solidjs/router";
import { onCleanup, onMount } from "solid-js";
import { revealCards } from "~/lib/motion";
import styles from "./CollectionPaths.module.scss";

export default function CollectionPaths() {
  let layoutRef: HTMLDivElement | undefined;

  onMount(() => {
    if (layoutRef) onCleanup(revealCards(layoutRef, ":scope > a"));
  });

  return (
    <section class={styles.section}>
      <div class={styles.wide}>
        <header class={styles.header}>
          <div>
            <h2>Shop the catalogue your way</h2>
            <p>Go straight to the product type you collect, or see what is arriving next.</p>
          </div>
        </header>

        <div class={styles.layout} ref={layoutRef}>
          <A href="/products?q=single" data-motion-card="6" class={`${styles.path} ${styles.singles}`}>
            <div class={styles.cardFan} data-motion-art aria-hidden="true">
              <img src="/images/cards/venusaur.png" alt="" />
              <img src="/images/cards/charizard.png" alt="" />
              <img src="/images/cards/blastoise.png" alt="" />
            </div>
            <div class={styles.copy}>
              <h3>Single cards</h3>
              <p>Raw and graded singles, with condition, language, finish and stock shown before checkout.</p>
              <span class={styles.cta}>Shop single cards</span>
            </div>
          </A>

          <A href="/products?q=sealed" class={`${styles.path} ${styles.sealed}`}>
            <div class={styles.copy}>
              <h3>Sealed products</h3>
              <p>Booster boxes, packs and decks.</p>
              <span class={styles.cta}>Shop sealed</span>
            </div>
          </A>

          <A href="/products?q=graded" data-motion-card="12" class={`${styles.path} ${styles.graded}`}>
            <span class={styles.slab} data-motion-art aria-hidden="true">
              <span class={styles.slabLabel}>
                <i />
                <b>10</b>
              </span>
              <img src="/images/cards/umbreon.png" alt="" />
            </span>
            <div class={styles.copy}>
              <h3>Graded cards</h3>
              <p>Slabs with the grade clearly shown.</p>
              <span class={styles.cta}>Shop graded</span>
            </div>
          </A>

          <A href="/products?q=pre-order" class={`${styles.path} ${styles.releases}`}>
            <div class={styles.copy}>
              <h3>Upcoming releases</h3>
              <p>Pre-order announced sets before release day, sorted by game.</p>
              <span class={styles.cta}>See upcoming releases</span>
            </div>
          </A>
        </div>
      </div>
    </section>
  );
}
