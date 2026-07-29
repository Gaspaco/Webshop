import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import {
  createSolidTable,
  getCoreRowModel,
  type ColumnDef,
} from "@tanstack/solid-table";
import {
  createEffect,
  createResource,
  createSignal,
  For,
  onMount,
  Show,
} from "solid-js";
import { authClient } from "~/lib/auth-client";
import styles from "../admin.module.scss";

type AdminSection =
  | "overview"
  | "products"
  | "orders"
  | "customers"
  | "discounts"
  | "storefront"
  | "analytics"
  | "activity"
  | "imports";

type AdminVariant = {
  id: string;
  sku: string;
  name: string;
  condition: string | null;
  language: string | null;
  finish: string | null;
  priceCents: number;
  stock: number;
  reservedStock: number;
};

type AdminProduct = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  game: string | null;
  productType: string | null;
  status: "draft" | "active" | "archived";
  imageUrls: string[];
  metadata: Record<string, unknown>;
  variantId: string | null;
  sku: string | null;
  condition: string | null;
  language: string | null;
  priceCents: number | null;
  compareAtPriceCents: number | null;
  stock: number | null;
  reservedStock: number | null;
  variants: AdminVariant[];
  updatedAt: string;
};

type AdminOrderItem = {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
};

type AdminOrder = {
  id: string;
  orderNumber: string;
  email: string;
  status: string;
  currency: string;
  subtotalCents: number;
  shippingCents: number;
  discountCode: string | null;
  discountCents: number;
  totalCents: number;
  shippingAddress: Record<string, string>;
  notes: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  shippedAt: string | null;
  items: AdminOrderItem[];
  payment: {
    id: string;
    status: string;
    method: string | null;
    amountCents: number;
    molliePaymentId: string;
    paidAt: string | null;
  } | null;
  returnRequest: {
    id: string;
    status: string;
    reason: string;
    amountCents: number | null;
  } | null;
  createdAt: string;
};

type AdminCustomer = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  notes: string;
  tags: string[];
  suspended: boolean;
  orderCount: number;
  spentCents: number;
  createdAt: string;
};

type AdminDiscount = {
  id: string;
  code: string;
  type: "percentage" | "fixed";
  value: number;
  minimumOrderCents: number;
  maximumUses: number | null;
  usedCount: number;
  active: boolean;
  expiresAt: string | null;
  createdAt: string;
};

type StorefrontSettings = {
  announcement: string;
  heroTitle: string;
  heroCopy: string;
  featuredProductSlugs: string[];
  socialInstagram: string;
  socialTiktok: string;
  socialYoutube: string;
  socialDiscord: string;
};

type AuditEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  ipAddress: string | null;
  createdAt: string;
  actorName: string | null;
  actorEmail: string | null;
};

type ImportJob = {
  id: string;
  fileName: string | null;
  status: string;
  totalRows: number;
  processedRows: number;
  failedRows: number;
  createdAt: string;
};

type AdminDashboard = {
  owner: { id: string; name: string; email: string; image: string | null };
  metrics: {
    revenueCents: number;
    activeProducts: number;
    openOrders: number;
    lowStock: number;
    customers: number;
  };
  products: AdminProduct[];
  orders: AdminOrder[];
  customers: AdminCustomer[];
  imports: ImportJob[];
  discounts: AdminDiscount[];
  content: { home?: Partial<StorefrontSettings> };
  audit: AuditEntry[];
  analytics: {
    salesByDay: Array<{
      date: string;
      revenueCents: number;
      orders: number;
    }>;
    averageOrderCents: number;
    returningCustomers: number;
  };
};

type ProductDraft = {
  name: string;
  game: "pokemon" | "yugioh" | "magic" | "other";
  productType: "single" | "sealed" | "graded" | "accessory";
  set: string;
  sku: string;
  description: string;
  image: string;
  badge: string;
  cardNumber: string;
  rarity: string;
  setCode: string;
  illustrator: string;
  gradingCompany: string;
  grade: string;
  certificationNumber: string;
  finish: string;
  price: string;
  stock: string;
  status: "draft" | "active";
};

const emptyProduct: ProductDraft = {
  name: "",
  game: "pokemon",
  productType: "single",
  set: "",
  sku: "",
  description: "",
  image: "",
  badge: "",
  cardNumber: "",
  rarity: "",
  setCode: "",
  illustrator: "",
  gradingCompany: "",
  grade: "",
  certificationNumber: "",
  finish: "",
  price: "",
  stock: "1",
  status: "draft",
};

const NAV_ITEMS: Array<{ id: AdminSection; label: string; short: string }> = [
  { id: "overview", label: "Overview", short: "Today" },
  { id: "products", label: "Catalogue", short: "Products and stock" },
  { id: "orders", label: "Orders", short: "Fulfilment" },
  { id: "customers", label: "Customers", short: "Accounts" },
  { id: "discounts", label: "Discounts", short: "Campaigns" },
  { id: "storefront", label: "Storefront", short: "Homepage content" },
  { id: "analytics", label: "Analytics", short: "Sales performance" },
  { id: "activity", label: "Activity", short: "Security history" },
  { id: "imports", label: "Bulk import", short: "CSV tools" },
];

const ORDER_STATUSES = [
  "pending",
  "paid",
  "processing",
  "shipped",
  "completed",
  "cancelled",
  "refunded",
];

const productColumns: ColumnDef<AdminProduct>[] = [
  { accessorKey: "name", header: "Product" },
  { accessorKey: "game", header: "Game" },
  { accessorKey: "priceCents", header: "Price" },
  { accessorKey: "stock", header: "Stock" },
  { accessorKey: "status", header: "Visibility" },
];

const orderColumns: ColumnDef<AdminOrder>[] = [
  { accessorKey: "orderNumber", header: "Order" },
  { accessorKey: "email", header: "Customer" },
  { accessorKey: "createdAt", header: "Date" },
  { accessorKey: "totalCents", header: "Total" },
  { accessorKey: "status", header: "Status" },
];

const customerColumns: ColumnDef<AdminCustomer>[] = [
  { accessorKey: "name", header: "Customer" },
  { accessorKey: "email", header: "Email" },
  { accessorKey: "emailVerified", header: "Verification" },
  { accessorKey: "createdAt", header: "Joined" },
];

