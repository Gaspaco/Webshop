import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { and, asc, eq, ilike, inArray, sql } from "drizzle-orm";
import sharp from "sharp";
import { yugipediaPrintingImagePath } from "../src/lib/yugipedia-image";

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
const catalogue = args.has("--catalogue");
const upload = args.has("--upload");
const refresh = args.has("--refresh");
const requestedLimit = Number(args.get("--limit") ?? 10);
const cardLimit = Number.isInteger(requestedLimit)
  ? Math.max(1, Math.min(requestedLimit, 500))
  : 10;
const requestedOffset = Number(args.get("--offset") ?? 0);
const cardOffset = Number.isInteger(requestedOffset)
  ? Math.max(0, requestedOffset)
  : 0;

if (!cardQuery && !setQuery && !catalogue) {
  throw new Error(
    "Choose a bounded sync: --card=\"Dark Magician\", --set=\"Rarity Collection 5\", or --catalogue. Use --limit=N (maximum 500) and --offset=N.",
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

function cachePath(namespace: string, key: string) {
  return resolve(CACHE_ROOT, namespace, `${safeCacheName(key)}.json`);
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
  const path = cachePath(namespace, key);
  if (!refresh && await fileIsFresh(path)) {
    return JSON.parse(await readFile(path, "utf8")) as T;
  }

  const value = await load();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value), "utf8");
  return value;
}

async function apiRequest<T>(params: Record<string, string>) {
  const url = new URL(API_URL);
  for (const [key, value] of Object.entries({
    format: "json",
    formatversion: "2",
    ...params,
  })) {
    url.searchParams.set(key, value);
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    await waitForRequestSlot();
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) return await response.json() as T;

      const temporary = response.status === 429 || response.status >= 500;
      if (!temporary || attempt === 3) {
        throw new Error(`Yugipedia returned ${response.status}.`);
      }

      const retryAfter = Number(response.headers.get("retry-after") ?? 0) * 1_000;
      const backoff = Math.max(retryAfter, 2_000 * 2 ** attempt);
      console.warn(
        `Yugipedia returned ${response.status}; retrying in ${Math.ceil(backoff / 1_000)}s.`,
      );
      await new Promise(resolveDelay => setTimeout(resolveDelay, backoff));
    } catch (error) {
      if (attempt === 3 || (error instanceof Error && error.message.startsWith("Yugipedia returned"))) {
        throw error;
      }
      const backoff = 2_000 * 2 ** attempt;
      console.warn(
        `Yugipedia request failed; retrying in ${Math.ceil(backoff / 1_000)}s.`,
      );
      await new Promise(resolveDelay => setTimeout(resolveDelay, backoff));
    }
  }

  throw new Error("Yugipedia request failed after four attempts.");
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

function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function normalizedFileName(value: string) {
  return value
    .replace(/^File:/i, "")
    .replace(/_/g, " ")
    .trim()
    .toLocaleLowerCase("en");
}

async function imageInfoBatch(fileNames: string[]) {
  const result = new Map<string, ImageInfo | null>();
  const missing: string[] = [];

  for (const fileName of [...new Set(fileNames)]) {
    const path = cachePath("files", fileName);
    if (!refresh && await fileIsFresh(path)) {
      result.set(fileName, JSON.parse(await readFile(path, "utf8")) as ImageInfo | null);
    } else {
      missing.push(fileName);
    }
  }

  for (const batch of chunks(missing, 50)) {
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
      titles: batch.map(fileName => `File:${fileName}`).join("|"),
    });
    const pages = new Map(
      (payload.query?.pages ?? []).map(page => [normalizedFileName(page.title), page]),
    );

    for (const fileName of batch) {
      const page = pages.get(normalizedFileName(fileName));
      const info = page?.imageinfo?.[0];
      const value = page?.fullurl && info?.url && info.mime?.startsWith("image/")
        ? {
            fileName,
            sourceUrl: info.url,
            sourcePageUrl: page.fullurl,
            mime: info.mime,
            width: info.width ?? 0,
            height: info.height ?? 0,
            size: info.size ?? 0,
          }
        : null;
      const path = cachePath("files", fileName);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, JSON.stringify(value), "utf8");
      result.set(fileName, value);
    }
  }

  return result;
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
const { productVariants, products, yugiohCards, yugiohPrintings } = schema;

