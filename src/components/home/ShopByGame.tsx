import { A } from "@solidjs/router";
import GameTiles from "./GameTiles";
import styles from "./ShopByGameDirectory.module.scss";

export default function ShopByGame() {
  return (
    <section class={styles.section}>
      <div class={styles.wide}>
        <header class={styles.header}>
          <div>
            <h2>Trading card games</h2>
            <p>Each game has its own storefront with current stock, set releases, singles and sealed products.</p>
          </div>
          <A href="/categories" class={styles.allGames}>Browse all games</A>
        </header>

        <GameTiles />
      </div>
    </section>
  );
}
