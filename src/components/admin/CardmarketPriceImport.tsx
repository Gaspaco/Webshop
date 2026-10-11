import { createSignal, For, Show } from "solid-js";
import styles from "./CardmarketPriceImport.module.scss";

type SupportedGame = "pokemon" | "yugioh" | "magic" | "riftbound" | "digimon";

type ProductFileRow = {
  idProduct: number;
  name: string;
  idCategory: number;
};

type PriceFileRow = {
  idProduct: number;
  idCategory: number;
  avg?: number | null;
  low?: number | null;
  trend?: number | null;
  avg7?: number | null;
  avg30?: number | null;
  "avg-foil"?: number | null;
  "low-foil"?: number | null;
  "trend-foil"?: number | null;
  "avg7-foil"?: number | null;
  "avg30-foil"?: number | null;
};

type ProductFile = {
  version?: number;
  createdAt?: string;
  products?: ProductFileRow[];
};

type PriceFile = {
  version?: number;
  createdAt?: string;
  priceGuides?: PriceFileRow[];
};

type LinkResult = {
  sourceRows: number;
  matchingNames: number;
  safeLinks: number;
  newLinks: number;
  applied: number;
  skippedAmbiguous: number;
  candidates: Array<{
    productName: string;
    variantName: string;
    sku: string;
    idProduct: number;
    alreadyLinked: boolean;
  }>;
};

type PriceResult = {
  linkedVariants: number;
  matchedVariants: number;
  changedVariants: number;
  missingPrice: number;
  applied: number;
  changes: Array<{
    productName: string;
    variantName: string;
    sku: string;
    idProduct: number;
    priceType: "normal" | "foil";
    oldPriceCents: number;
    newPriceCents: number;
  }>;
};

const GAME_BY_CATEGORY = new Map<number, SupportedGame>([
  [1, "magic"],
  [5, "yugioh"],
  [51, "pokemon"],
  [1611, "digimon"],
  [1655, "riftbound"],
]);

function normalizedName(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ");
}

function euroCents(...values: Array<number | null | undefined>) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return Math.round(value * 100);
    }
  }
  return 0;
}

