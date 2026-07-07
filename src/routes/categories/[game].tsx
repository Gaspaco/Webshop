import { Title } from "@solidjs/meta";
import { A, useParams } from "@solidjs/router";
import { Show } from "solid-js";
import ProductGrid from "~/components/product/ProductGrid";
import type { BoxTheme, SectionProduct } from "~/components/product/ProductCard";
import styles from "./[game].module.scss";

type CategoryData = {
  name: string;
  tagline: string;
  theme: BoxTheme;
  products: SectionProduct[];
};

const CATEGORIES: Record<string, CategoryData> = {
  pokemon: {
    name: "Pokémon",
    tagline: "Singles, sealed, and graded rares.",
    theme: "pokemon",
    products: [
      { id: "charizard-base-set", name: "Charizard", set: "Base Set", image: "/images/cards/charizard.png", priceCents: 24995, rating: 5, href: "/products", badge: "Vintage" },
      { id: "umbreon-vmax-alt-art", name: "Umbreon VMAX Alt Art", image: "/images/cards/umbreon.png", priceCents: 18995, rating: 5, href: "/products" },
      { id: "rayquaza-vmax-st", name: "Rayquaza VMAX", set: "Silver Tempest", image: "/images/cards/rayquaza.png", priceCents: 15995, badge: "New", href: "/products" },
      { id: "blastoise-base-set", name: "Blastoise", set: "Base Set", image: "/images/cards/blastoise.png", priceCents: 11995, rating: 4, href: "/products" },
      { id: "mewtwo-base-set", name: "Mewtwo", set: "Base Set", image: "/images/cards/mewtwo.png", priceCents: 8995, rating: 5, href: "/products" },
      { id: "venusaur-base", name: "Venusaur", set: "Base Set", image: "/images/cards/venusaur.png", priceCents: 6995, href: "/products" },
      { id: "palkia-v-astral", name: "Palkia V", set: "Astral Radiance", image: "/images/cards/palkia.png", priceCents: 3495, badge: "New", href: "/products" },
      { id: "pikachu-crown-zenith", name: "Pikachu", set: "Crown Zenith", image: "/images/cards/pikachu.png", priceCents: 2495, rating: 4, href: "/products" },
    ],
  },
  yugioh: {
    name: "Yu-Gi-Oh!",
    tagline: "Old favourites and the newest sets.",
    theme: "yugioh",
    products: [
      { id: "crystal-revenge-box", name: "Battles of Legend: Crystal Revenge Booster Box", theme: "yugioh", priceRangeCents: [795, 8995], badge: "New", href: "/products" },
      { id: "ghosts-from-the-past-box", name: "Ghosts From the Past: The Forgotten", theme: "yugioh", priceRangeCents: [1995, 5995], href: "/products" },
      { id: "legendary-duelists-box", name: "Legendary Duelists: Duels From the Deep", theme: "yugioh", priceRangeCents: [495, 3995], href: "/products" },
      { id: "structure-deck-fire-kings", name: "Structure Deck: Fire Kings", theme: "yugioh", priceRangeCents: [995, 1995], href: "/products" },
    ],
  },
  magic: {
    name: "Magic: The Gathering",
    tagline: "Commander, Standard, and more.",
    theme: "magic",
    products: [
      { id: "bloomburrow-box", name: "Bloomburrow Set Booster Box", theme: "magic", priceRangeCents: [595, 13995], badge: "New", href: "/products" },
      { id: "commander-masters-box", name: "Commander Masters Collector Booster Box", theme: "magic", priceRangeCents: [2995, 24995], href: "/products" },
      { id: "modern-horizons-box", name: "Modern Horizons 3 Draft Booster Box", theme: "magic", priceRangeCents: [795, 15995], href: "/products" },
      { id: "duskmourn-commander-deck", name: "Duskmourn: House of Horror Commander Deck", theme: "magic", priceCents: 3495, href: "/products" },
    ],
  },
};

export default function CategoryPage() {
  const params = useParams();
  const category = () => CATEGORIES[params.game ?? ""];

  return (
    <Show
      when={category()}
      fallback={
        <main class={styles.page}>
          <div class={styles.wide}>
            <p class={styles.sub}>We couldn't find that category.</p>
            <A href="/categories" class={styles.backLink}>Back to categories</A>
          </div>
        </main>
      }
    >
      {cat => (
        <main class={styles.page}>
          <Title>{cat().name} | TCGHaven</Title>

          <div class={`${styles.banner} ${styles[cat().theme]}`}>
            <div class={styles.wide}>
              <nav class={styles.breadcrumb} aria-label="Breadcrumb">
                <A href="/categories">Categories</A>
                <span>/</span>
                <span>{cat().name}</span>
              </nav>
              <h1 class={styles.heading}>{cat().name}</h1>
              <p class={styles.sub}>{cat().tagline}</p>
              <p class={styles.count}>{cat().products.length} products</p>
            </div>
          </div>

          <div class={styles.wide}>
            <ProductGrid products={cat().products} />
          </div>
        </main>
      )}
    </Show>
  );
}
