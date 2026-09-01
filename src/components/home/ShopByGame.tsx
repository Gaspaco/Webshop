import { A } from "@solidjs/router";
import GameTiles from "./GameTiles";
import styles from "./ShopByGameDirectory.module.scss";

export default function ShopByGame() {
  return (
    <section class={styles.section}>
      <div class={styles.wide}>
        <header class={styles.header}>
          <div>
            <h2 class={styles.heading}>Trading card games</h2>
            <p class={styles.sub}>Every game has its own storefront for current stock, set releases, singles, and sealed products.</p>
          </div>
          <A href="/categories" class={styles.allGames}>
            Browse all games
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </A>
        </header>

        <GameTiles />
      </div>
    </section>
  );
}
