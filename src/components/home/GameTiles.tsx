import { A } from "@solidjs/router";
import { For } from "solid-js";
import styles from "./ShopByGame.module.scss";

type Game = {
  name: string;
  code: string;
  tagline: string;
  href: string;
  theme: string;
  art?: string;
  sets: string[];
};

const GAMES: Game[] = [
  {
    name: "Pokémon",
    code: "PKM",
    tagline: "Singles, sealed, and graded rares",
    href: "/categories/pokemon",
    theme: "pokemon",
    art: "/images/cards/venusaur.png",
    sets: ["Base Set", "Crown Zenith", "Scarlet & Violet"],
  },
  {
    name: "Yu-Gi-Oh!",
    code: "YGO",
    tagline: "Old favourites and the newest sets",
    href: "/categories/yugioh",
    theme: "yugioh",
    sets: ["Crystal Revenge", "Legendary Duelists", "Structure Decks"],
  },
  {
    name: "Magic: The Gathering",
    code: "MTG",
    tagline: "Commander, Standard, and more",
    href: "/categories/magic",
    theme: "magic",
    sets: ["Bloomburrow", "Modern Horizons 3", "Commander Masters"],
  },
];

export default function GameTiles() {
  return (
    <div class={styles.grid}>
      <For each={GAMES}>
        {game => (
          <A
            href={game.href}
            class={styles.tile}
            classList={{ [styles[game.theme]]: true }}
          >
            <span class={styles.gameCode} aria-hidden="true">{game.code}</span>
            {game.art && (
              <img class={styles.tileArt} src={game.art} alt="" draggable={false} />
            )}
            <div class={styles.tileScrim} />
            <div class={styles.tileBody}>
              <div class={styles.tileHeading}>
                <h3 class={styles.tileName}>{game.name}</h3>
                <p class={styles.tileTagline}>{game.tagline}</p>
              </div>
              <span class={styles.tileSets}>
                <For each={game.sets}>{set => <span>{set}</span>}</For>
              </span>
              <span class={styles.tileCta}>
                Open game page
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
            </div>
          </A>
        )}
      </For>
    </div>
  );
}
