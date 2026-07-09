import GameTiles from "./GameTiles";
import styles from "./ShopByGame.module.scss";

export default function ShopByGame() {
  return (
    <section class={styles.section}>
      <div class={styles.wide}>
        <header class={styles.header}>
          <h2 class={styles.heading}>Shop by game</h2>
          <p class={styles.sub}>One shelf, every kind of collector.</p>
        </header>

        <GameTiles />
      </div>
    </section>
  );
}
