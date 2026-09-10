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
  | "prismatic";

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
  if (/quarter century|starlight|prismatic|platinum|mosaic|shatterfoil|starfoil|parallel/.test(rarity)) return "prismatic";
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
