import GameTiles from "./GameTiles";
import styles from "./ShopByGame.module.scss";

export default function ShopByGame() {
  return (
    <section class={styles.section}>
      <div class={styles.wide}>
        <header class={styles.header}>
          <div>
            <h2 class={styles.heading}>Choose your game</h2>
            <p class={styles.sub}>Each game has its own releases, sets, singles, and sealed catalogue.</p>
          </div>
          <a href="/categories" class={styles.allGames}>Browse all game pages</a>
        </header>

        <GameTiles />
      </div>
    </section>
  );
}
