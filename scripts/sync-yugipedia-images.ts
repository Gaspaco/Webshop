import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { and, asc, eq, ilike } from "drizzle-orm";
import sharp from "sharp";

const API_URL = "https://yugipedia.com/api.php";
const CACHE_ROOT = resolve(".cache/yugipedia");
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const REQUEST_INTERVAL_MS = 1_100;

for (const envPath of [".env.development.local", ".env.local"]) {
  try {
    process.loadEnvFile(envPath);
  } catch {
    // Local environment files are optional.
  }
}

const USER_AGENT = `TCGHaven printing-image sync (${process.env.YUGIPEDIA_CONTACT_EMAIL ?? "info@tcghaven.com"})`;

type ImageInfo = {
  fileName: string;
  sourceUrl: string;
  sourcePageUrl: string;
  mime: string;
  width: number;
  height: number;
  size: number;
};

type Printing = {
  id: string;
  cardId: number;
  cardName: string;
  setName: string;
  setCode: string;
  rarity: string;
};

const args = new Map(
  process.argv.slice(2).map(argument => {
    const [key, ...value] = argument.split("=");
    return [key, value.join("=") || "true"];
  }),
);
const cardQuery = args.get("--card")?.trim();
const setQuery = args.get("--set")?.trim();
const upload = args.has("--upload");
const refresh = args.has("--refresh");
const requestedLimit = Number(args.get("--limit") ?? 10);
const cardLimit = Number.isInteger(requestedLimit)
  ? Math.max(1, Math.min(requestedLimit, 50))
  : 10;

if (!cardQuery && !setQuery) {
  throw new Error(
    "Choose a bounded sync: --card=\"Dark Magician\" or --set=\"Rarity Collection 5\". Use --limit=N (maximum 50).",
  );
}

if (upload && process.env.YUGIPEDIA_IMAGE_USE_AUTHORIZED !== "true") {
  throw new Error(
    "Image upload is locked. Obtain written commercial-use/rehosting permission, then set YUGIPEDIA_IMAGE_USE_AUTHORIZED=true.",
  );
}

let lastRequestAt = 0;

async function waitForRequestSlot() {
  const delay = Math.max(0, REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt));
  if (delay) await new Promise(resolveDelay => setTimeout(resolveDelay, delay));
  lastRequestAt = Date.now();
}

function safeCacheName(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function fileIsFresh(path: string) {
  try {
    const details = await stat(path);
    return Date.now() - details.mtimeMs < CACHE_TTL_MS;
  } catch {
    return false;
  }
}

async function cachedJson<T>(namespace: string, key: string, load: () => Promise<T>) {
  const path = resolve(CACHE_ROOT, namespace, `${safeCacheName(key)}.json`);
  if (!refresh && await fileIsFresh(path)) {
    return JSON.parse(await readFile(path, "utf8")) as T;
  }

  const value = await load();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value), "utf8");
  return value;
}