function fileLabel(file: File, rows: number) {
  return `${file.name} · ${new Intl.NumberFormat("en-NL").format(rows)} rows`;
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-NL", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

async function readJson<T>(file: File) {
  if (file.size > 35_000_000) {
    throw new Error("Use an original Cardmarket JSON file smaller than 35 MB.");
  }
  try {
    return JSON.parse(await file.text()) as T;
  } catch {
    throw new Error("This is not a complete Cardmarket JSON file.");
  }
}

export default function CardmarketPriceImport(props: { onUpdated: () => unknown }) {
  const [game, setGame] = createSignal<SupportedGame | null>(null);
  const [catalogueLabel, setCatalogueLabel] = createSignal("");
  const [safeRows, setSafeRows] = createSignal<Array<{ idProduct: number; name: string }>>([]);
  const [linkResult, setLinkResult] = createSignal<LinkResult | null>(null);
  const [priceLabel, setPriceLabel] = createSignal("");
  const [priceCreatedAt, setPriceCreatedAt] = createSignal("");
  const [priceRows, setPriceRows] = createSignal<Array<{
    idProduct: number;
    normalCents: number;
    foilCents: number;
  }>>([]);
  const [priceResult, setPriceResult] = createSignal<PriceResult | null>(null);
  const [message, setMessage] = createSignal("");
  const [busy, setBusy] = createSignal(false);

  const loadCatalogue = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setMessage("");
    setLinkResult(null);
    try {
      const parsed = await readJson<ProductFile>(file);
      const products = parsed.products;
      if (!Array.isArray(products) || !products.length) {
        throw new Error("This file does not contain a Cardmarket product catalogue.");
      }
      const detected = GAME_BY_CATEGORY.get(products[0]!.idCategory);
      if (!detected || products.some(product => product.idCategory !== products[0]!.idCategory)) {
        throw new Error("Choose one supported Cardmarket singles catalogue.");
      }

      const counts = new Map<string, number>();
      for (const product of products) {
        const key = normalizedName(product.name);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const unique = products
        .filter(product => counts.get(normalizedName(product.name)) === 1)
        .map(product => ({ idProduct: product.idProduct, name: product.name }));

      setGame(detected);
      setCatalogueLabel(fileLabel(file, products.length));
      setSafeRows(unique);
      setMessage(
        `${new Intl.NumberFormat("en-NL").format(unique.length)} globally unique names can be checked. Reprints and ambiguous names will be skipped.`,
      );
    } catch (error) {
      setGame(null);
      setCatalogueLabel("");
      setSafeRows([]);
      setMessage(error instanceof Error ? error.message : "The catalogue could not be read.");
    } finally {
      setBusy(false);
    }
  };

  const checkLinks = async (mode: "preview" | "apply") => {
    const currentGame = game();
    const rows = safeRows();
    if (!currentGame || !rows.length) return;
    if (rows.length > 2_000) {
      setMessage("This catalogue has more than 2,000 safe candidates. Use a smaller game-specific singles file.");
      return;
    }
    if (
      mode === "apply" &&
      !window.confirm("Link the reviewed single-variant products to these exact Cardmarket IDs?")
    ) return;

    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/cardmarket-links", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, game: currentGame, rows }),
      });
      const result = await response.json() as LinkResult & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Cardmarket IDs could not be checked.");
      setLinkResult(result);
      setMessage(
        mode === "apply"
          ? `${result.applied} exact Cardmarket IDs linked. Ambiguous products were not changed.`
          : `${result.newLinks} safe new links found. Review the sample before applying them.`,
      );
      if (mode === "apply") await Promise.resolve(props.onUpdated());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cardmarket IDs could not be checked.");
    } finally {
      setBusy(false);
    }
  };

  const loadPrices = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setMessage("");
    setPriceResult(null);
    try {
      const [parsed, linkedResponse] = await Promise.all([
        readJson<PriceFile>(file),
        fetch("/api/admin/cardmarket-prices", {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        }),
      ]);
      if (!linkedResponse.ok) throw new Error("Linked Cardmarket IDs could not be loaded.");
      const linked = await linkedResponse.json() as {
        links?: Array<{ idProduct: number; priceType: "normal" | "foil" }>;
      };
      const guides = parsed.priceGuides;
      if (!Array.isArray(guides) || !guides.length) {
        throw new Error("This file does not contain a Cardmarket price guide.");
      }
      const linkedIds = new Set((linked.links ?? []).map(link => link.idProduct));
      const exactRows = guides.flatMap(row => {
        if (!linkedIds.has(row.idProduct)) return [];
        return [{
          idProduct: row.idProduct,
          normalCents: euroCents(row.trend, row.avg7, row.avg30, row.avg),
          foilCents: euroCents(
            row["trend-foil"],
            row["avg7-foil"],
            row["avg30-foil"],
            row["avg-foil"],
          ),
        }];
      });
      if (!linkedIds.size) {
        throw new Error("No catalogue variants have a Cardmarket product ID yet. Link IDs first.");
      }
      if (!exactRows.length) {
        throw new Error("This price guide does not contain any linked Cardmarket product IDs.");
      }
      if (exactRows.length > 5_000) {
        throw new Error("This file matches more than 5,000 variants. Import one game at a time.");
      }

      setPriceLabel(fileLabel(file, guides.length));
      setPriceCreatedAt(parsed.createdAt ?? "");
      setPriceRows(exactRows);
      setMessage(`${exactRows.length} exact linked IDs found in this price guide.`);
    } catch (error) {
      setPriceLabel("");
      setPriceRows([]);
      setMessage(error instanceof Error ? error.message : "The price guide could not be read.");
    } finally {
      setBusy(false);
    }
  };

  const checkPrices = async (mode: "preview" | "apply") => {
    if (!priceRows().length) return;
    if (
      mode === "apply" &&
      !window.confirm("Apply only the reviewed exact-ID price changes? Stock and images will not change.")
    ) return;

    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/cardmarket-prices", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          sourceCreatedAt: priceCreatedAt(),
          rows: priceRows(),
        }),
      });
      const result = await response.json() as PriceResult & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Prices could not be checked.");
      setPriceResult(result);
      setMessage(
        mode === "apply"
          ? `${result.applied} prices updated. Images, stock, and visibility were unchanged.`
          : `${result.changedVariants} price changes are ready for review.`,
      );
      if (mode === "apply") await Promise.resolve(props.onUpdated());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Prices could not be checked.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section class={styles.section} aria-labelledby="cardmarket-import-title">
      <header>
        <div>
          <h2 id="cardmarket-import-title">Cardmarket price files</h2>
          <p>Link exact printing IDs once, then preview every price change before applying it.</p>
        </div>
        <span>Exact ID matching</span>
      </header>

      <div class={styles.steps}>
        <section>
          <div class={styles.stepHeading}>
            <span>1</span>
            <div>
              <h3>Link safe catalogue entries</h3>
              <p>Automatic linking only accepts globally unique names with one local variant.</p>
            </div>
          </div>
          <label class={styles.fileControl}>
            <span>Choose product catalogue JSON</span>
            <input
              type="file"
              accept="application/json,.json"
              disabled={busy()}
              onChange={event => void loadCatalogue(event.currentTarget.files?.[0])}
            />
            <small>{catalogueLabel() || "Product list files start with products_singles_"}</small>
          </label>
          <div class={styles.actions}>
            <button type="button" disabled={busy() || !safeRows().length} onClick={() => void checkLinks("preview")}>
              Preview ID links
            </button>
            <button
              type="button"
              class={styles.primary}
              disabled={busy() || !linkResult()?.newLinks || Boolean(linkResult()?.applied)}
              onClick={() => void checkLinks("apply")}
            >
              Apply reviewed links
            </button>
          </div>
          <Show when={linkResult()}>
            {result => (
              <div class={styles.summary}>
                <strong>{result().newLinks} new safe links</strong>
                <span>{result().skippedAmbiguous} ambiguous local matches skipped</span>
                <Show when={result().candidates.length}>
                  <ul>
                    <For each={result().candidates.slice(0, 5)}>
                      {candidate => (
                        <li>
                          <span>{candidate.productName}</span>
                          <code>{candidate.idProduct}</code>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </div>
            )}
          </Show>
        </section>

        <section>
          <div class={styles.stepHeading}>
            <span>2</span>
            <div>
              <h3>Preview market prices</h3>
              <p>Uses trend price first, then recent averages. Missing values keep the current price.</p>
            </div>
          </div>
          <label class={styles.fileControl}>
            <span>Choose price guide JSON</span>
            <input
              type="file"
              accept="application/json,.json"
              disabled={busy()}
              onChange={event => void loadPrices(event.currentTarget.files?.[0])}
            />
            <small>{priceLabel() || "Price files start with price_guide_"}</small>
          </label>
          <div class={styles.actions}>
            <button type="button" disabled={busy() || !priceRows().length} onClick={() => void checkPrices("preview")}>
              Preview price changes
            </button>
            <button
              type="button"
              class={styles.primary}
              disabled={busy() || !priceResult()?.changedVariants || Boolean(priceResult()?.applied)}
              onClick={() => void checkPrices("apply")}
            >
              Apply reviewed prices
            </button>
          </div>
          <Show when={priceResult()}>
            {result => (
              <div class={styles.summary}>
                <strong>{result().changedVariants} prices would change</strong>
                <span>{result().missingPrice} linked variants had no usable price</span>
                <Show when={result().changes.length}>
                  <ul>
                    <For each={result().changes.slice(0, 5)}>
                      {change => (
                        <li>
                          <span>{change.productName} · {change.variantName}</span>
                          <code>{formatMoney(change.oldPriceCents)} → {formatMoney(change.newPriceCents)}</code>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </div>
            )}
          </Show>
        </section>
      </div>

      <Show when={message()}>
        <p class={styles.message} role="status">{busy() ? "Reading file…" : message()}</p>
      </Show>
      <p class={styles.note}>
        Products with multiple printings are never guessed. Add their Cardmarket ID in the variant editor, then upload the price guide again.
      </p>
    </section>
  );
}
