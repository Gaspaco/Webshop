export type YugipediaPrintingMatch = {
  cardName: string;
  setCode: string;
  rarity: string;
  rarityCode?: string | null;
};

const RARITY_ALIASES: Array<[RegExp, string[]]> = [
  [/10000 secret/i, ["10000SCR"]],
  [/quarter century secret/i, ["QCSCR", "QCSR"]],
  [/platinum secret/i, ["PSCR", "PS"]],
  [/prismatic secret/i, ["PSCR"]],
  [/starlight/i, ["STR"]],
  [/gold secret/i, ["GSCR"]],
  [/ghost\s*\/\s*gold/i, ["GGR"]],
  [/premium gold/i, ["PG", "PGR"]],
  [/gold rare/i, ["GUR"]],
  [/ghost rare/i, ["GR", "GHR"]],
  [/ultimate rare/i, ["UTR"]],
  [/ultra secret/i, ["USCR"]],
  [/secret rare/i, ["SCR"]],
  [/ultra parallel/i, ["UPR"]],
  [/super parallel/i, ["SPR"]],
  [/normal parallel/i, ["NPR"]],
  [/duel terminal ultra parallel/i, ["DUPR"]],
  [/duel terminal super parallel/i, ["DSPR"]],
  [/duel terminal rare parallel/i, ["DRPR"]],
  [/duel terminal normal parallel/i, ["DNPR"]],
  [/mosaic rare/i, ["MSR"]],
  [/shatterfoil rare/i, ["SHR"]],
  [/starfoil rare|starfoil/i, ["SFR"]],
  [/platinum rare/i, ["PIR"]],
  [/collector'?s rare/i, ["CR"]],
  [/ultra rare/i, ["UR"]],
  [/super rare/i, ["SR"]],
  [/rare/i, ["R"]],
  [/common/i, ["C"]],
];

export function normalizedYugipediaToken(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

export function yugipediaCardFilePrefix(cardName: string) {
  return cardName
    .normalize("NFKC")
    .replace(/[\s#,.:'"?!&@%=\[\]<>/☆★・-]+/gu, "");
}

export function yugipediaFileCardPrefix(fileName: string) {
  return fileName.replace(/^File:/i, "").split("-")[0]?.trim() ?? "";
}

export function parseInfoboxImageFileNames(wikitext: string) {
  const imageBlock = wikitext.match(
    /\|\s*image\s*=([\s\S]*?)(?=\n\s*\|\s*[a-z_]+\s*=)/i,
  )?.[1] ?? "";
  const numberedImages = [...imageBlock.matchAll(
    /(?:^|\n)\s*\d+\s*;\s*([^;\n]+\.(?:png|jpe?g|webp))/gi,
  )]
    .map(match => match[1]?.trim())
    .filter((value): value is string => Boolean(value));
  if (numberedImages.length) return [...new Set(numberedImages)];

  const singleImage = imageBlock
    .trim()
    .match(/^([^;\n]+\.(?:png|jpe?g|webp))$/i)?.[1]
    ?.trim();
  return singleImage ? [singleImage] : [];
}

function setToken(setCode: string) {
  return normalizedYugipediaToken(setCode.split("-")[0] ?? "");
}

function rarityTokens(rarity: string, rarityCode?: string | null) {
  const explicit = rarityCode ? normalizedYugipediaToken(rarityCode) : "";
  const aliases = RARITY_ALIASES.find(([pattern]) => pattern.test(rarity))?.[1] ?? [];
  return [...new Set([explicit, ...aliases].filter(Boolean))];
}

function fileSegments(fileName: string) {
  return fileName
    .replace(/^File:/i, "")
    .replace(/\.(?:png|jpe?g|webp)$/i, "")
    .split("-")
    .map(normalizedYugipediaToken)
    .filter(Boolean);
}

export function isExactCardImageFile(cardName: string, fileName: string) {
  if (!/\.(?:png|jpe?g|webp)$/i.test(fileName)) return false;
  return normalizedYugipediaToken(yugipediaFileCardPrefix(fileName)) ===
    normalizedYugipediaToken(yugipediaCardFilePrefix(cardName));
}

export function matchYugipediaPrintingFile(
  printing: YugipediaPrintingMatch,
  fileNames: string[],
) {
  const set = setToken(printing.setCode);
  if (!set) return null;

  const rarity = rarityTokens(printing.rarity, printing.rarityCode);
  if (!rarity.length) return null;

  const cardFiles = fileNames.filter(fileName =>
    isExactCardImageFile(printing.cardName, fileName),
  );
  const setMatches = cardFiles.filter(fileName =>
    fileSegments(fileName).includes(set),
  );
  if (!setMatches.length) return null;

  const language = printing.setCode
    .split("-")[1]
    ?.match(/^[a-z]{2}/i)?.[0]
    ?.toUpperCase();
  const languageMatches = language
    ? setMatches.filter(fileName => fileSegments(fileName).includes(language))
    : [];
  const candidates = languageMatches.length ? languageMatches : setMatches;
  const exact = candidates.filter(fileName => {
    const segments = fileSegments(fileName);
    return rarity.some(token => segments.includes(token));
  });
  if (!exact.length) return null;

  // YGOPRODeck does not distinguish first-edition from unlimited variants.
  // Prefer the first-edition scan deterministically when Yugipedia has both.
  return exact.find(fileName => fileSegments(fileName).includes("1E")) ??
    (exact.length === 1 ? exact[0]! : exact.sort()[0]!);
}
