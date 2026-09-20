import type { APIEvent } from "@solidjs/start/server";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import { products, productVariants } from "~/db/schema";
import { apiJson, requireAdmin, toSlug, writeAuditLog } from "~/lib/admin.server";

const importCardSchema = z.object({ oracleId: z.string().uuid() });

const SCRYFALL_API = "https://api.scryfall.com";
const SCRYFALL_HEADERS = {
  Accept: "application/json;q=0.9,*/*;q=0.8",
  "User-Agent": "TCGHaven/1.0 (info@tcghaven.com)",
};

type ScryfallImageUris = {
  normal?: string;
  large?: string;
  png?: string;
};

type ScryfallFace = {
  name?: string;
  oracle_text?: string;
  image_uris?: ScryfallImageUris;
};

type ScryfallCard = {
  id: string;
  oracle_id?: string;
  name: string;
  lang: string;
  released_at?: string;
  uri?: string;
  scryfall_uri?: string;
  layout?: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  colors?: string[];
  set: string;
  set_name: string;
  collector_number: string;
  rarity: string;
  artist?: string;
  games?: string[];
  digital?: boolean;
  finishes?: string[];
  image_uris?: ScryfallImageUris;
  card_faces?: ScryfallFace[];
  prices?: {
    eur?: string | null;
    eur_foil?: string | null;
    usd?: string | null;
    usd_foil?: string | null;
    usd_etched?: string | null;
  };
};

type ScryfallList<T> = {
  object: "list";
  data: T[];
  has_more?: boolean;
  next_page?: string | null;
  total_cards?: number;
};

type ScryfallSet = {
  code: string;
  name: string;
  set_type: string;
};

class ScryfallRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const wait = (milliseconds: number) =>
  new Promise(resolve => setTimeout(resolve, milliseconds));

let requestQueue = Promise.resolve();
let lastRequestAt = 0;

async function waitForRequestSlot() {
  const scheduled = requestQueue.then(async () => {
    const delay = Math.max(0, 125 - (Date.now() - lastRequestAt));
    if (delay) await wait(delay);
    lastRequestAt = Date.now();
  });
  requestQueue = scheduled.catch(() => undefined);
  await scheduled;
}

