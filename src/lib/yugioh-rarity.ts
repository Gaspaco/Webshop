export type YugiohFoilKind =
  | "rare"
  | "super"
  | "ultra"
  | "secret"
  | "prismatic"
  | "platinum"
  | "gold"
  | "ultimate"
  | "collector"
  | "starlight"
  | "quarter"
  | "ghost";

export function yugiohFoilKind(rarity: string | undefined): YugiohFoilKind | undefined {
  const value = rarity?.trim().toLocaleLowerCase("en-US") ?? "";
  if (!value || value.includes("common") || value === "unspecified") return;
  if (value.includes("quarter century")) return "quarter";
  if (value.includes("starlight")) return "starlight";
  if (value.includes("platinum")) return "platinum";
  if (value.includes("prismatic")) return "prismatic";
  if (value.includes("collector")) return "collector";
  if (value.includes("ultimate")) return "ultimate";
  if (value.includes("ghost")) return "ghost";
  if (value.includes("gold")) return "gold";
  if (value.includes("secret")) return "secret";
  if (value.includes("ultra")) return "ultra";
  if (value.includes("super")) return "super";
  if (value.includes("rare")) return "rare";
}
