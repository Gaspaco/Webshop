import { A } from "@solidjs/router";
import { For } from "solid-js";
import styles from "./ShopByGame.module.scss";

type Game = {
  name: string;
  tagline: string;
  href: string;
  theme: string;
  art?: string;
};

const GAMES: Game[] = [
  {
    name: "Pokémon",
    tagline: "Singles, sealed, and graded rares",
    href: "/categories/pokemon",
    theme: "pokemon",
    art: "/images/cards/venusaur.png",
  },
  {
    name: "Yu-Gi-Oh!",
    tagline: "Old favourites and the newest sets",
    href: "/categories/yugioh",
    theme: "yugioh",
  },
  {
    name: "Magic: The Gathering",
    tagline: "Commander, Standard, and more",
    href: "/categories/magic",
    theme: "magic",
  },
];

export default function ShopByGame() {
  return (
    <section class={styles.section}>
      <div class={styles.wide}>
        <header class={styles.header}>
          <h2 class={styles.heading}>Shop by game</h2>
          <p class={styles.sub}>One shelf, every kind of collector.</p>
        </header>

        <div class={styles.grid}>
          <For each={GAMES}>
            {(game, i) => (
              <A
                href={game.href}
                class={styles.tile}
                classList={{ [styles[game.theme]]: true, [styles.tileFeatured]: i() === 0 }}
              >
                {game.art && (
                  <img class={styles.tileArt} src={game.art} alt="" draggable={false} />
                )}
                <div class={styles.tileScrim} />
                <div class={styles.tileBody}>
                  <h3 class={styles.tileName}>{game.name}</h3>
                  <p class={styles.tileTagline}>{game.tagline}</p>
                  <span class={styles.tileCta}>
                    Shop now
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </span>
                </div>
              </A>
            )}
          </For>
        </div>
      </div>
    </section>
  );
}
