import { A } from "@solidjs/router";
import { For, onCleanup, onMount, Show } from "solid-js";
import { revealCards } from "~/lib/motion";
import styles from "./ShopByGameDirectory.module.scss";

type Game = {
  name: string;
  tagline: string;
  href: string;
  theme: string;
  art?: string;
  formats: string[];
};

const GAMES: Game[] = [
  {
    name: "Pokémon",
    tagline: "Singles, sealed, and graded rares",
    href: "/categories/pokemon",
    theme: "pokemon",
    art: "/images/cards/venusaur.png",
    formats: ["Singles", "Sealed", "Graded"],
  },
  {
    name: "Yu-Gi-Oh!",
    tagline: "Old favourites and the newest sets",
    href: "/categories/yugioh",
    theme: "yugioh",
    formats: ["Booster boxes", "Decks", "Singles"],
  },
  {
    name: "Magic: The Gathering",
    tagline: "Commander, Standard, and more",
    href: "/categories/magic",
    theme: "magic",
    formats: ["Commander", "Boosters", "Singles"],
  },
  {
    name: "Disney Lorcana",
    tagline: "Enchanted cards and new Disney sets",
    href: "/categories/lorcana",
    theme: "lorcana",
    formats: ["Singles", "Displays", "Starter decks"],
  },
  {
    name: "Riftbound",
    tagline: "League of Legends comes to the tabletop",
    href: "/categories/riftbound",
    theme: "riftbound",
    formats: ["Champion decks", "Boosters", "Displays"],
  },
  {
    name: "Digimon",
    tagline: "Tamers, alternate arts, and sealed sets",
    href: "/categories/digimon",
    theme: "digimon",
    formats: ["Singles", "Booster boxes", "Decks"],
  },
  {
    name: "Cyberpunk",
    tagline: "Cards and releases from Night City",
    href: "/categories/cyberpunk",
    theme: "cyberpunk",
    formats: ["New releases", "Sealed", "Collector cards"],
  },
];

const [FEATURED, ...REST] = GAMES;

export default function GameTiles() {
  let rootRef: HTMLDivElement | undefined;

  onMount(() => {
    if (rootRef) onCleanup(revealCards(rootRef, `.${styles.feature}, li`));
  });

  return (
    <div class={styles.directory} ref={rootRef}>
      <A href={FEATURED.href} data-motion-card="10" class={`${styles.feature} ${styles[FEATURED.theme]}`}>
        <div class={styles.featureBody}>
          <h3 class={styles.featureName}>{FEATURED.name}</h3>
          <p class={styles.tagline}>{FEATURED.tagline}</p>
          <span class={styles.featureCta}>Shop {FEATURED.name}</span>
        </div>
        <Show when={FEATURED.art}>
          <img class={styles.featureArt} data-motion-art src={FEATURED.art} alt="" draggable={false} />
        </Show>
      </A>

      <ul class={styles.list}>
        <For each={REST}>
          {game => (
            <li>
              <A href={game.href} class={`${styles.tile} ${styles[game.theme]}`}>
                <strong class={styles.tileName}>{game.name}</strong>
                <span class={styles.tagline}>{game.tagline}</span>
              </A>
            </li>
          )}
        </For>
      </ul>
    </div>
  );
}