function formatMoney(cents: number, currency = "EUR") {
  return new Intl.NumberFormat("en-NL", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

async function loadDashboard() {
  const response = await fetch("/api/admin/dashboard", {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (response.status === 401 || response.status === 403) {
    const error = new Error("OWNER_ACCESS_REQUIRED");
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  if (!response.ok) throw new Error("Dashboard could not be loaded.");
  return response.json() as Promise<AdminDashboard>;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0])
    .join("")
    .toUpperCase();
}

function escapeCsvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function downloadTemplate() {
  const header = [
    "name",
    "game",
    "productType",
    "set",
    "sku",
    "price",
    "stock",
    "image",
    "status",
  ];
  const sample = [
    "Pikachu ex",
    "pokemon",
    "single",
    "Journey Together",
    "PKM-PIKACHU-001",
    "12.95",
    "3",
    "https://example.com/pikachu.webp",
    "draft",
  ];
  const csv = `${header.map(escapeCsvCell).join(",")}\n${sample.map(escapeCsvCell).join(",")}\n`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "tcghaven-product-import.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

function parseCsv(text: string) {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (character === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      record.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      record.push(field);
      if (record.some(value => value.trim())) records.push(record);
      record = [];
      field = "";
    } else {
      field += character;
    }
  }
  record.push(field);
  if (record.some(value => value.trim())) records.push(record);

  const [headers, ...rows] = records;
  if (!headers) return [];
  const indexOf = (name: string) =>
    headers.findIndex(header => header.trim().toLowerCase() === name.toLowerCase());
  return rows.map(row => ({
    name: row[indexOf("name")]?.trim() ?? "",
    game: row[indexOf("game")]?.trim().toLowerCase() ?? "",
    productType: row[indexOf("productType")]?.trim().toLowerCase() ?? "",
    set: row[indexOf("set")]?.trim() ?? "",
    sku: row[indexOf("sku")]?.trim() ?? "",
    priceCents: Math.round(Number(row[indexOf("price")] ?? 0) * 100),
    stock: Number(row[indexOf("stock")] ?? 0),
    image: row[indexOf("image")]?.trim() ?? "",
    status: row[indexOf("status")]?.trim().toLowerCase() || "draft",
  }));
}

function ProductRow(props: {
  product: AdminProduct;
  onSaved: () => unknown;
}) {
  const metadata = () => props.product.metadata ?? {};
  const metadataText = (key: string) =>
    typeof metadata()[key] === "string" ? metadata()[key] as string : "";
  const [editing, setEditing] = createSignal(false);
  const [name, setName] = createSignal(props.product.name);
  const [description, setDescription] = createSignal(
    props.product.description ?? "",
  );
  const [game, setGame] = createSignal(
    (props.product.game ?? "other") as ProductDraft["game"],
  );
  const [productType, setProductType] = createSignal(
    (props.product.productType ?? "single") as ProductDraft["productType"],
  );
  const [collection, setCollection] = createSignal(
    typeof metadata().set === "string" ? metadata().set as string : "",
  );
  const [badge, setBadge] = createSignal(
    metadataText("badge"),
  );
  const [cardNumber, setCardNumber] = createSignal(metadataText("cardNumber"));
  const [rarity, setRarity] = createSignal(metadataText("rarity"));
  const [setCode, setSetCode] = createSignal(metadataText("setCode"));
  const [illustrator, setIllustrator] = createSignal(metadataText("illustrator"));
  const [gradingCompany, setGradingCompany] = createSignal(
    metadataText("gradingCompany"),
  );
  const [grade, setGrade] = createSignal(metadataText("grade"));
  const [certificationNumber, setCertificationNumber] = createSignal(
    metadataText("certificationNumber"),
  );
  const [finish, setFinish] = createSignal(
    props.product.variants[0]?.finish ?? "",
  );
  const [sku, setSku] = createSignal(props.product.sku ?? "");
  const [condition, setCondition] = createSignal(
    props.product.condition ?? "Near Mint",
  );
  const [language, setLanguage] = createSignal(
    props.product.language ?? "English",
  );
  const [image, setImage] = createSignal(props.product.imageUrls[0] ?? "");
  const [price, setPrice] = createSignal(
    ((props.product.priceCents ?? 0) / 100).toFixed(2),
  );
  const [stock, setStock] = createSignal(String(props.product.stock ?? 0));
  const [status, setStatus] = createSignal(props.product.status);
  const [saving, setSaving] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const [variantOpen, setVariantOpen] = createSignal(false);
  const [variantDraft, setVariantDraft] = createSignal({
    name: "",
    sku: "",
    condition: "Near Mint",
    language: "English",
    finish: "",
    price: "",
    stock: "0",
  });

  const loadImage = (file?: File) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setMessage("Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > 850_000) {
      setMessage("Use an image smaller than 850 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImage(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  };

  const save = async () => {
    if (!props.product.variantId) return;
    if (
      metadataText("source") === "starter" &&
      !window.confirm(
        "This starter listing will become a managed database product using the price and stock currently shown. Continue?",
      )
    ) return;
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/admin/products", {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: props.product.id,
        variantId: props.product.variantId,
        name: name(),
        description: description(),
        game: game(),
        productType: productType(),
        set: collection(),
        badge: badge(),
        cardNumber: cardNumber(),
        rarity: rarity(),
        setCode: setCode(),
        illustrator: illustrator(),
        gradingCompany: gradingCompany(),
        grade: grade(),
        certificationNumber: certificationNumber(),
        finish: finish(),
        sku: sku(),
        condition: condition(),
        language: language(),
        image: image(),
        priceCents: Math.round(Number(price()) * 100),
        stock: Number(stock()),
        status: status(),
      }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(result.error ?? "Product could not be saved.");
      setSaving(false);
      return;
    }
    await Promise.resolve(props.onSaved());
    setMessage("Saved");
    setEditing(false);
    setSaving(false);
  };

  const addVariant = async (event: SubmitEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const current = variantDraft();
    const response = await fetch("/api/admin/variants", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: props.product.id,
        name: current.name,
        sku: current.sku,
        condition: current.condition,
        language: current.language,
        finish: current.finish,
        priceCents: Math.round(Number(current.price) * 100),
        stock: Number(current.stock),
      }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(result.error ?? "Variant could not be added.");
      setSaving(false);
      return;
    }
    await Promise.resolve(props.onSaved());
    setVariantDraft({
      name: "",
      sku: "",
      condition: "Near Mint",
      language: "English",
      finish: "",
      price: "",
      stock: "0",
    });
    setVariantOpen(false);
    setMessage("Variant added");
    setSaving(false);
  };

  const removeVariant = async (variant: AdminVariant) => {
    if (!window.confirm(`Remove variant ${variant.sku}?`)) return;
    setMessage("");
    const response = await fetch("/api/admin/variants", {
      method: "DELETE",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: variant.id,
        productId: props.product.id,
        confirmation: "REMOVE",
      }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(result.error ?? "Variant could not be removed.");
      return;
    }
    await Promise.resolve(props.onSaved());
    setMessage("Variant removed");
  };

  return (
    <>
      <tr>
        <td>
          <div class={styles.productIdentity}>
            <Show
              when={image()}
              fallback={<span class={styles.productFallback}>{name()[0]}</span>}
            >
              <img src={image()} alt="" />
            </Show>
            <div>
              <strong>{name()}</strong>
              <span>
                {metadataText("source") === "starter"
                  ? "Starter listing, save once to manage"
                  : sku() || "No SKU"}
              </span>
            </div>
          </div>
        </td>
        <td><span class={styles.gameTag}>{game()}</span></td>
        <td>
          <input
            class={styles.tableInput}
            type="number"
            min="0"
            step="0.01"
            aria-label={`Price for ${name()}`}
            value={price()}
            onInput={event => setPrice(event.currentTarget.value)}
          />
        </td>
        <td>
          <input
            class={styles.stockInput}
            type="number"
            min="0"
            step="1"
            aria-label={`Stock for ${name()}`}
            value={stock()}
            onInput={event => setStock(event.currentTarget.value)}
          />
        </td>
        <td>
          <select
            class={styles.tableSelect}
            aria-label={`Status for ${name()}`}
            value={status()}
            onChange={event =>
              setStatus(event.currentTarget.value as AdminProduct["status"])
            }
          >
            <option value="draft">Draft</option>
            <option value="active">Live</option>
            <option value="archived">Archived</option>
          </select>
        </td>
        <td>
          <div class={styles.rowActions}>
            <button
              type="button"
              class={styles.editAction}
              onClick={() => setEditing(value => !value)}
            >
              {editing() ? "Close editor" : "Edit details"}
            </button>
            <button type="button" onClick={save} disabled={saving()}>
              {saving() ? "Saving" : "Save"}
            </button>
            <A href={`/products/${props.product.slug}`} target="_blank">View</A>
            <Show when={message()}>
              <span>{message()}</span>
            </Show>
          </div>
        </td>
      </tr>
      <Show when={editing()}>
        <tr class={styles.editorRow}>
          <td colSpan={6}>
            <div class={styles.productEditor}>
              <div class={styles.editorHeading}>
                <div>
                  <h3>Edit product details</h3>
                  <p>Changes are saved to the catalogue database.</p>
                </div>
                <Show when={image()}>
                  <img src={image()} alt="Current product preview" />
                </Show>
              </div>
              <div class={styles.editorGrid}>
                <label class={styles.spanTwo}>
                  <span>Product name</span>
                  <input value={name()} onInput={event => setName(event.currentTarget.value)} />
                </label>
                <label>
                  <span>Game</span>
                  <select value={game()} onChange={event => setGame(event.currentTarget.value as ProductDraft["game"])}>
                    <option value="pokemon">Pokémon</option>
                    <option value="yugioh">Yu-Gi-Oh!</option>
                    <option value="magic">Magic</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label>
                  <span>Product type</span>
                  <select value={productType()} onChange={event => setProductType(event.currentTarget.value as ProductDraft["productType"])}>
                    <option value="single">Single</option>
                    <option value="sealed">Sealed</option>
                    <option value="graded">Graded</option>
                    <option value="accessory">Accessory</option>
                  </select>
                </label>
                <label>
                  <span>Set or collection</span>
                  <input value={collection()} onInput={event => setCollection(event.currentTarget.value)} />
                </label>
                <label>
                  <span>SKU</span>
                  <input value={sku()} onInput={event => setSku(event.currentTarget.value)} />
                </label>
                <label>
                  <span>Condition</span>
                  <input value={condition()} onInput={event => setCondition(event.currentTarget.value)} />
                </label>
                <label>
                  <span>Language</span>
                  <input value={language()} onInput={event => setLanguage(event.currentTarget.value)} />
                </label>
                <label>
                  <span>Badge</span>
                  <input placeholder="New, Vintage, PSA 10" value={badge()} onInput={event => setBadge(event.currentTarget.value)} />
                </label>
                <label>
                  <span>Card number</span>
                  <input placeholder="025/165" value={cardNumber()} onInput={event => setCardNumber(event.currentTarget.value)} />
                </label>
                <label>
                  <span>Set code</span>
                  <input placeholder="MEW" value={setCode()} onInput={event => setSetCode(event.currentTarget.value)} />
                </label>
                <label>
                  <span>Rarity</span>
                  <input placeholder="Special illustration rare" value={rarity()} onInput={event => setRarity(event.currentTarget.value)} />
                </label>
                <label>
                  <span>Finish</span>
                  <input placeholder="Holofoil" value={finish()} onInput={event => setFinish(event.currentTarget.value)} />
                </label>
                <label>
                  <span>Illustrator</span>
                  <input value={illustrator()} onInput={event => setIllustrator(event.currentTarget.value)} />
                </label>
                <label>
                  <span>Grading company</span>
                  <input placeholder="PSA, BGS, CGC" value={gradingCompany()} onInput={event => setGradingCompany(event.currentTarget.value)} />
                </label>
                <label>
                  <span>Grade</span>
                  <input placeholder="10" value={grade()} onInput={event => setGrade(event.currentTarget.value)} />
                </label>
                <label>
                  <span>Certification number</span>
                  <input value={certificationNumber()} onInput={event => setCertificationNumber(event.currentTarget.value)} />
                </label>
                <label>
                  <span>Replace image</span>
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => loadImage(event.currentTarget.files?.[0])} />
                </label>
                <label class={styles.spanTwo}>
                  <span>Image URL</span>
                  <input
                    type="url"
                    placeholder="https://"
                    value={image().startsWith("data:") ? "" : image()}
                    onInput={event => setImage(event.currentTarget.value)}
                  />
                </label>
                <label class={styles.spanTwo}>
                  <span>Description</span>
                  <textarea rows="4" value={description()} onInput={event => setDescription(event.currentTarget.value)} />
                </label>
              </div>
              <div class={styles.editorActions}>
                <button type="button" onClick={() => setEditing(false)}>Cancel</button>
                <button type="button" class={styles.primaryAction} onClick={save} disabled={saving()}>
                  {saving() ? "Saving changes" : "Save all changes"}
                </button>
              </div>

              <Show
                when={metadataText("source") !== "starter"}
                fallback={
                  <p class={styles.starterNotice}>
                    Save this starter listing once before adding more variants.
                    Confirm the real price and available stock first.
                  </p>
                }
              >
              <section class={styles.variantManager}>
                <div class={styles.sectionHead}>
                  <div>
                    <h3>Variants</h3>
                    <p>Manage language, condition, finish, price, and stock options.</p>
                  </div>
                  <button type="button" onClick={() => setVariantOpen(value => !value)}>
                    {variantOpen() ? "Close variant form" : "Add variant"}
                  </button>
                </div>
                <div class={styles.variantList}>
                  <For each={props.product.variants}>
                    {variant => (
                      <div>
                        <span>
                          <strong>{variant.name}</strong>
                          <small>{variant.sku}</small>
                        </span>
                        <span>{variant.condition ?? "No condition"}</span>
                        <span>{variant.language ?? "No language"}</span>
                        <span>{variant.finish || "Standard"}</span>
                        <span>{formatMoney(variant.priceCents)}</span>
                        <span>{variant.stock - variant.reservedStock} available</span>
                        <button type="button" onClick={() => removeVariant(variant)}>Remove</button>
                      </div>
                    )}
                  </For>
                </div>
                <Show when={variantOpen()}>
                  <form class={styles.variantForm} onSubmit={addVariant}>
                    <label>
                      <span>Variant name</span>
                      <input required value={variantDraft().name} onInput={event => setVariantDraft(current => ({ ...current, name: event.currentTarget.value }))} />
                    </label>
                    <label>
                      <span>SKU</span>
                      <input required value={variantDraft().sku} onInput={event => setVariantDraft(current => ({ ...current, sku: event.currentTarget.value }))} />
                    </label>
                    <label>
                      <span>Condition</span>
                      <input value={variantDraft().condition} onInput={event => setVariantDraft(current => ({ ...current, condition: event.currentTarget.value }))} />
                    </label>
                    <label>
                      <span>Language</span>
                      <input value={variantDraft().language} onInput={event => setVariantDraft(current => ({ ...current, language: event.currentTarget.value }))} />
                    </label>
                    <label>
                      <span>Finish</span>
                      <input value={variantDraft().finish} onInput={event => setVariantDraft(current => ({ ...current, finish: event.currentTarget.value }))} />
                    </label>
                    <label>
                      <span>Price in EUR</span>
                      <input required type="number" min="0" step="0.01" value={variantDraft().price} onInput={event => setVariantDraft(current => ({ ...current, price: event.currentTarget.value }))} />
                    </label>
                    <label>
                      <span>Opening stock</span>
                      <input required type="number" min="0" step="1" value={variantDraft().stock} onInput={event => setVariantDraft(current => ({ ...current, stock: event.currentTarget.value }))} />
                    </label>
                    <button type="submit" class={styles.primaryAction} disabled={saving()}>
                      {saving() ? "Adding variant" : "Add variant"}
                    </button>
                  </form>
                </Show>
              </section>
              </Show>
            </div>
          </td>
        </tr>
      </Show>
    </>
  );
}

function OrderRow(props: {
  order: AdminOrder;
  onUpdated: () => unknown;
}) {
  const [expanded, setExpanded] = createSignal(false);
  const [trackingNumber, setTrackingNumber] = createSignal(
    props.order.trackingNumber ?? "",
  );
  const [trackingUrl, setTrackingUrl] = createSignal(
    props.order.trackingUrl ?? "",
  );
  const [refundAmount, setRefundAmount] = createSignal(
    (props.order.totalCents / 100).toFixed(2),
  );
  const [reason, setReason] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [message, setMessage] = createSignal("");

  const updateStatus = async (status: string) => {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/admin/orders", {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: props.order.id, status }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(result.error ?? "Order could not be updated.");
      setBusy(false);
      return;
    }
    await Promise.resolve(props.onUpdated());
    setMessage("Order status updated");
    setBusy(false);
  };

  const runAction = async (
    payload:
      | {
          action: "ship";
          id: string;
          trackingNumber: string;
          trackingUrl: string;
        }
      | {
          action: "record_return";
          id: string;
          reason: string;
        }
      | {
          action: "refund";
          id: string;
          amountCents: number;
          reason: string;
          confirmation: "REFUND";
        },
  ) => {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/admin/orders", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(result.error ?? "Order action could not be completed.");
      setBusy(false);
      return;
    }
    await Promise.resolve(props.onUpdated());
    setMessage(
      payload.action === "ship"
        ? "Shipment saved and customer notified"
        : payload.action === "refund"
          ? "Mollie refund completed"
          : "Return request recorded",
    );
    setBusy(false);
  };

  const refund = () => {
    const amountCents = Math.round(Number(refundAmount()) * 100);
    if (!reason().trim()) {
      setMessage("Add a reason before issuing a refund.");
      return;
    }
    if (
      !window.confirm(
        `Refund ${formatMoney(amountCents)} through Mollie? This payment action cannot be undone.`,
      )
    ) return;
    void runAction({
      action: "refund",
      id: props.order.id,
      amountCents,
      reason: reason(),
      confirmation: "REFUND",
    });
  };

  const addressLines = () =>
    Object.values(props.order.shippingAddress ?? {}).filter(Boolean);

  return (
    <>
      <tr>
        <td>
          <strong>{props.order.orderNumber}</strong>
          <Show when={props.order.returnRequest}>
            <small class={styles.rowNote}>Return {props.order.returnRequest!.status}</small>
          </Show>
        </td>
        <td>{props.order.email}</td>
        <td>{formatDate(props.order.createdAt)}</td>
        <td>{formatMoney(props.order.totalCents, props.order.currency)}</td>
        <td>
          <select
            class={styles.orderSelect}
            value={props.order.status}
            disabled={busy()}
            onChange={event => updateStatus(event.currentTarget.value)}
          >
            <For each={ORDER_STATUSES}>{status => <option value={status}>{status}</option>}</For>
          </select>
        </td>
        <td>
          <button type="button" class={styles.editAction} onClick={() => setExpanded(value => !value)}>
            {expanded() ? "Close" : "Open order"}
          </button>
        </td>
      </tr>
      <Show when={expanded()}>
        <tr class={styles.editorRow}>
          <td colSpan={6}>
            <div class={styles.orderEditor}>
              <div class={styles.orderSummaryGrid}>
                <section>
                  <h3>Items</h3>
                  <For each={props.order.items}>
                    {item => (
                      <div class={styles.orderItem}>
                        <span>
                          <strong>{item.name}</strong>
                          <small>{item.sku}</small>
                        </span>
                        <span>{item.quantity} × {formatMoney(item.unitPriceCents)}</span>
                        <strong>{formatMoney(item.totalCents)}</strong>
                      </div>
                    )}
                  </For>
                </section>
                <section>
                  <h3>Ship to</h3>
                  <address>
                    <For each={addressLines()}>{line => <span>{line}</span>}</For>
                  </address>
                  <Show when={props.order.notes}>
                    <p>Customer note: {props.order.notes}</p>
                  </Show>
                </section>
                <section>
                  <h3>Payment summary</h3>
                  <dl>
                    <div><dt>Subtotal</dt><dd>{formatMoney(props.order.subtotalCents)}</dd></div>
                    <div><dt>Shipping</dt><dd>{formatMoney(props.order.shippingCents)}</dd></div>
                    <Show when={props.order.discountCents > 0}>
                      <div><dt>Discount {props.order.discountCode}</dt><dd>{formatMoney(0 - props.order.discountCents)}</dd></div>
                    </Show>
                    <div><dt>Total</dt><dd>{formatMoney(props.order.totalCents)}</dd></div>
                    <div><dt>Payment</dt><dd>{props.order.payment?.status ?? "No payment"}</dd></div>
                  </dl>
                  <A href={`/api/admin/invoice?id=${props.order.id}`} target="_blank">
                    Open printable invoice
                  </A>
                </section>
              </div>

              <div class={styles.orderActionGrid}>
                <form onSubmit={event => {
                  event.preventDefault();
                  void runAction({
                    action: "ship",
                    id: props.order.id,
                    trackingNumber: trackingNumber(),
                    trackingUrl: trackingUrl(),
                  });
                }}>
                  <h3>Shipping</h3>
                  <label>
                    <span>Tracking number</span>
                    <input required value={trackingNumber()} onInput={event => setTrackingNumber(event.currentTarget.value)} />
                  </label>
                  <label>
                    <span>HTTPS tracking link</span>
                    <input required type="url" placeholder="https://" value={trackingUrl()} onInput={event => setTrackingUrl(event.currentTarget.value)} />
                  </label>
                  <button type="submit" disabled={busy()}>Mark shipped and notify</button>
                </form>

                <form onSubmit={event => {
                  event.preventDefault();
                  void runAction({
                    action: "record_return",
                    id: props.order.id,
                    reason: reason(),
                  });
                }}>
                  <h3>Return and refund</h3>
                  <label>
                    <span>Reason</span>
                    <textarea required rows="3" value={reason()} onInput={event => setReason(event.currentTarget.value)} />
                  </label>
                  <label>
                    <span>Refund amount in EUR</span>
                    <input type="number" min="0.01" step="0.01" value={refundAmount()} onInput={event => setRefundAmount(event.currentTarget.value)} />
                  </label>
                  <div>
                    <button type="submit" disabled={busy()}>Record return</button>
                    <button type="button" class={styles.dangerAction} disabled={busy()} onClick={refund}>
                      Refund through Mollie
                    </button>
                  </div>
                </form>
              </div>
              <Show when={message()}>
                <p class={styles.inlineMessage}>{message()}</p>
              </Show>
            </div>
          </td>
        </tr>
      </Show>
    </>
  );
}

