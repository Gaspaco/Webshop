type FinishableVariant = {
  name?: string;
  finish?: string;
};

export function variantRarity(variant?: FinishableVariant) {
  return variant?.finish?.trim() || variant?.name?.split("·")[1]?.trim() || undefined;
}
