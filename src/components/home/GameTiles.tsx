import { A } from "@solidjs/router";
import { For } from "solid-js";
import styles from "./ShopByGameDirectory.module.scss";

type Game = {
  name: string;
  code: string;
  tagline: string;
  href: string;
  theme: string;
  art?: string;
  index: string;
  formats: string[];
};

const GAMES: Game[] = [
  {
    name: "Pokémon",
    code: "PKM",
    tagline: "Singles, sealed, and graded rares",
    href: "/categories/pokemon",
    theme: "pokemon",
    art: "/images/cards/venusaur.png",
    index: "01",
    formats: ["Singles", "Sealed", "Graded"],
  },
  {
    name: "Yu-Gi-Oh!",
    code: "YGO",
    tagline: "Old favourites and the newest sets",
    href: "/categories/yugioh",
    theme: "yugioh",
    index: "02",
    formats: ["Booster boxes", "Decks", "Singles"],
  },
  {
    name: "Magic: The Gathering",
    code: "MTG",
    tagline: "Commander, Standard, and more",
    href: "/categories/magic",
    theme: "magic",
    index: "03",
    formats: ["Commander", "Boosters", "Singles"],
  },
  {
    name: "Disney Lorcana",
    code: "LRC",
    tagline: "Enchanted cards and new Disney sets",
    href: "/categories/lorcana",
    theme: "lorcana",
    index: "04",
    formats: ["Singles", "Displays", "Starter decks"],
  },
  {
    name: "Riftbound",
    code: "RFB",
    tagline: "League of Legends comes to the tabletop",
    href: "/categories/riftbound",
    theme: "riftbound",
    index: "05",
    formats: ["Champion decks", "Boosters", "Displays"],
  },
  {
    name: "Digimon",
    code: "DGM",
    tagline: "Tamers, alternate arts, and sealed sets",
    href: "/categories/digimon",
    theme: "digimon",
    index: "06",
    formats: ["Singles", "Booster boxes", "Decks"],
  },
  {
    name: "Cyberpunk",
    code: "CPK",
    tagline: "Cards and releases from Night City",
    href: "/categories/cyberpunk",
    theme: "cyberpunk",
    index: "07",
    formats: ["New releases", "Sealed", "Collector cards"],
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
            <span class={styles.tileIndex}>{game.index}</span>
            <span class={styles.gameCode} aria-hidden="true">{game.code}</span>
            {game.art && <img class={styles.tileArt} src={game.art} alt="" draggable={false} />}
            <div class={styles.tileBody}>
              <h3 class={styles.tileName}>{game.name}</h3>
              <p class={styles.tileTagline}>{game.tagline}</p>
              <span class={styles.tileFormats}>
                <For each={game.formats}>{format => <span>{format}</span>}</For>
              </span>
              <span class={styles.tileCta}>
                Shop {game.name}
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