function CustomerRow(props: {
  customer: AdminCustomer;
  onRemoved: () => unknown;
}) {
  const [expanded, setExpanded] = createSignal(false);
  const [confirming, setConfirming] = createSignal(false);
  const [removing, setRemoving] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const [notes, setNotes] = createSignal(props.customer.notes);
  const [tags, setTags] = createSignal(props.customer.tags.join(", "));
  const [suspended, setSuspended] = createSignal(props.customer.suspended);

  const saveControls = async () => {
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/admin/customers", {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update",
        id: props.customer.id,
        notes: notes(),
        tags: tags()
          .split(",")
          .map(tag => tag.trim())
          .filter(Boolean),
        suspended: suspended(),
      }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(result.error ?? "Customer controls could not be saved.");
      setSaving(false);
      return;
    }
    await Promise.resolve(props.onRemoved());
    setMessage("Customer controls saved");
    setSaving(false);
  };

  const revokeSessions = async () => {
    if (!window.confirm("Sign this customer out on every device?")) return;
    setMessage("");
    const response = await fetch("/api/admin/customers", {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "revoke_sessions",
        id: props.customer.id,
      }),
    });
    const result = (await response.json()) as { error?: string };
    setMessage(
      response.ok
        ? "All customer sessions revoked"
        : result.error ?? "Sessions could not be revoked.",
    );
  };

  const remove = async () => {
    if (!confirming()) {
      setConfirming(true);
      setMessage("Click again to permanently remove this account.");
      return;
    }

    setRemoving(true);
    const response = await fetch("/api/admin/customers", {
      method: "DELETE",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: props.customer.id,
        confirmation: "REMOVE",
      }),
    });
    const result = (await response.json()) as {
      error?: string;
      message?: string;
    };
    if (!response.ok) {
      setMessage(result.error ?? "The account could not be removed.");
      setRemoving(false);
      return;
    }

    await Promise.resolve(props.onRemoved());
  };

  return (
    <>
      <tr>
        <td>
          <div class={styles.customerIdentity}>
            <span>{initials(props.customer.name)}</span>
            <strong>{props.customer.name}</strong>
          </div>
        </td>
        <td>{props.customer.email}</td>
        <td>
          <span class={`${styles.status} ${props.customer.emailVerified ? styles.verified : styles.unverified}`}>
            {props.customer.emailVerified ? "Verified" : "Unverified"}
          </span>
        </td>
        <td>{props.customer.orderCount}</td>
        <td>{formatMoney(props.customer.spentCents)}</td>
        <td>
          <span class={`${styles.status} ${props.customer.suspended ? styles.cancelled : styles.active}`}>
            {props.customer.suspended ? "Suspended" : "Active"}
          </span>
        </td>
        <td>
          <button type="button" class={styles.editAction} onClick={() => setExpanded(value => !value)}>
            {expanded() ? "Close" : "Manage"}
          </button>
        </td>
      </tr>
      <Show when={expanded()}>
        <tr class={styles.editorRow}>
          <td colSpan={7}>
            <div class={styles.customerEditor}>
              <div>
                <h3>{props.customer.name}</h3>
                <p>Joined {formatDate(props.customer.createdAt)}. Authentication secrets are never exposed.</p>
              </div>
              <div class={styles.customerControlGrid}>
                <label>
                  <span>Internal tags</span>
                  <input
                    placeholder="VIP, wholesale, review"
                    value={tags()}
                    onInput={event => setTags(event.currentTarget.value)}
                  />
                  <small>Separate tags with commas.</small>
                </label>
                <label class={styles.toggleField}>
                  <input
                    type="checkbox"
                    checked={suspended()}
                    onChange={event => setSuspended(event.currentTarget.checked)}
                  />
                  <span>Suspend account access</span>
                </label>
                <label class={styles.spanTwo}>
                  <span>Private owner notes</span>
                  <textarea rows="4" value={notes()} onInput={event => setNotes(event.currentTarget.value)} />
                </label>
              </div>
              <div class={styles.dangerControls}>
                <button type="button" onClick={saveControls} disabled={saving()}>
                  {saving() ? "Saving controls" : "Save customer controls"}
                </button>
                <button type="button" onClick={revokeSessions}>Sign out all devices</button>
                <Show when={confirming()}>
                  <button type="button" onClick={() => {
                    setConfirming(false);
                    setMessage("");
                  }}>
                    Cancel removal
                  </button>
                </Show>
                <button
                  type="button"
                  classList={{ [styles.removeConfirm]: confirming() }}
                  onClick={remove}
                  disabled={removing()}
                >
                  {removing()
                    ? "Removing"
                    : confirming()
                      ? "Confirm account removal"
                      : "Remove account"}
                </button>
              </div>
              <Show when={message()}>
                <p class={styles.inlineMessage}>{message()}</p>
              </Show>
            </div>
          </td>
        </tr>
      </Show>
    </>
  );
}