const catalogueCardIds = catalogue
  ? (await db
      .select({ metadata: products.metadata })
      .from(products)
      .where(sql`${products.metadata}->>'source' = 'ygoprodeck'`))
      .map(row => Number(row.metadata.sourceCardId))
      .filter((value): value is number => Number.isInteger(value) && value > 0)
  : [];

if (catalogue && !catalogueCardIds.length) {
  throw new Error("No imported Yu-Gi-Oh catalogue products were found.");
}

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
    catalogue ? inArray(yugiohPrintings.cardId, catalogueCardIds) : undefined,
  ))
  .orderBy(asc(yugiohCards.name), asc(yugiohPrintings.setName), asc(yugiohPrintings.rarity));

const encounteredCardIds = new Set<number>();
const selectedCardIds = new Set<number>();
const selected = rows.filter(row => {
  if (selectedCardIds.has(row.cardId)) return true;
  if (encounteredCardIds.has(row.cardId)) return false;
  encounteredCardIds.add(row.cardId);
  if (encounteredCardIds.size <= cardOffset) return false;
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
let updatedProducts = 0;

type MatchedPrinting = Printing & { storefrontUrl: string };

async function updateCatalogueProduct(
  cardId: number,
  matchedPrintings: MatchedPrinting[],
) {
  if (!matchedPrintings.length) return false;

  const [product] = await db
    .select({
      id: products.id,
      metadata: products.metadata,
    })
    .from(products)
    .where(sql`${products.metadata}->>'sourceCardId' = ${String(cardId)}`)
    .limit(1);
  if (!product) return false;

  for (const printing of matchedPrintings) {
    await db
      .update(productVariants)
      .set({ imageUrl: printing.storefrontUrl })
      .where(and(
        eq(productVariants.productId, product.id),
        eq(
          productVariants.name,
          `${printing.setName} · ${printing.rarity}`.slice(0, 120),
        ),
      ));
  }

  await db
    .update(products)
    .set({
      imageUrls: [matchedPrintings[0]!.storefrontUrl],
      metadata: {
        ...product.metadata,
        imageProvider: "yugipedia",
        printingImageProvider: "yugipedia",
      },
    })
    .where(eq(products.id, product.id));
  return true;
}

for (const printings of byCard.values()) {
  const cardName = printings[0]!.cardName;
  const fileNames = await cardImageFileNames(cardName);
  const matchedFiles = printings.map(printing => ({
    printing,
    fileName: matchFile(printing, fileNames),
  }));
  const infoByFile = await imageInfoBatch(
    matchedFiles
      .map(match => match.fileName)
      .filter((value): value is string => Boolean(value)),
  );
  const catalogueMatches: MatchedPrinting[] = [];

  for (const { printing, fileName } of matchedFiles) {
    if (!fileName) {
      unmatched += 1;
      continue;
    }

    const info = infoByFile.get(fileName);
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
    catalogueMatches.push({
      ...printing,
      storefrontUrl: storageUrl ?? yugipediaPrintingImagePath(printing.id),
    });
  }

  if (await updateCatalogueProduct(printings[0]!.cardId, catalogueMatches)) {
    updatedProducts += 1;
  }

  console.log(`${cardName}: ${fileNames.length} curated scan${fileNames.length === 1 ? "" : "s"} inspected.`);
}

console.log(
  `Yugipedia enrichment complete: ${matched} printing matches, ${uploaded} optimized R2 uploads, ${updatedProducts} catalogue products updated, ${unmatched} unmatched printings.`,
);
if (!upload) {
  console.log(
    "Images are served through the first-party 30-day cache route. Configure authorized R2 upload later for permanent object storage.",
  );
}
