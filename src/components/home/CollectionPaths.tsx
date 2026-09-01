import { A } from "@solidjs/router";
import styles from "./CollectionPaths.module.scss";

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export default function CollectionPaths() {
  return (
    <section class={styles.section}>
      <div class={styles.wide}>
        <header class={styles.header}>
          <h2>Shop the catalogue your way</h2>
          <p>Jump straight to the product type you collect, or check the release desk for products arriving next.</p>
        </header>

        <div class={styles.layout}>
          <A href="/products?q=single" class={`${styles.collection} ${styles.singles}`}>
            <div class={styles.cardFan} aria-hidden="true">
              <img src="/images/cards/venusaur.png" alt="" />
              <img src="/images/cards/charizard.png" alt="" />
              <img src="/images/cards/blastoise.png" alt="" />
            </div>
            <div class={styles.collectionCopy}>
              <span>Single cards</span>
              <h3>Find the card, not another sealed box.</h3>
              <p>Browse raw and graded singles with condition, language, finish, and stock shown before checkout.</p>
              <strong>Shop single cards <Arrow /></strong>
            </div>
          </A>

          <div class={styles.stack}>
            <A href="/products?q=sealed" class={`${styles.collection} ${styles.sealed}`}>
              <span class={styles.collectionCode} aria-hidden="true">BOX</span>
              <div class={styles.collectionCopy}>
                <span>Sealed products</span>
                <h3>Booster boxes, packs, and decks</h3>
                <strong>Shop sealed products <Arrow /></strong>
              </div>
            </A>

            <A href="/products?q=graded" class={`${styles.collection} ${styles.graded}`}>
              <span class={styles.slab} aria-hidden="true"><i /></span>
              <div class={styles.collectionCopy}>
                <span>Graded cards</span>
                <h3>Slabs with the grade clearly shown</h3>
                <strong>Shop graded cards <Arrow /></strong>
              </div>
            </A>
          </div>

          <A href="/products?q=pre-order" class={`${styles.collection} ${styles.releases}`}>
            <span class={styles.releaseMark} aria-hidden="true">NEXT</span>
            <div class={styles.collectionCopy}>
              <span>Release desk</span>
              <h3>See upcoming sets by game.</h3>
              <p>Products marked for preorder are published here from the owner dashboard.</p>
              <strong>View upcoming releases <Arrow /></strong>
            </div>
          </A>
        </div>
      </div>
    </section>
  );
}
