import GameTiles from "./GameTiles";
import styles from "./ShopByGame.module.scss";

export default function ShopByGame() {
  return (
    <section class={styles.section}>
      <div class={styles.wide}>
        <header class={styles.header}>
          <div>
            <h2 class={styles.heading}>Start with your game.</h2>
            <p class={styles.sub}>Dedicated release pages for singles, sealed products, and every set we carry.</p>
          </div>
          <a href="/categories" class={styles.allGames}>
            See the full catalogue
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </a>
        </header>

        <GameTiles />
      </div>
    </section>
  );
}