async function apiRequest<T>(params: Record<string, string>) {
  await waitForRequestSlot();

  const url = new URL(API_URL);
  for (const [key, value] of Object.entries({
    format: "json",
    formatversion: "2",
    ...params,
  })) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Yugipedia returned ${response.status}. The sync stopped without retrying.`);
  }
  return await response.json() as T;
}

async function cardImageFileNames(cardName: string) {
  const payload = await cachedJson<{
    parse?: { title?: string; wikitext?: string };
    error?: { info?: string };
  }>("pages", cardName, () => apiRequest({
    action: "parse",
    page: cardName,
    prop: "wikitext",
  }));

  if (!payload.parse?.wikitext) {
    console.warn(`No Yugipedia page was found for ${cardName}: ${payload.error?.info ?? "unknown response"}`);
    return [];
  }

  const imageBlock = payload.parse.wikitext.match(
    /\|\s*image\s*=([\s\S]*?)(?=\n\s*\|\s*[a-z_]+\s*=)/i,
  )?.[1] ?? "";
  const numberedImages = [...imageBlock.matchAll(/(?:^|\n)\s*\d+\s*;\s*([^;\n]+\.(?:png|jpe?g|webp))/gi)]
    .map(match => match[1]?.trim())
    .filter((value): value is string => Boolean(value));
  if (numberedImages.length) return [...new Set(numberedImages)];

  const singleImage = imageBlock.trim().match(/^([^;\n]+\.(?:png|jpe?g|webp))$/i)?.[1]?.trim();
  return singleImage ? [singleImage] : [];
}

async function imageInfo(fileName: string) {
  return cachedJson<ImageInfo | null>("files", fileName, async () => {
    const payload = await apiRequest<{
      query?: { pages?: Array<{
        title: string;
        fullurl?: string;
        imageinfo?: Array<{
          url?: string;
          mime?: string;
          width?: number;
          height?: number;
          size?: number;
        }>;
      }> };
    }>({
      action: "query",
      prop: "imageinfo|info",
      inprop: "url",
      iiprop: "url|mime|size",
      titles: `File:${fileName}`,
    });
    const page = payload.query?.pages?.[0];
    const info = page?.imageinfo?.[0];
    if (!page?.fullurl || !info?.url || !info.mime?.startsWith("image/")) return null;
    return {
      fileName,
      sourceUrl: info.url,
      sourcePageUrl: page.fullurl,
      mime: info.mime,
      width: info.width ?? 0,
      height: info.height ?? 0,
      size: info.size ?? 0,
    };
  });
}

function setToken(setCode: string) {
  return setCode.split("-")[0]?.replace(/[^a-z0-9]/gi, "").toUpperCase() ?? "";
}

function rarityTokens(rarity: string) {
  const value = rarity.toLowerCase();
  if (value.includes("quarter century")) return ["QCSCR", "QCSR"];
  if (value.includes("platinum secret")) return ["PLSCR"];
  if (value.includes("prismatic secret")) return ["PSCR"];
  if (value.includes("starlight")) return ["STR"];
  if (value.includes("gold secret")) return ["GSCR"];
  if (value.includes("premium gold")) return ["PGR"];
  if (value.includes("ghost")) return ["GHR", "GR"];
  if (value.includes("ultimate")) return ["UTR"];
  if (value.includes("secret")) return ["SCR"];
  if (value.includes("ultra")) return ["UR"];
  if (value.includes("super")) return ["SR"];
  if (value.includes("rare")) return ["R"];
  if (value.includes("common")) return ["C"];
  return [];
}

function fileSegments(fileName: string) {
  return fileName
    .replace(/\.(?:png|jpe?g|webp)$/i, "")
    .split("-")
    .map(segment => segment.replace(/[^a-z0-9]/gi, "").toUpperCase())
    .filter(Boolean);
}

function matchFile(printing: Printing, fileNames: string[]) {
  const set = setToken(printing.setCode);
  const rarity = rarityTokens(printing.rarity);
  const setMatches = fileNames.filter(fileName => fileSegments(fileName).includes(set));
  if (!setMatches.length) return null;

  const language = printing.setCode
    .split("-")[1]
    ?.match(/^[a-z]{2}/i)?.[0]
    ?.toUpperCase();
  const sameLanguage = language
    ? setMatches.filter(fileName => fileSegments(fileName).includes(language))
    : [];
  const candidates = sameLanguage.length ? sameLanguage : setMatches;
  const exact = candidates.find(fileName => {
    const segments = fileSegments(fileName);
    return rarity.some(token => segments.includes(token));
  });
  // A set-only match is safe only if the page exposes a single scan for that
  // set. Never guess between alternate arts or rarities.
  return exact ?? (candidates.length === 1 ? candidates[0]! : null);
}

function r2Client() {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET?.trim();
  const publicUrl = process.env.R2_PUBLIC_URL?.trim().replace(/\/$/, "");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    throw new Error(
      "--upload requires R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, and R2_PUBLIC_URL.",
    );
  }
  return {
    bucket,
    publicUrl,
    client: new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
}

async function storeImage(info: ImageInfo) {
  const source = new URL(info.sourceUrl);
  if (
    source.protocol !== "https:" ||
    !(source.hostname === "yugipedia.com" || source.hostname.endsWith(".yugipedia.com"))
  ) {
    throw new Error(`Refusing an unexpected Yugipedia image host: ${source.hostname}`);
  }

  await waitForRequestSlot();
  const response = await fetch(source, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`Image download returned ${response.status}.`);
  const input = Buffer.from(await response.arrayBuffer());
  if (input.byteLength > 12_000_000) throw new Error("Image exceeds the 12 MB safety limit.");

  const optimized = await sharp(input)
    .rotate()
    .resize({ width: 900, height: 1320, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 86, effort: 5 })
    .toBuffer();
  const digest = createHash("sha256").update(optimized).digest("hex").slice(0, 24);
  const key = `products/yugioh/${digest}.webp`;
  const r2 = r2Client();
  await r2.client.send(new PutObjectCommand({
    Bucket: r2.bucket,
    Key: key,
    Body: optimized,
    ContentType: "image/webp",
    CacheControl: "public, max-age=31536000, immutable",
  }));
  return `${r2.publicUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

const [{ db }, schema] = await Promise.all([
  import("../src/db/index"),
  import("../src/db/schema"),
]);
const { yugiohCards, yugiohPrintings } = schema;

const rows = await db
  .select({
    id: yugiohPrintings.id,
    cardId: yugiohPrintings.cardId,
    cardName: yugiohCards.name,
    setName: yugiohPrintings.setName,
    setCode: yugiohPrintings.setCode,
    rarity: yugiohPrintings.rarity,
  })
  .from(yugiohPrintings)
  .innerJoin(yugiohCards, eq(yugiohPrintings.cardId, yugiohCards.id))
  .where(and(
    cardQuery ? ilike(yugiohCards.name, `%${cardQuery}%`) : undefined,
    setQuery ? ilike(yugiohPrintings.setName, `%${setQuery}%`) : undefined,
  ))
  .orderBy(asc(yugiohCards.name), asc(yugiohPrintings.setName), asc(yugiohPrintings.rarity));

const selectedCardIds = new Set<number>();
const selected = rows.filter(row => {
  if (selectedCardIds.has(row.cardId)) return true;
  if (selectedCardIds.size >= cardLimit) return false;
  selectedCardIds.add(row.cardId);
  return true;
});

if (!selected.length) throw new Error("No local Yu-Gi-Oh printings matched that search.");

const byCard = new Map<number, Printing[]>();
for (const row of selected) {
  const printings = byCard.get(row.cardId) ?? [];
  printings.push(row);
  byCard.set(row.cardId, printings);
}

let matched = 0;
let uploaded = 0;
let unmatched = 0;

for (const printings of byCard.values()) {
  const cardName = printings[0]!.cardName;
  const fileNames = await cardImageFileNames(cardName);
  const infoByFile = new Map<string, ImageInfo | null>();

  for (const printing of printings) {
    const fileName = matchFile(printing, fileNames);
    if (!fileName) {
      unmatched += 1;
      continue;
    }

    let info = infoByFile.get(fileName);
    if (info === undefined) {
      info = await imageInfo(fileName);
      infoByFile.set(fileName, info);
    }
    if (!info) {
      unmatched += 1;
      continue;
    }

    const storageUrl = upload ? await storeImage(info) : null;
    await db
      .update(yugiohPrintings)
      .set({
        imageSourceUrl: info.sourceUrl,
        imageSourcePageUrl: info.sourcePageUrl,
        imageStorageUrl: storageUrl ?? undefined,
        imageFileName: info.fileName,
        imageProvider: "yugipedia",
        imageSyncedAt: new Date(),
      })
      .where(eq(yugiohPrintings.id, printing.id));
    matched += 1;
    if (storageUrl) uploaded += 1;
  }

  console.log(`${cardName}: ${fileNames.length} curated scan${fileNames.length === 1 ? "" : "s"} inspected.`);
}

console.log(
  `Yugipedia enrichment complete: ${matched} printing matches, ${uploaded} optimized R2 uploads, ${unmatched} unmatched printings.`,
);
if (!upload) {
  console.log(
    "Discovery only: source provenance was saved, but storefront images were not changed. Use --upload only after permission and R2 are configured.",
  );
}
