import { Title } from "@solidjs/meta";
import Hero from "~/components/home/Hero";
import ShopByGame from "~/components/home/ShopByGame";
import ProductSection, { type SectionProduct } from "~/components/product/ProductSection";

const NEW_ARRIVALS: SectionProduct[] = [
  { id: "palkia-v-astral", name: "Palkia V", set: "Astral Radiance", image: "/images/cards/palkia.png", priceCents: 3495, href: "/products", badge: "New" },
  { id: "venusaur-base", name: "Venusaur", set: "Base Set", image: "/images/cards/venusaur.png", priceCents: 6995, href: "/products" },
  { id: "rayquaza-vmax-st", name: "Rayquaza VMAX", set: "Silver Tempest", image: "/images/cards/rayquaza.png", priceCents: 15995, href: "/products", badge: "New" },
  { id: "blastoise-base", name: "Blastoise", set: "Base Set", image: "/images/cards/blastoise.png", priceCents: 11995, href: "/products" },
  { id: "mewtwo-base", name: "Mewtwo", set: "Base Set", image: "/images/cards/mewtwo.png", priceCents: 8995, href: "/products" },
  { id: "charizard-base", name: "Charizard", set: "Base Set", image: "/images/cards/charizard.png", priceCents: 24995, href: "/products", badge: "Vintage" },
];

const BESTSELLERS: SectionProduct[] = [
  { id: "chaos-origins-box", name: "Chaos Origins Booster Box", theme: "pokemon", priceRangeCents: [595, 12995], href: "/products" },
  { id: "commander-mtg-tmnt", name: "Commander: Magic: The Gathering", set: "Teenage Mutant Ninja Turtles", theme: "magic", priceCents: 6995, href: "/products" },
  { id: "mega-dream-ex-jp", name: "Pokémon: Mega Dream EX Booster Box", set: "Japanese", theme: "pokemon", priceRangeCents: [1695, 15995], href: "/products" },
  { id: "unleashed-box-cn", name: "Unleashed Booster Box", set: "Chinese, Jumbo", theme: "yugioh", priceRangeCents: [695, 7995], href: "/products" },
  { id: "foundations-play-box", name: "Magic: The Gathering Foundations Play Booster Box", theme: "magic", priceRangeCents: [495, 14995], href: "/products" },
];

const RANDOM_PICKS: SectionProduct[] = [
  { id: "mega-dream-ex-kr", name: "Pokémon: Mega Dream EX Booster Box", set: "Korean", theme: "pokemon", priceRangeCents: [795, 7995], href: "/products" },
  { id: "legendary-battles-gallery", name: "Legendary Battles: Glorious Gallery Expansion Box", theme: "pokemon", priceRangeCents: [395, 7995], href: "/products" },
  { id: "mega-dream-ex-jp-2", name: "Pokémon: Mega Dream EX Booster Box", set: "Japanese", theme: "pokemon", priceRangeCents: [1695, 15995], href: "/products" },
  { id: "abyss-eye-box", name: "Pokémon: Abyss Eye Booster Box", theme: "pokemon", priceRangeCents: [495, 11995], rating: 4, href: "/products" },
  { id: "commander-final-fantasy", name: "Commander: Magic: The Gathering", set: "Final Fantasy Deck Set", theme: "magic", priceRangeCents: [5995, 21995], href: "/products" },
];

const PREORDERS: SectionProduct[] = [
  { id: "mega-evolution-box", name: "Pokémon: Mega Evolution Booster Box", theme: "pokemon", priceRangeCents: [1495, 14995], href: "/products", badge: "Preorder" },
  { id: "spiderman-collector-box", name: "Magic: The Gathering Marvel's Spider-Man Collector Booster Box", theme: "magic", priceRangeCents: [2495, 24995], href: "/products", badge: "Preorder" },
  { id: "yugioh-25th-rarity", name: "Yu-Gi-Oh! 25th Anniversary Rarity Collection", theme: "yugioh", priceRangeCents: [395, 8995], href: "/products", badge: "Preorder" },
];

const MOST_POPULAR: SectionProduct[] = [
  { id: "charizard-base-set-pop", name: "Charizard", set: "Base Set", image: "/images/cards/charizard.png", priceCents: 24995, rating: 5, href: "/products" },
  { id: "umbreon-vmax-pop", name: "Umbreon VMAX Alt Art", image: "/images/cards/umbreon.png", priceCents: 18995, rating: 5, href: "/products" },
  { id: "pikachu-pop", name: "Pikachu", set: "Crown Zenith", image: "/images/cards/pikachu.png", priceCents: 2495, rating: 4, href: "/products" },
  { id: "mewtwo-pop", name: "Mewtwo", set: "Base Set", image: "/images/cards/mewtwo.png", priceCents: 8995, rating: 5, href: "/products" },
  { id: "blastoise-pop", name: "Blastoise", set: "Base Set", image: "/images/cards/blastoise.png", priceCents: 11995, rating: 4, href: "/products" },
];

export default function Home() {
  return (
    <main>
      <Title>TCGHaven — Your Favorite Card Store, Online</Title>
      <Hero />
      <ShopByGame />
      <ProductSection heading="New arrivals" sub="Fresh stock, added this week." products={NEW_ARRIVALS} />
      <ProductSection heading="Bestsellers" sub="What everyone's buying right now." products={BESTSELLERS} />
      <ProductSection heading="Random picks" sub="A few surprises worth a look." products={RANDOM_PICKS} />
      <ProductSection heading="Preorders" sub="Reserve yours before they land." products={PREORDERS} />
      <ProductSection heading="Most popular" sub="Fan favourites, week after week." products={MOST_POPULAR} />
    </main>
  );
}