function DiscountManager(props: {
  discounts: AdminDiscount[];
  onUpdated: () => unknown;
}) {
  const [code, setCode] = createSignal("");
  const [type, setType] = createSignal<"percentage" | "fixed">("percentage");
  const [value, setValue] = createSignal("");
  const [minimum, setMinimum] = createSignal("0");
  const [maximumUses, setMaximumUses] = createSignal("");
  const [expiresAt, setExpiresAt] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [message, setMessage] = createSignal("");

  const createDiscount = async (event: SubmitEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/admin/discounts", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: code(),
        type: type(),
        value:
          type() === "percentage"
            ? Math.round(Number(value()))
            : Math.round(Number(value()) * 100),
        minimumOrderCents: Math.round(Number(minimum()) * 100),
        maximumUses: maximumUses() ? Number(maximumUses()) : null,
        expiresAt: expiresAt() ? new Date(expiresAt()).toISOString() : null,
      }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(result.error ?? "Discount could not be created.");
      setBusy(false);
      return;
    }
    await Promise.resolve(props.onUpdated());
    setCode("");
    setValue("");
    setMaximumUses("");
    setExpiresAt("");
    setMessage("Discount code created");
    setBusy(false);
  };

  const toggleDiscount = async (discount: AdminDiscount) => {
    const response = await fetch("/api/admin/discounts", {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: discount.id, active: !discount.active }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(result.error ?? "Discount could not be updated.");
      return;
    }
    await Promise.resolve(props.onUpdated());
  };

  return (
    <>
      <section class={styles.sectionIntro}>
        <div>
          <h2>Discount campaigns</h2>
          <p>Create controlled checkout codes with limits, minimum totals, and expiry dates.</p>
        </div>
      </section>
      <form class={styles.discountForm} onSubmit={createDiscount}>
        <label>
          <span>Code</span>
          <input required placeholder="HAVEN10" value={code()} onInput={event => setCode(event.currentTarget.value.toUpperCase())} />
        </label>
        <label>
          <span>Discount type</span>
          <select value={type()} onChange={event => setType(event.currentTarget.value as "percentage" | "fixed")}>
            <option value="percentage">Percentage</option>
            <option value="fixed">Fixed EUR amount</option>
          </select>
        </label>
        <label>
          <span>{type() === "percentage" ? "Percent" : "Amount in EUR"}</span>
          <input required type="number" min="1" step={type() === "percentage" ? "1" : "0.01"} value={value()} onInput={event => setValue(event.currentTarget.value)} />
        </label>
        <label>
          <span>Minimum order in EUR</span>
          <input type="number" min="0" step="0.01" value={minimum()} onInput={event => setMinimum(event.currentTarget.value)} />
        </label>
        <label>
          <span>Maximum uses</span>
          <input type="number" min="1" step="1" placeholder="Unlimited" value={maximumUses()} onInput={event => setMaximumUses(event.currentTarget.value)} />
        </label>
        <label>
          <span>Expires</span>
          <input type="datetime-local" value={expiresAt()} onInput={event => setExpiresAt(event.currentTarget.value)} />
        </label>
        <button type="submit" class={styles.primaryAction} disabled={busy()}>
          {busy() ? "Creating code" : "Create discount"}
        </button>
        <Show when={message()}><p class={styles.inlineMessage}>{message()}</p></Show>
      </form>
      <div class={styles.discountGrid}>
        <For each={props.discounts}>
          {discount => (
            <article>
              <header>
                <strong>{discount.code}</strong>
                <span class={`${styles.status} ${discount.active ? styles.active : styles.cancelled}`}>
                  {discount.active ? "Active" : "Disabled"}
                </span>
              </header>
              <h3>
                {discount.type === "percentage"
                  ? `${discount.value}% off`
                  : `${formatMoney(discount.value)} off`}
              </h3>
              <p>
                {discount.minimumOrderCents
                  ? `Minimum ${formatMoney(discount.minimumOrderCents)}`
                  : "No minimum order"}
              </p>
              <small>
                {discount.usedCount} used
                {discount.maximumUses ? ` of ${discount.maximumUses}` : ""}
              </small>
              <button type="button" onClick={() => toggleDiscount(discount)}>
                {discount.active ? "Disable code" : "Enable code"}
              </button>
            </article>
          )}
        </For>
      </div>
    </>
  );
}

