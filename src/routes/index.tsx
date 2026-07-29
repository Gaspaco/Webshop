import { Title } from "@solidjs/meta";
import { createSignal, onMount, Show } from "solid-js";
import AboutHaven from "~/components/home/AboutHaven";
import HavenBand from "~/components/home/HavenBand";
import Hero from "~/components/home/Hero";
import ShopByGame from "~/components/home/ShopByGame";
import WeeklyShowcase from "~/components/home/WeeklyShowcase";
import ProductSection, { type SectionProduct } from "~/components/product/ProductSection";
import styles from "./home.module.scss";

type HomeContent = {
  announcement?: string;
  heroTitle?: string;
  heroCopy?: string;
};

const NEW_ARRIVALS: SectionProduct[] = [
  { id: "palkia-v-astral", name: "Palkia V", set: "Astral Radiance", image: "/images/cards/palkia.png", priceCents: 3495, href: "/products", badge: "New" },
  { id: "crystal-revenge-box", name: "Yu-Gi-Oh! Battles of Legend: Crystal Revenge Booster Box", theme: "yugioh", priceRangeCents: [795, 8995], href: "/products", badge: "New" },
  { id: "venusaur-base", name: "Venusaur", set: "Base Set", image: "/images/cards/venusaur.png", priceCents: 6995, href: "/products" },
  { id: "rayquaza-vmax-st", name: "Rayquaza VMAX", set: "Silver Tempest", image: "/images/cards/rayquaza.png", priceCents: 15995, href: "/products", badge: "New" },
  { id: "bloomburrow-box", name: "Magic: The Gathering Bloomburrow Set Booster Box", theme: "magic", priceRangeCents: [595, 13995], href: "/products", badge: "New" },
  { id: "blastoise-base", name: "Blastoise", set: "Base Set", image: "/images/cards/blastoise.png", priceCents: 11995, href: "/products" },
  { id: "mewtwo-base", name: "Mewtwo", set: "Base Set", image: "/images/cards/mewtwo.png", priceCents: 8995, href: "/products" },
  { id: "charizard-base", name: "Charizard", set: "Base Set", image: "/images/cards/charizard.png", priceCents: 24995, href: "/products", badge: "Vintage" },
];

export default function Home() {
  const [content, setContent] = createSignal<HomeContent>({});

  onMount(async () => {
    try {
      const response = await fetch("/api/storefront/content");
      if (!response.ok) return;
      const result = (await response.json()) as {
        content: HomeContent | null;
      };
      setContent(result.content ?? {});
    } catch {
      // The designed defaults stay visible if managed content is unavailable.
    }
  });

  return (
    <main>
      <Title>TCGHaven | Your Favorite Card Store, Online</Title>
      <Show when={content().announcement}>
        <div class={styles.announcement}>{content().announcement}</div>
      </Show>
      <Hero
        managedTitle={content().heroTitle}
        managedCopy={content().heroCopy}
      />
      <ShopByGame />
      <WeeklyShowcase />
      <ProductSection heading="New arrivals" sub="Fresh stock, added this week." products={NEW_ARRIVALS} />
      <AboutHaven />
      <HavenBand />
    </main>
  );
}
