import type { BoxTheme, SectionProduct } from "~/components/product/ProductCard";

export type CategoryData = {
  slug: string;
  name: string;
  tagline: string;
  blurb: string;
  highlights: string[];
  theme: BoxTheme;
  products: SectionProduct[];
};

export const CATEGORIES: Record<string, CategoryData> = {
  pokemon: {
    slug: "pokemon",
    name: "Pokémon",
    tagline: "Singles, sealed, and graded rares.",
    blurb: "From Base Set chase cards to the latest Scarlet & Violet pulls, graded slabs, raw singles, and sealed booster product, all condition-checked before they ship.",
    highlights: ["Base Set", "Crown Zenith", "Graded slabs", "Booster boxes"],
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
    slug: "yugioh",
    name: "Yu-Gi-Oh!",
    tagline: "Old favourites and the newest sets.",
    blurb: "Booster boxes, structure decks, and reprints of the cards that defined the game. Whether you're building competitive or chasing nostalgia, the staples are here.",
    highlights: ["Booster boxes", "Structure decks", "Legendary Duelists", "Reprints"],
    theme: "yugioh",
    products: [
      { id: "crystal-revenge-box", name: "Battles of Legend: Crystal Revenge Booster Box", theme: "yugioh", priceRangeCents: [795, 8995], badge: "New", href: "/products" },
      { id: "ghosts-from-the-past-box", name: "Ghosts From the Past: The Forgotten", theme: "yugioh", priceRangeCents: [1995, 5995], href: "/products" },
      { id: "legendary-duelists-box", name: "Legendary Duelists: Duels From the Deep", theme: "yugioh", priceRangeCents: [495, 3995], href: "/products" },
      { id: "structure-deck-fire-kings", name: "Structure Deck: Fire Kings", theme: "yugioh", priceRangeCents: [995, 1995], href: "/products" },
    ],
  },
  magic: {
    slug: "magic",
    name: "Magic: The Gathering",
    tagline: "Commander, Standard, and more.",
    blurb: "Set boosters, collector boxes, and ready-to-play Commander decks across the newest releases. Built for kitchen-table brews and competitive tables alike.",
    highlights: ["Commander", "Set boosters", "Collector boxes", "Modern Horizons"],
    theme: "magic",
    products: [
      { id: "bloomburrow-box", name: "Bloomburrow Set Booster Box", theme: "magic", priceRangeCents: [595, 13995], badge: "New", href: "/products" },
      { id: "commander-masters-box", name: "Commander Masters Collector Booster Box", theme: "magic", priceRangeCents: [2995, 24995], href: "/products" },
      { id: "modern-horizons-box", name: "Modern Horizons 3 Draft Booster Box", theme: "magic", priceRangeCents: [795, 15995], href: "/products" },
      { id: "duskmourn-commander-deck", name: "Duskmourn: House of Horror Commander Deck", theme: "magic", priceCents: 3495, href: "/products" },
    ],
  },
};

// Point every product at its detail page. Done centrally so the shop,
// category pages, and any other consumer all link consistently.
for (const cat of Object.values(CATEGORIES)) {
  for (const product of cat.products) {
    product.href = `/products/${product.id}`;
  }
}

export const CATEGORY_LIST = Object.values(CATEGORIES);

export type ShopProduct = SectionProduct & {
  game: string;
  gameName: string;
  theme: BoxTheme;
};

export const ALL_PRODUCTS: ShopProduct[] = CATEGORY_LIST.flatMap(cat =>
  cat.products.map(p => ({
    ...p,
    game: cat.slug,
    gameName: cat.name,
    theme: p.theme ?? cat.theme,
  })),
);

export function findProduct(id: string): ShopProduct | undefined {
  return ALL_PRODUCTS.find(p => p.id === id);
}

export function relatedProducts(product: ShopProduct, limit = 4): ShopProduct[] {
  return ALL_PRODUCTS.filter(p => p.game === product.game && p.id !== product.id).slice(0, limit);
}