function StorefrontManager(props: {
  settings?: Partial<StorefrontSettings>;
  onUpdated: () => unknown;
}) {
  const defaults: StorefrontSettings = {
    announcement: "",
    heroTitle: "Umbreon VMAX has landed",
    heroCopy:
      "Freshly graded cards and collector favourites, ready to ship from our Dutch stock.",
    featuredProductSlugs: [],
    socialInstagram: "",
    socialTiktok: "",
    socialYoutube: "",
    socialDiscord: "",
  };
  const [settings, setSettings] = createSignal<StorefrontSettings>({
    ...defaults,
    ...(props.settings ?? {}),
    featuredProductSlugs: props.settings?.featuredProductSlugs ?? [],
  });
  const [busy, setBusy] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const patch = <K extends keyof StorefrontSettings>(
    key: K,
    value: StorefrontSettings[K],
  ) => setSettings(current => ({ ...current, [key]: value }));

  const save = async (event: SubmitEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/admin/content", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings()),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(result.error ?? "Storefront settings could not be saved.");
      setBusy(false);
      return;
    }
    await Promise.resolve(props.onUpdated());
    setMessage("Storefront content published");
    setBusy(false);
  };

  return (
    <>
      <section class={styles.sectionIntro}>
        <div>
          <h2>Storefront controls</h2>
          <p>Update homepage messaging and social links without editing code.</p>
        </div>
        <A href="/" target="_blank">Preview storefront</A>
      </section>
      <form class={styles.contentForm} onSubmit={save}>
        <section>
          <h3>Homepage message</h3>
          <label>
            <span>Announcement bar</span>
            <input maxlength="180" placeholder="Free shipping this weekend" value={settings().announcement} onInput={event => patch("announcement", event.currentTarget.value)} />
          </label>
          <label>
            <span>Hero title</span>
            <input required maxlength="100" value={settings().heroTitle} onInput={event => patch("heroTitle", event.currentTarget.value)} />
          </label>
          <label>
            <span>Hero copy</span>
            <textarea required rows="4" maxlength="300" value={settings().heroCopy} onInput={event => patch("heroCopy", event.currentTarget.value)} />
          </label>
          <label>
            <span>Featured product slugs</span>
            <textarea
              rows="4"
              placeholder="umbreon-vmax, charizard-base-set"
              value={settings().featuredProductSlugs.join(", ")}
              onInput={event => patch(
                "featuredProductSlugs",
                event.currentTarget.value.split(",").map(value => value.trim()).filter(Boolean),
              )}
            />
          </label>
        </section>
        <section>
          <h3>Social destinations</h3>
          <For each={[
            ["socialInstagram", "Instagram"],
            ["socialTiktok", "TikTok"],
            ["socialYoutube", "YouTube"],
            ["socialDiscord", "Discord"],
          ] as const}>
            {([key, label]) => (
              <label>
                <span>{label} URL</span>
                <input type="url" placeholder="https://" value={settings()[key]} onInput={event => patch(key, event.currentTarget.value)} />
              </label>
            )}
          </For>
          <div class={styles.publishNote}>
            <strong>Safe publishing</strong>
            <p>These values are treated as content only. They cannot expose database or payment credentials.</p>
          </div>
        </section>
        <div class={styles.formActions}>
          <Show when={message()}><p class={styles.inlineMessage}>{message()}</p></Show>
          <button type="submit" class={styles.primaryAction} disabled={busy()}>
            {busy() ? "Publishing changes" : "Publish storefront changes"}
          </button>
        </div>
      </form>
    </>
  );
}

