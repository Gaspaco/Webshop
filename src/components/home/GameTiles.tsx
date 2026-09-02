import { A } from "@solidjs/router";
import { For, onCleanup, onMount, Show } from "solid-js";
import { revealOnScroll } from "~/lib/motion";
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
    // A real list, so a stagger reads as sequence rather than decoration.
    const stop = rootRef
      ? revealOnScroll(rootRef, { children: `.${styles.feature}, li`, y: 20, stagger: 0.06 })
      : undefined;
    onCleanup(() => stop?.());
  });

  return (
    <div class={styles.directory} ref={rootRef}>
      <A
        href={FEATURED.href}
        class={`${styles.feature} ${styles[FEATURED.theme]}`}
      >
        <div class={styles.featureBody}>
          <h3 class={styles.featureName}>{FEATURED.name}</h3>
          <p class={styles.featureTagline}>{FEATURED.tagline}</p>
          <span class={styles.formats}>
            <For each={FEATURED.formats}>{format => <span>{format}</span>}</For>
          </span>
          <span class={styles.featureCta}>
            Shop {FEATURED.name}
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </span>
        </div>
        <Show when={FEATURED.art}>
          <img
            class={styles.featureArt}
            src={FEATURED.art}
            alt=""
            draggable={false}
          />
        </Show>
      </A>

      <ul class={styles.list}>
        <For each={REST}>
          {game => (
            <li>
              <A href={game.href} class={`${styles.row} ${styles[game.theme]}`}>
                <span class={styles.rowMain}>
                  <strong>{game.name}</strong>
                  <span class={styles.rowTagline}>{game.tagline}</span>
                </span>
                <span class={styles.formats}>
                  <For each={game.formats}>{format => <span>{format}</span>}</For>
                </span>
                <svg class={styles.rowArrow} viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </A>
            </li>
          )}
        </For>
      </ul>
    </div>
  );
}