async function scryfallJson<T>(url: string) {
  const target = new URL(url, SCRYFALL_API);
  if (target.protocol !== "https:" || target.hostname !== "api.scryfall.com") {
    throw new Error("Unexpected Scryfall API address.");
  }

  await waitForRequestSlot();
  const response = await fetch(target, {
    headers: SCRYFALL_HEADERS,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    let detail = "Scryfall could not complete the request.";
    try {
      const body = (await response.json()) as { details?: string };
      if (body.details) detail = body.details;
    } catch {
      // The status code remains enough to return a useful admin error.
    }
    throw new ScryfallRequestError(detail, response.status);
  }
  return (await response.json()) as T;
}

function quotedSearch(value: string) {
  return value.replace(/["\\]/g, " ").replace(/\s+/g, " ").trim();
}

function cardImage(card: ScryfallCard) {
  return card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal ?? null;
}

function cardDescription(card: ScryfallCard) {
  if (card.oracle_text) return card.oracle_text;
  const faceText = card.card_faces
    ?.map(face => [face.name, face.oracle_text].filter(Boolean).join(" — "))
    .filter(Boolean)
    .join("\n\n");
  return faceText || card.type_line || "Magic: The Gathering card.";
}

function productSlug(card: Pick<ScryfallCard, "oracle_id" | "name">) {
  return toSlug(`magic-${card.oracle_id}-${card.name}`);
}

function priceCents(value: string | null | undefined) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0;
}

function finishPrice(card: ScryfallCard, finish: string) {
  if (finish === "foil") {
    return priceCents(card.prices?.eur_foil);
  }
  if (finish === "etched") return 0;
  return priceCents(card.prices?.eur);
}

function finishLabel(finish: string) {
  if (finish === "nonfoil") return "Nonfoil";
  return finish.charAt(0).toUpperCase() + finish.slice(1);
}

function rarityLabel(rarity: string) {
  return rarity.charAt(0).toUpperCase() + rarity.slice(1);
}

function languageLabel(language: string) {
  const names: Record<string, string> = {
    en: "English",
    nl: "Dutch",
    de: "German",
    fr: "French",
    it: "Italian",
    es: "Spanish",
    pt: "Portuguese",
    ja: "Japanese",
    ko: "Korean",
    zhs: "Simplified Chinese",
    zht: "Traditional Chinese",
    ru: "Russian",
  };
  return names[language] ?? language.toUpperCase();
}

function skuFor(card: ScryfallCard, finish: string) {
  const clean = (value: string, length: number) =>
    value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, length);
  return [
    "MTG",
    clean(card.set, 8),
    clean(card.collector_number, 18),
    clean(card.lang, 5),
    clean(finish, 8),
    card.id.replace(/-/g, ""),
  ].join("-").toUpperCase().slice(0, 80);
}

async function fetchAllPrintings(oracleId: string) {
  const query = `oracleid:${oracleId} game:paper`;
  let nextUrl: string | null = `${SCRYFALL_API}/cards/search?q=${encodeURIComponent(query)}&unique=prints&order=released&dir=asc`;
  const cards: ScryfallCard[] = [];
  let requests = 0;

  while (nextUrl) {
    const page: ScryfallList<ScryfallCard> = await scryfallJson(nextUrl);
    cards.push(...page.data);
    nextUrl = page.has_more && page.next_page ? page.next_page : null;
    requests += 1;
    if (requests >= 20) throw new Error("This card has too many printings to import safely.");
  }

  return cards.filter(card => !card.digital && card.games?.includes("paper"));
}

async function importedStatuses(cards: ScryfallCard[]) {
  const usable = cards.filter(
    (card): card is ScryfallCard & { oracle_id: string } => Boolean(card.oracle_id),
  );
  const slugs = usable.map(card => productSlug(card));
  const rows = slugs.length
    ? await db
        .select({ slug: products.slug, status: products.status })
        .from(products)
        .where(inArray(products.slug, slugs))
    : [];
  return new Map(rows.map(row => [row.slug, row.status]));
}

async function searchResponse(cards: ScryfallCard[], matchedSets: string[] = []) {
  const usable = cards
    .filter((card): card is ScryfallCard & { oracle_id: string } => Boolean(card.oracle_id))
    .slice(0, 60);
  const imported = await importedStatuses(usable);

  return apiJson({
    cards: usable.map(card => ({
      id: card.oracle_id,
      scryfallId: card.id,
      name: card.name,
      typeLine: card.type_line ?? "Magic card",
      manaCost: card.mana_cost ?? "",
      setName: card.set_name,
      setCode: card.set.toUpperCase(),
      rarity: rarityLabel(card.rarity),
      image: cardImage(card),
      referencePriceCents: priceCents(card.prices?.eur),
      importedStatus: imported.get(productSlug(card)) ?? null,
    })),
    matchedSets,
  });
}

export async function GET(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;

  const url = new URL(event.request.url);
  const query = quotedSearch(url.searchParams.get("q")?.slice(0, 80) ?? "");
  const searchBy = url.searchParams.get("by") === "set" ? "set" : "card";
  if (!query) return apiJson({ cards: [], matchedSets: [] });

  try {
    if (searchBy === "set") {
      const sets = await scryfallJson<ScryfallList<ScryfallSet>>(`${SCRYFALL_API}/sets`);
      const needle = query.toLocaleLowerCase("en-US");
      const matches = sets.data
        .filter(set =>
          set.code.toLocaleLowerCase("en-US").includes(needle) ||
          set.name.toLocaleLowerCase("en-US").includes(needle),
        )
        .slice(0, 6);
      if (!matches.length) return apiJson({ cards: [], matchedSets: [] });

      const setQuery = `(${matches.map(set => `e:${set.code}`).join(" or ")}) game:paper`;
      const result = await scryfallJson<ScryfallList<ScryfallCard>>(
        `${SCRYFALL_API}/cards/search?q=${encodeURIComponent(setQuery)}&unique=cards&order=name`,
      );
      return searchResponse(result.data, matches.map(set => `${set.name} (${set.code.toUpperCase()})`));
    }

    const cardQuery = `name:"${query}" game:paper`;
    const result = await scryfallJson<ScryfallList<ScryfallCard>>(
      `${SCRYFALL_API}/cards/search?q=${encodeURIComponent(cardQuery)}&unique=cards&order=name`,
    );
    return searchResponse(result.data);
  } catch (error) {
    if (error instanceof ScryfallRequestError && error.status === 404) {
      return apiJson({ cards: [], matchedSets: [] });
    }
    console.error("Scryfall search failed", error);
    return apiJson(
      {
        error: error instanceof ScryfallRequestError && error.status === 429
          ? "Scryfall is rate limiting requests. Wait a moment and search again."
          : "Scryfall could not be reached. Try again shortly.",
      },
      { status: 503 },
    );
  }
}

export async function POST(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;

  try {
    const input = importCardSchema.parse(await event.request.json());
    const printings = await fetchAllPrintings(input.oracleId);
    const card = printings[0];
    if (!card?.oracle_id) {
      return apiJson({ error: "No paper printings were found for this card." }, { status: 404 });
    }

    const slug = productSlug(card);
    const [existing] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.slug, slug))
      .limit(1);
    if (existing) {
      return apiJson({ error: "This card is already in the catalogue." }, { status: 409 });
    }

    const variants = printings.flatMap(printing => {
      const finishes = printing.finishes?.filter(finish =>
        finish === "nonfoil" || finish === "foil" || finish === "etched",
      ) ?? [];
      return (finishes.length ? finishes : ["nonfoil"]).map(finish => ({
        printing,
        finish,
        image: cardImage(printing),
      }));
    });
    const productArtwork = variants.find(variant => variant.image)?.image ?? null;
    const firstPrinting = variants[0]?.printing ?? card;

    const created = await db.transaction(async tx => {
      const [product] = await tx
        .insert(products)
        .values({
          name: card.name,
          slug,
          description: cardDescription(card),
          brand: "Wizards of the Coast",
          game: "magic",
          productType: "single",
          status: "draft",
          imageUrls: productArtwork ? [productArtwork] : [],
          metadata: {
            source: "scryfall",
            oracleId: card.oracle_id,
            scryfallCardId: card.id,
            sourceUrl: card.scryfall_uri,
            set: firstPrinting.set_name,
            setCode: firstPrinting.set.toUpperCase(),
            cardNumber: firstPrinting.collector_number,
            rarity: rarityLabel(firstPrinting.rarity),
            layout: card.layout,
            manaCost: card.mana_cost,
            typeLine: card.type_line,
            colors: card.colors,
            artist: firstPrinting.artist,
          },
        })
        .returning({ id: products.id, name: products.name, slug: products.slug });
      if (!product) throw new Error("Product was not created.");

      const variantRows = variants.map(({ printing, finish }, index) => ({
        productId: product.id,
        sku: skuFor(printing, finish),
        name: `${printing.set_name} · ${printing.collector_number} · ${rarityLabel(printing.rarity)} · ${finishLabel(finish)}`.slice(0, 120),
        condition: "Near Mint",
        language: languageLabel(printing.lang),
        finish: finishLabel(finish),
        imageUrl: cardImage(printing),
        isDefault: index === 0,
        priceCents: finishPrice(printing, finish),
        stock: 0,
        trackInventory: true,
      }));
      for (let index = 0; index < variantRows.length; index += 200) {
        await tx.insert(productVariants).values(variantRows.slice(index, index + 200));
      }
      return product;
    });

    await writeAuditLog({
      event,
      actorId: guard.session!.user.id,
      action: "catalogue.scryfall_added",
      entityType: "product",
      entityId: created.id,
      summary: `${created.name} added from Scryfall as a draft with ${variants.length} variants.`,
      metadata: {
        oracleId: card.oracle_id,
        printings: printings.length,
        variants: variants.length,
        variantImages: variants.filter(variant => variant.image).length,
      },
    });

    return apiJson(
      {
        product: created,
        printings: printings.length,
        variants: variants.length,
        hasImage: Boolean(productArtwork),
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiJson({ error: "Choose a valid Magic card." }, { status: 400 });
    }
    if (error instanceof ScryfallRequestError && error.status === 429) {
      return apiJson(
        { error: "Scryfall is rate limiting requests. Wait a moment and try again." },
        { status: 503 },
      );
    }
    console.error("Scryfall catalogue import failed", error);
    return apiJson(
      { error: "The Magic card could not be added. Check the server log for the reason." },
      { status: 500 },
    );
  }
}
