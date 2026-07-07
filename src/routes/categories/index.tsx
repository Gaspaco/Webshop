import { Title } from "@solidjs/meta";
import ShopByGame from "~/components/home/ShopByGame";
import styles from "./index.module.scss";

export default function Categories() {
  return (
    <main class={styles.page}>
      <Title>Categories | TCGHaven</Title>

      <div class={styles.wide}>
        <header class={styles.header}>
          <h1 class={styles.heading}>Categories</h1>
          <p class={styles.sub}>
            Browse by game — Pokémon, Yu-Gi-Oh!, and Magic: The Gathering, with more on the way.
          </p>
        </header>
      </div>

      <ShopByGame />
    </main>
  );
}