export default function Admin() {
  const session = authClient.useSession();
  const [clientReady, setClientReady] = createSignal(false);
  const [section, setSection] = createSignal<AdminSection>("overview");
  const [dashboard, { refetch }] = createResource(
    clientReady,
    loadDashboard,
  );
  const [composerOpen, setComposerOpen] = createSignal(false);
  const [draft, setDraft] = createSignal<ProductDraft>({ ...emptyProduct });
  const [productStatus, setProductStatus] = createSignal("");
  const [savingProduct, setSavingProduct] = createSignal(false);
  const [orderMessage, setOrderMessage] = createSignal("");
  const [importMessage, setImportMessage] = createSignal("");
  const [importing, setImporting] = createSignal(false);
  let imageInput: HTMLInputElement | undefined;
  const productTable = createSolidTable({
    get data() {
      return dashboard()?.products ?? [];
    },
    columns: productColumns,
    getCoreRowModel: getCoreRowModel(),
  });
  const orderTable = createSolidTable({
    get data() {
      return dashboard()?.orders ?? [];
    },
    columns: orderColumns,
    getCoreRowModel: getCoreRowModel(),
  });
  const customerTable = createSolidTable({
    get data() {
      return dashboard()?.customers ?? [];
    },
    columns: customerColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  onMount(() => setClientReady(true));

  createEffect(() => {
    if (dashboard.error) {
      const status = (dashboard.error as Error & { status?: number }).status;
      if (status === 401 || status === 403) {
        window.location.replace("/admin/login");
      }
    }
  });

  const patchDraft = <K extends keyof ProductDraft>(
    key: K,
    value: ProductDraft[K],
  ) => setDraft(current => ({ ...current, [key]: value }));

  const loadProductImage = (file?: File) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setProductStatus("Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > 850_000) {
      setProductStatus("Use an image smaller than 850 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => patchDraft("image", String(reader.result ?? ""));
    reader.readAsDataURL(file);
  };

  const createProduct = async (event: SubmitEvent) => {
    event.preventDefault();
    setSavingProduct(true);
    setProductStatus("");
    const current = draft();
    const response = await fetch("/api/admin/products", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...current,
        priceCents: Math.round(Number(current.price) * 100),
        stock: Number(current.stock),
      }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setProductStatus(result.error ?? "Product could not be created.");
      setSavingProduct(false);
      return;
    }
    await refetch();
    setDraft({ ...emptyProduct });
    if (imageInput) imageInput.value = "";
    setProductStatus("Product created. Publish it when the listing is ready.");
    setSavingProduct(false);
  };

  const updateOrder = async (id: string, status: string) => {
    setOrderMessage("");
    const response = await fetch("/api/admin/orders", {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setOrderMessage(result.error ?? "Order could not be updated.");
      return;
    }
    await refetch();
    setOrderMessage("Order status updated.");
  };

  const importCsv = async (file?: File) => {
    if (!file) return;
    setImporting(true);
    setImportMessage("");
    try {
      const rows = parseCsv(await file.text());
      if (!rows.length) {
        setImportMessage("The CSV has no product rows.");
        return;
      }
      const response = await fetch("/api/admin/import", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, rows }),
      });
      const result = (await response.json()) as {
        error?: string;
        processedRows?: number;
        failedRows?: number;
      };
      if (!response.ok) {
        setImportMessage(result.error ?? "The CSV could not be imported.");
        return;
      }
      await refetch();
      setImportMessage(
        `${result.processedRows ?? 0} products imported. ${result.failedRows ?? 0} rows need attention.`,
      );
    } catch {
      setImportMessage("The CSV could not be read.");
    } finally {
      setImporting(false);
    }
  };

  const signOut = async () => {
    await authClient.signOut();
    window.location.assign("/admin/login");
  };

  return (
    <main class={styles.page}>
      <Title>Owner dashboard | TCGHaven</Title>
      <Show
        when={dashboard()}
        fallback={
          <div class={styles.loading}>
            <span />
            Loading shop operations
          </div>
        }
      >
        {data => (
          <div class={styles.shell}>
            <aside class={styles.sidebar}>
              <A href="/" class={styles.brand}>
                <img src="/images/logo-mark.png" alt="" />
                <div>
                  <strong>TCGHaven</strong>
                  <span>Owner workspace</span>
                </div>
              </A>

              <nav aria-label="Admin sections">
                <For each={NAV_ITEMS}>
                  {item => (
                    <button
                      type="button"
                      class={styles.navItem}
                      classList={{ [styles.navItemActive]: section() === item.id }}
                      onClick={() => setSection(item.id)}
                    >
                      <strong>{item.label}</strong>
                      <span>{item.short}</span>
                    </button>
                  )}
                </For>
              </nav>

              <div class={styles.owner}>
                <span class={styles.ownerAvatar}>
                  <Show when={data().owner.image} fallback={initials(data().owner.name)}>
                    <img src={data().owner.image!} alt="" />
                  </Show>
                </span>
                <div>
                  <strong>{data().owner.name}</strong>
                  <span>{data().owner.email}</span>
                </div>
              </div>
              <button class={styles.signOut} type="button" onClick={signOut}>
                Sign out
              </button>
            </aside>

            <section class={styles.workspace}>
              <header class={styles.topbar}>
                <div>
                  <p>Shop operations</p>
                  <h1>{NAV_ITEMS.find(item => item.id === section())?.label}</h1>
                </div>
                <div class={styles.topActions}>
                  <span class={styles.liveStatus}><i /> Store connected</span>
                  <A href="/" target="_blank">Open storefront</A>
                </div>
              </header>

              <div class={styles.content}>
                <Show when={section() === "overview"}>
                  <section class={styles.metrics} aria-label="Store totals">
                    <article>
                      <span>Revenue recorded</span>
                      <strong>{formatMoney(data().metrics.revenueCents)}</strong>
                      <small>Paid and fulfilled orders</small>
                    </article>
                    <article>
                      <span>Live products</span>
                      <strong>{data().metrics.activeProducts}</strong>
                      <small>{data().metrics.lowStock} need a stock check</small>
                    </article>
                    <article>
                      <span>Orders in progress</span>
                      <strong>{data().metrics.openOrders}</strong>
                      <small>Pending through processing</small>
                    </article>
                    <article>
                      <span>Customer accounts</span>
                      <strong>{data().metrics.customers}</strong>
                      <small>Registered shoppers</small>
                    </article>
                  </section>

                  <div class={styles.overviewGrid}>
                    <section class={styles.queue}>
                      <div class={styles.sectionHead}>
                        <div>
                          <h2>Fulfilment queue</h2>
                          <p>Orders that still need action.</p>
                        </div>
                        <button type="button" onClick={() => setSection("orders")}>View all orders</button>
                      </div>
                      <Show
                        when={data().orders.filter(order =>
                          ["pending", "paid", "processing"].includes(order.status),
                        ).length}
                        fallback={<p class={styles.empty}>No orders are waiting right now.</p>}
                      >
                        <For
                          each={data().orders
                            .filter(order =>
                              ["pending", "paid", "processing"].includes(order.status),
                            )
                            .slice(0, 7)}
                        >
                          {order => (
                            <div class={styles.queueRow}>
                              <div>
                                <strong>{order.orderNumber}</strong>
                                <span>{order.email}</span>
                              </div>
                              <span class={`${styles.status} ${styles[order.status]}`}>{order.status}</span>
                              <strong>{formatMoney(order.totalCents, order.currency)}</strong>
                            </div>
                          )}
                        </For>
                      </Show>
                    </section>

                    <aside class={styles.attention}>
                      <h2>Needs attention</h2>
                      <button type="button" onClick={() => setSection("products")}>
                        <strong>{data().metrics.lowStock}</strong>
                        <span>live products have three or fewer available</span>
                      </button>
                      <button type="button" onClick={() => setSection("products")}>
                        <strong>{data().products.filter(product => product.status === "draft").length}</strong>
                        <span>draft listings are waiting to publish</span>
                      </button>
                      <button type="button" onClick={() => setSection("imports")}>
                        <strong>{data().imports.filter(job => job.failedRows > 0).length}</strong>
                        <span>imports contain rejected rows</span>
                      </button>
                    </aside>
                  </div>

                  <section class={styles.lowStockCenter}>
                    <div class={styles.sectionHead}>
                      <div>
                        <h2>Low stock centre</h2>
                        <p>Live variants with three or fewer units available.</p>
                      </div>
                      <button type="button" onClick={() => setSection("products")}>Manage inventory</button>
                    </div>
                    <Show
                      when={data().products.filter(product =>
                        product.status === "active" &&
                        product.metadata.source !== "starter" &&
                        product.variants.some(
                          variant => variant.stock - variant.reservedStock <= 3,
                        ),
                      ).length}
                      fallback={<p class={styles.empty}>Every live product has healthy stock.</p>}
                    >
                      <div class={styles.lowStockGrid}>
                        <For each={data().products.filter(product =>
                          product.status === "active" &&
                          product.metadata.source !== "starter" &&
                          product.variants.some(
                            variant => variant.stock - variant.reservedStock <= 3,
                          ),
                        ).slice(0, 8)}>
                          {product => (
                            <article>
                              <Show when={product.imageUrls[0]}>
                                <img src={product.imageUrls[0]} alt="" />
                              </Show>
                              <div>
                                <strong>{product.name}</strong>
                                <span>{product.sku ?? "No SKU"}</span>
                              </div>
                              <b>{(product.stock ?? 0) - (product.reservedStock ?? 0)} left</b>
                            </article>
                          )}
                        </For>
                      </div>
                    </Show>
                  </section>
                </Show>

                <Show when={section() === "products"}>
                  <section class={styles.sectionIntro}>
                    <div>
                      <h2>Catalogue and inventory</h2>
                      <p>Live listings appear in the customer shop. Drafts remain private.</p>
                    </div>
                    <div class={styles.introActions}>
                      <A href="/api/admin/export?type=inventory" target="_blank">Export inventory CSV</A>
                      <button
                        type="button"
                        class={styles.primaryAction}
                        onClick={() => setComposerOpen(value => !value)}
                      >
                        <span aria-hidden="true">{composerOpen() ? "×" : "+"}</span>
                        {composerOpen() ? "Close product form" : "Add new product"}
                      </button>
                    </div>
                  </section>

                  <div class={styles.productGuide}>
                    <div>
                      <strong>Add one product</strong>
                      <span>Use the green button for cards, sealed products, graded cards, and accessories.</span>
                    </div>
                    <div>
                      <strong>Edit anything later</strong>
                      <span>Use Edit details in a product row to change its image, name, set, condition, or description.</span>
                    </div>
                    <div>
                      <strong>Choose when it appears</strong>
                      <span>Draft stays private. Live publishes the product in the customer shop.</span>
                    </div>
                  </div>

                  <Show when={composerOpen()}>
                    <form class={styles.productForm} onSubmit={createProduct}>
                      <div class={styles.formLead}>
                        <h3>New product listing</h3>
                        <p>Add a single, sealed item, graded card, or accessory.</p>
                      </div>
                      <div class={styles.formGrid}>
                        <label class={styles.spanTwo}>
                          <span>Product name</span>
                          <input required value={draft().name} onInput={event => patchDraft("name", event.currentTarget.value)} />
                        </label>
                        <label>
                          <span>Game</span>
                          <select value={draft().game} onChange={event => patchDraft("game", event.currentTarget.value as ProductDraft["game"])}>
                            <option value="pokemon">Pokémon</option>
                            <option value="yugioh">Yu-Gi-Oh!</option>
                            <option value="magic">Magic</option>
                            <option value="other">Other</option>
                          </select>
                        </label>
                        <label>
                          <span>Product type</span>
                          <select value={draft().productType} onChange={event => patchDraft("productType", event.currentTarget.value as ProductDraft["productType"])}>
                            <option value="single">Single</option>
                            <option value="sealed">Sealed</option>
                            <option value="graded">Graded</option>
                            <option value="accessory">Accessory</option>
                          </select>
                        </label>
                        <label>
                          <span>Set or collection</span>
                          <input value={draft().set} onInput={event => patchDraft("set", event.currentTarget.value)} />
                        </label>
                        <label>
                          <span>SKU</span>
                          <input placeholder="Created automatically if empty" value={draft().sku} onInput={event => patchDraft("sku", event.currentTarget.value)} />
                        </label>
                        <label>
                          <span>Price in EUR</span>
                          <input required type="number" min="0" step="0.01" value={draft().price} onInput={event => patchDraft("price", event.currentTarget.value)} />
                        </label>
                        <label>
                          <span>Stock</span>
                          <input required type="number" min="0" step="1" value={draft().stock} onInput={event => patchDraft("stock", event.currentTarget.value)} />
                        </label>
                        <label>
                          <span>Badge</span>
                          <input placeholder="New, Vintage, PSA 10" value={draft().badge} onInput={event => patchDraft("badge", event.currentTarget.value)} />
                        </label>
                        <label>
                          <span>Card number</span>
                          <input placeholder="025/165" value={draft().cardNumber} onInput={event => patchDraft("cardNumber", event.currentTarget.value)} />
                        </label>
                        <label>
                          <span>Set code</span>
                          <input placeholder="MEW" value={draft().setCode} onInput={event => patchDraft("setCode", event.currentTarget.value)} />
                        </label>
                        <label>
                          <span>Rarity</span>
                          <input placeholder="Ultra rare" value={draft().rarity} onInput={event => patchDraft("rarity", event.currentTarget.value)} />
                        </label>
                        <label>
                          <span>Finish</span>
                          <input placeholder="Holofoil" value={draft().finish} onInput={event => patchDraft("finish", event.currentTarget.value)} />
                        </label>
                        <label>
                          <span>Illustrator</span>
                          <input value={draft().illustrator} onInput={event => patchDraft("illustrator", event.currentTarget.value)} />
                        </label>
                        <label>
                          <span>Grading company</span>
                          <input placeholder="PSA, BGS, CGC" value={draft().gradingCompany} onInput={event => patchDraft("gradingCompany", event.currentTarget.value)} />
                        </label>
                        <label>
                          <span>Grade</span>
                          <input placeholder="10" value={draft().grade} onInput={event => patchDraft("grade", event.currentTarget.value)} />
                        </label>
                        <label>
                          <span>Certification number</span>
                          <input value={draft().certificationNumber} onInput={event => patchDraft("certificationNumber", event.currentTarget.value)} />
                        </label>
                        <label>
                          <span>Initial status</span>
                          <select value={draft().status} onChange={event => patchDraft("status", event.currentTarget.value as ProductDraft["status"])}>
                            <option value="draft">Save as draft</option>
                            <option value="active">Publish now</option>
                          </select>
                        </label>
                        <label class={styles.spanTwo}>
                          <span>Description</span>
                          <textarea rows="4" value={draft().description} onInput={event => patchDraft("description", event.currentTarget.value)} />
                        </label>
                        <label class={styles.imageField}>
                          <span>Product image</span>
                          <input
                            ref={imageInput}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={event => loadProductImage(event.currentTarget.files?.[0])}
                          />
                          <small>JPG, PNG, or WebP. Maximum 850 KB.</small>
                        </label>
                        <label>
                          <span>Or image URL</span>
                          <input type="url" placeholder="https://" value={draft().image.startsWith("data:") ? "" : draft().image} onInput={event => patchDraft("image", event.currentTarget.value)} />
                        </label>
                      </div>
                      <div class={styles.formActions}>
                        <Show when={draft().image}>
                          <img class={styles.imagePreview} src={draft().image} alt="Product preview" />
                        </Show>
                        <Show when={productStatus()}>
                          <p role="status">{productStatus()}</p>
                        </Show>
                        <button type="submit" disabled={savingProduct()}>
                          {savingProduct() ? "Creating product" : "Create product"}
                        </button>
                      </div>
                    </form>
                  </Show>

                  <div class={styles.tableWrap}>
                    <table>
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Game</th>
                          <th>Price EUR</th>
                          <th>Stock</th>
                          <th>Visibility</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        <For each={productTable.getRowModel().rows}>
                          {row => <ProductRow product={row.original} onSaved={refetch} />}
                        </For>
                      </tbody>
                    </table>
                    <Show when={!data().products.length}>
                      <div class={styles.catalogEmpty}>
                        <strong>Your managed catalogue is empty</strong>
                        <p>Add one product here, or use Bulk import for a full inventory file.</p>
                        <button type="button" onClick={() => setComposerOpen(true)}>
                          + Add the first product
                        </button>
                      </div>
                    </Show>
                  </div>
                </Show>

                <Show when={section() === "orders"}>
                  <section class={styles.sectionIntro}>
                    <div>
                      <h2>Order fulfilment</h2>
                      <p>Review items and addresses, dispatch parcels, print invoices, record returns, and issue Mollie refunds.</p>
                    </div>
                    <A href="/api/admin/export?type=orders" target="_blank">Export orders CSV</A>
                    <Show when={orderMessage()}><p class={styles.inlineMessage}>{orderMessage()}</p></Show>
                  </section>
                  <div class={styles.tableWrap}>
                    <table>
                      <thead><tr><th>Order</th><th>Customer</th><th>Date</th><th>Total</th><th>Status</th><th>Details</th></tr></thead>
                      <tbody>
                        <For each={orderTable.getRowModel().rows}>
                          {row => <OrderRow order={row.original} onUpdated={refetch} />}
                        </For>
                      </tbody>
                    </table>
                    <Show when={!data().orders.length}><p class={styles.empty}>No orders have been placed yet.</p></Show>
                  </div>
                </Show>

                <Show when={section() === "customers"}>
                  <section class={styles.sectionIntro}>
                    <div>
                      <h2>Customer accounts</h2>
                      <p>Add internal notes and tags, suspend access, revoke sessions, and review customer value.</p>
                    </div>
                    <A href="/api/admin/export?type=customers" target="_blank">Export customers CSV</A>
                  </section>
                  <div class={styles.tableWrap}>
                    <table>
                      <thead><tr><th>Customer</th><th>Email</th><th>Verification</th><th>Orders</th><th>Spent</th><th>Access</th><th>Controls</th></tr></thead>
                      <tbody>
                        <For each={customerTable.getRowModel().rows}>
                          {row => <CustomerRow customer={row.original} onRemoved={refetch} />}
                        </For>
                      </tbody>
                    </table>
                    <Show when={!data().customers.length}><p class={styles.empty}>No customer accounts yet.</p></Show>
                  </div>
                </Show>

                <Show when={section() === "discounts"}>
                  <DiscountManager discounts={data().discounts} onUpdated={refetch} />
                </Show>

                <Show when={section() === "storefront"}>
                  <StorefrontManager settings={data().content.home} onUpdated={refetch} />
                </Show>

                <Show when={section() === "analytics"}>
                  <section class={styles.sectionIntro}>
                    <div>
                      <h2>Sales analytics</h2>
                      <p>A clear view of recent revenue, order value, and repeat customers.</p>
                    </div>
                    <A href="/api/admin/export?type=orders" target="_blank">Export source data</A>
                  </section>
                  <section class={styles.analyticsMetrics}>
                    <article>
                      <span>Revenue</span>
                      <strong>{formatMoney(data().metrics.revenueCents)}</strong>
                      <small>Paid and fulfilled orders</small>
                    </article>
                    <article>
                      <span>Average order</span>
                      <strong>{formatMoney(data().analytics.averageOrderCents)}</strong>
                      <small>Across loaded order history</small>
                    </article>
                    <article>
                      <span>Returning customers</span>
                      <strong>{data().analytics.returningCustomers}</strong>
                      <small>Customers with multiple orders</small>
                    </article>
                  </section>
                  <section class={styles.salesChart}>
                    <div class={styles.sectionHead}>
                      <div>
                        <h2>Recent sales</h2>
                        <p>Revenue recorded per day.</p>
                      </div>
                    </div>
                    <Show when={data().analytics.salesByDay.length} fallback={<p class={styles.empty}>Sales data will appear after the first paid order.</p>}>
                      <div class={styles.chartRows}>
                        <For each={data().analytics.salesByDay.slice(-30)}>
                          {day => {
                            const maximum = Math.max(
                              1,
                              ...data().analytics.salesByDay.map(point => point.revenueCents),
                            );
                            return (
                              <div>
                                <span>{formatDate(`${day.date}T12:00:00Z`)}</span>
                                <i><b style={{ width: `${Math.max(2, day.revenueCents / maximum * 100)}%` }} /></i>
                                <strong>{formatMoney(day.revenueCents)}</strong>
                                <small>{day.orders} orders</small>
                              </div>
                            );
                          }}
                        </For>
                      </div>
                    </Show>
                  </section>
                </Show>

                <Show when={section() === "activity"}>
                  <section class={styles.sectionIntro}>
                    <div>
                      <h2>Owner activity</h2>
                      <p>Security history for catalogue, customer, order, discount, and storefront changes.</p>
                    </div>
                  </section>
                  <div class={styles.activityList}>
                    <For each={data().audit}>
                      {entry => (
                        <article>
                          <span class={styles.activityMark} />
                          <div>
                            <strong>{entry.summary}</strong>
                            <p>{entry.actorName ?? entry.actorEmail ?? "System"} · {entry.entityType}</p>
                          </div>
                          <span>{formatDate(entry.createdAt)}</span>
                        </article>
                      )}
                    </For>
                    <Show when={!data().audit.length}>
                      <p class={styles.empty}>Admin activity will appear here.</p>
                    </Show>
                  </div>
                </Show>

                <Show when={section() === "imports"}>
                  <section class={styles.importHero}>
                    <div>
                      <h2>Import a full catalogue</h2>
                      <p>
                        Add up to 1,000 products from one CSV. Every imported row is recorded and stock movements remain traceable.
                      </p>
                    </div>
                    <div class={styles.importActions}>
                      <button type="button" onClick={downloadTemplate}>Download CSV template</button>
                      <label class={styles.primaryAction}>
                        {importing() ? "Importing products" : "Choose CSV file"}
                        <input
                          type="file"
                          accept=".csv,text/csv"
                          disabled={importing()}
                          onChange={event => importCsv(event.currentTarget.files?.[0])}
                        />
                      </label>
                    </div>
                  </section>
                  <Show when={importMessage()}><p class={styles.importMessage} role="status">{importMessage()}</p></Show>

                  <section class={styles.importGuide}>
                    <div>
                      <h3>How the product file works</h3>
                      <p>Download the template, keep the header row, fill one product per line, then upload the completed CSV.</p>
                    </div>
                    <dl>
                      <div><dt>game</dt><dd>pokemon, yugioh, magic, or other</dd></div>
                      <div><dt>productType</dt><dd>single, sealed, graded, or accessory</dd></div>
                      <div><dt>price</dt><dd>Use euros, for example 12.95</dd></div>
                      <div><dt>status</dt><dd>draft for private or active for live</dd></div>
                      <div><dt>image</dt><dd>Optional HTTPS image address</dd></div>
                      <div><dt>sku</dt><dd>A unique stock code for every row</dd></div>
                    </dl>
                  </section>

                  <section class={styles.importHistory}>
                    <div class={styles.sectionHead}>
                      <div><h2>Import history</h2><p>Recent catalogue jobs and rejected rows.</p></div>
                    </div>
                    <Show when={data().imports.length} fallback={<p class={styles.empty}>No CSV imports have run yet.</p>}>
                      <For each={data().imports}>
                        {job => (
                          <div class={styles.importRow}>
                            <div><strong>{job.fileName ?? "Catalogue import"}</strong><span>{formatDate(job.createdAt)}</span></div>
                            <span class={`${styles.status} ${styles[job.status]}`}>{job.status}</span>
                            <span>{job.processedRows} imported</span>
                            <span>{job.failedRows} rejected</span>
                          </div>
                        )}
                      </For>
                    </Show>
                  </section>
                </Show>
              </div>
            </section>
          </div>
        )}
      </Show>
    </main>
  );
}
