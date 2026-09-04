import type { BoxTheme, SectionProduct } from "~/components/product/ProductCard";

export type ShopVariant = {
  id: string;
  name: string;
  sku: string;
  condition?: string;
  language?: string;
  finish?: string;
  image?: string;
  isDefault?: boolean;
  priceCents: number;
  compareAtPriceCents?: number;
  stock: number;
};

type CategoryProduct = SectionProduct & {
  productType?: "single" | "sealed" | "graded" | "accessory";
  condition?: string;
  setCode?: string;
  trailerUrl?: string;
  releaseDate?: string;
  preorder?: boolean;
  variants?: ShopVariant[];
};

export type CategoryData = {
  slug: string;
  name: string;
  tagline: string;
  blurb: string;
  highlights: string[];
  theme: BoxTheme;
  products: CategoryProduct[];
};

function sealedFormats(
  productId: string,
  singleName: string,
  singlePriceCents: number,
  displayName: string,
  displayPriceCents: number,
): ShopVariant[] {
  const skuBase = productId.replace(/[^a-z0-9]+/gi, "-").toUpperCase();
  return [
    {
      id: `static:${productId}:single`,
      name: singleName,
      sku: `${skuBase}-SINGLE`,
      condition: "Sealed",
      language: "English",
      priceCents: singlePriceCents,
      stock: 25,
      isDefault: false,
    },
    {
      id: `static:${productId}:display`,
      name: displayName,
      sku: `${skuBase}-DISPLAY`,
      condition: "Sealed",
      language: "English",
      priceCents: displayPriceCents,
      stock: 6,
      isDefault: true,
    },
  ];
}

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
      { id: "crystal-revenge-box", name: "Battles of Legend: Crystal Revenge Booster Box", theme: "yugioh", productType: "sealed", condition: "Sealed", setCode: "BLCR", priceCents: 8995, priceRangeCents: [795, 8995], variants: sealedFormats("crystal-revenge-box", "Booster pack", 795, "Booster box", 8995), badge: "New", href: "/products" },
      { id: "ghosts-from-the-past-box", name: "Ghosts From the Past: The Forgotten", theme: "yugioh", productType: "sealed", condition: "Sealed", setCode: "GFP2", priceCents: 5995, priceRangeCents: [1995, 5995], variants: sealedFormats("ghosts-from-the-past-box", "Mini box", 1995, "Display box", 5995), href: "/products" },
      { id: "legendary-duelists-box", name: "Legendary Duelists: Duels From the Deep", theme: "yugioh", productType: "sealed", condition: "Sealed", setCode: "LED9", priceCents: 3995, priceRangeCents: [495, 3995], variants: sealedFormats("legendary-duelists-box", "Booster pack", 495, "Booster box", 3995), href: "/products" },
      { id: "structure-deck-fire-kings", name: "Structure Deck: Fire Kings", theme: "yugioh", productType: "sealed", condition: "Sealed", setCode: "SR14", priceCents: 1995, href: "/products" },
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
      { id: "bloomburrow-box", name: "Bloomburrow Set Booster Box", theme: "magic", productType: "sealed", condition: "Sealed", setCode: "BLB", priceCents: 13995, priceRangeCents: [595, 13995], variants: sealedFormats("bloomburrow-box", "Play booster", 595, "Play booster box", 13995), badge: "New", href: "/products" },
      { id: "commander-masters-box", name: "Commander Masters Collector Booster Box", theme: "magic", productType: "sealed", condition: "Sealed", setCode: "CMM", priceCents: 24995, priceRangeCents: [2995, 24995], variants: sealedFormats("commander-masters-box", "Collector booster", 2995, "Collector booster box", 24995), href: "/products" },
      { id: "modern-horizons-box", name: "Modern Horizons 3 Draft Booster Box", theme: "magic", productType: "sealed", condition: "Sealed", setCode: "MH3", priceCents: 15995, priceRangeCents: [795, 15995], variants: sealedFormats("modern-horizons-box", "Play booster", 795, "Play booster box", 15995), href: "/products" },
      { id: "duskmourn-commander-deck", name: "Duskmourn: House of Horror Commander Deck", theme: "magic", productType: "sealed", condition: "Sealed", setCode: "DSC", priceCents: 3495, href: "/products" },
    ],
  },
  lorcana: {
    slug: "lorcana",
    name: "Disney Lorcana",
    tagline: "Illumineers, enchanted cards, and sealed releases.",
    blurb: "Browse Disney Lorcana singles and sealed products by set, from starter decks to enchanted chase cards.",
    highlights: ["Enchanted cards", "Booster displays", "Starter decks", "New sets"],
    theme: "lorcana",
    products: [],
  },
  riftbound: {
    slug: "riftbound",
    name: "Riftbound",
    tagline: "League of Legends champions on the tabletop.",
    blurb: "Riftbound singles, decks, and sealed releases from the League of Legends trading card game, organised by set.",
    highlights: ["Champion decks", "Booster packs", "Sealed displays", "New releases"],
    theme: "riftbound",
    products: [],
  },
  digimon: {
    slug: "digimon",
    name: "Digimon",
    tagline: "Tamer decks, alternate arts, and booster sets.",
    blurb: "Explore Digimon Card Game releases, singles, and sealed products with clear set codes and variant choices.",
    highlights: ["Alternate arts", "Booster boxes", "Starter decks", "Tamers"],
    theme: "digimon",
    products: [],
  },
  cyberpunk: {
    slug: "cyberpunk",
    name: "Cyberpunk",
    tagline: "Chrome, crews, and cards from Night City.",
    blurb: "A dedicated category for Cyberpunk card products, upcoming releases, and collector items.",
    highlights: ["Starter products", "Booster releases", "Collector cards", "Upcoming"],
    theme: "cyberpunk",
    products: [],
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

export type ShopProduct = CategoryProduct & {
  game: string;
  gameName: string;
  theme: BoxTheme;
  description?: string;
  productType?: string;
  condition?: string;
  language?: string;
  finish?: string;
  cardNumber?: string;
  rarity?: string;
  setCode?: string;
  trailerUrl?: string;
  releaseDate?: string;
  preorder?: boolean;
  illustrator?: string;
  gradingCompany?: string;
  grade?: string;
  certificationNumber?: string;
  shipsFrom?: string;
  stock?: number;
  variantId?: string;
  sku?: string;
  variants?: ShopVariant[];
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
