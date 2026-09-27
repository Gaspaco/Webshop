import type { ShopProduct } from "~/lib/categories";

export type GameIdentity = {
  code: string;
  descriptor: string;
  releaseCopy: string;
  accent: string;
  accentStrong: string;
  accentInk: string;
};

export const GAME_IDENTITIES: Record<string, GameIdentity> = {
  pokemon: {
    code: "PKM",
    descriptor: "Vintage icons, modern chase cards, sealed sets, and graded slabs.",
    releaseCopy: "Pokémon expansions, restocks, and preorder windows.",
    accent: "#34d399",
    accentStrong: "#10b981",
    accentInk: "#04110b",
  },
  yugioh: {
    code: "YGO",
    descriptor: "Booster displays, structure decks, reprints, and competitive staples.",
    releaseCopy: "Yu-Gi-Oh! sets, reprints, and first-edition releases.",
    accent: "#c4b5fd",
    accentStrong: "#8b5cf6",
    accentInk: "#100817",
  },
  magic: {
    code: "MTG",
    descriptor: "Commander decks, play boosters, collector boxes, and singles.",
    releaseCopy: "Magic releases across Commander, Standard, and collector products.",
    accent: "#fdba74",
    accentStrong: "#ea580c",
    accentInk: "#190901",
  },
  lorcana: {
    code: "LRC",
    descriptor: "Disney characters, enchanted cards, starter decks, and booster displays.",
    releaseCopy: "Lorcana expansions, starter products, and announced sets.",
    accent: "#d8b4fe",
    accentStrong: "#a855f7",
    accentInk: "#16051d",
  },
  riftbound: {
    code: "RFB",
    descriptor: "Champion decks, League of Legends sets, boosters, and sealed displays.",
    releaseCopy: "Riftbound champion decks and the next Runeterra releases.",
    accent: "#7dd3fc",
    accentStrong: "#0ea5e9",
    accentInk: "#03151d",
  },
  digimon: {
    code: "DGM",
    descriptor: "Tamer decks, alternate arts, booster sets, and collector cards.",
    releaseCopy: "Digimon booster sets, decks, and scheduled releases.",
    accent: "#93c5fd",
    accentStrong: "#3b82f6",
    accentInk: "#061126",
  },
  cyberpunk: {
    code: "CPK",
    descriptor: "Night City releases, sealed products, and collector cards.",
    releaseCopy: "Cyberpunk products and announced releases from Night City.",
    accent: "#fde047",
    accentStrong: "#eab308",
    accentInk: "#171202",
  },
};

export const DEFAULT_GAME_IDENTITY: GameIdentity = {
  code: "TCG",
  descriptor: "Singles, sealed products, and upcoming releases.",
  releaseCopy: "Announced products and preorder windows.",
  accent: "#34d399",
  accentStrong: "#10b981",
  accentInk: "#04110b",
};

export function getGameIdentity(slug: string) {
  return GAME_IDENTITIES[slug] ?? DEFAULT_GAME_IDENTITY;
}

export function releaseTime(product: Pick<ShopProduct, "releaseDate">) {
  if (!product.releaseDate) return 0;
  const time = Date.parse(`${product.releaseDate}T00:00:00Z`);
  return Number.isFinite(time) ? time : 0;
}

export function isActivePreorder(product: Pick<ShopProduct, "preorder" | "releaseDate">, now = Date.now()) {
  if (!product.preorder) return false;
  const time = releaseTime(product);
  return time > now;
}

export function isUpcoming(product: ShopProduct, now = Date.now()) {
  const time = releaseTime(product);
  return time > 0 && time > now;
}

export function formatReleaseCountdown(
  product: Pick<ShopProduct, "releaseDate">,
  now = Date.now(),
) {
  const remaining = releaseTime(product) - now;
  if (remaining <= 0) return "";

  const totalMinutes = Math.ceil(remaining / 60_000);
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
}

export function formatReleaseDate(value?: string) {
  if (!value) return "Date to be announced";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "Date to be announced";
  return new Intl.DateTimeFormat("en-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function setPathSegment(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export type GameSetGroup = {
  name: string;
  code?: string;
  count: number;
  path: string;
};

export function groupProductsBySet(products: ShopProduct[]): GameSetGroup[] {
  const grouped = new Map<string, GameSetGroup>();
  for (const product of products) {
    if (!product.set) continue;
    const current = grouped.get(product.set);
    grouped.set(product.set, {
      name: product.set,
      code: current?.code ?? product.setCode,
      count: (current?.count ?? 0) + 1,
      path: setPathSegment(product.set),
    });
  }
  return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name));
}
