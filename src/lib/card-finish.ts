export type CardFinish =
  | "common"
  | "rare"
  | "super"
  | "ultra"
  | "secret"
  | "ultimate"
  | "ghost"
  | "collectors"
  | "gold"
  | "prismatic"
  | "starlight"
  | "quarter-century"
  | "platinum"
  | "mosaic"
  | "shatterfoil"
  | "starfoil"
  | "parallel";

type FinishableCard = {
  game?: string;
  finish?: string;
  rarity?: string;
};

type FinishableVariant = {
  name?: string;
  finish?: string;
};

export function variantRarity(variant?: FinishableVariant) {
  return variant?.finish?.trim() || variant?.name?.split("·")[1]?.trim() || undefined;
}

/** Map YGOPRODeck and manually entered rarity names to visual materials. */
export function cardFinishFor(
  product: FinishableCard,
  variant?: FinishableVariant,
): CardFinish | undefined {
  if (product.game !== "yugioh") return undefined;

  const rarity = (
    variantRarity(variant) ??
    product.finish ??
    product.rarity ??
    ""
  ).toLowerCase();

  if (!rarity) return undefined;
  // Keep these checks specific and ordered. Several names also include "Secret
  // Rare" or "Rare", but their physical foils are visibly different.
  if (/quarter century/.test(rarity)) return "quarter-century";
  if (/starlight/.test(rarity)) return "starlight";
  if (/platinum/.test(rarity)) return "platinum";
  if (/shatterfoil/.test(rarity)) return "shatterfoil";
  if (/starfoil/.test(rarity)) return "starfoil";
  if (/mosaic/.test(rarity)) return "mosaic";
  if (/parallel/.test(rarity)) return "parallel";
  if (/prismatic/.test(rarity)) return "prismatic";
  if (/ghost/.test(rarity)) return "ghost";
  if (/collector/.test(rarity)) return "collectors";
  if (/ultimate/.test(rarity)) return "ultimate";
  if (/gold/.test(rarity)) return "gold";
  if (/secret/.test(rarity)) return "secret";
  if (/ultra/.test(rarity)) return "ultra";
  if (/super/.test(rarity)) return "super";
  if (/rare/.test(rarity)) return "rare";
  return "common";
}
