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
import { INTERNATIONAL_POSTNL_DESTINATIONS } from "~/lib/shipping";
import {
  DEFAULT_STORE_PROFILE,
  parseStoreProfile,
  type StoreProfile,
} from "~/lib/store-profile";
import styles from "./index.module.scss";

type AdminSection =
  | "overview"
  | "products"
  | "orders"
  | "contacts"
  | "customers"
  | "discounts"
  | "storefront"
  | "store"
  | "analytics"
  | "activity"
  | "imports"
  | "readiness";

type AdminVariant = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  condition: string | null;
  language: string | null;
  finish: string | null;
  imageUrl: string | null;
  isDefault: boolean;
  priceCents: number;
  compareAtPriceCents: number | null;
  stock: number;
  reservedStock: number;
  trackInventory: boolean;
};

type AdminProduct = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  brand: string | null;
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
  shippingMethod: string;
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

type AdminContactMessage = {
  id: string;
  name: string;
  email: string;
  topic: string;
  message: string;
  status: "unread" | "read" | "resolved";
  notificationSent: boolean;
  createdAt: string;
  updatedAt: string;
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

type CsvImportRow = {
  name: string;
  game: string;
  productType: string;
  set: string;
  sku: string;
  priceCents: number;
  stock: number;
  image: string;
  status: "draft";
};

type CsvPreview = {
  fileName: string;
  rows: CsvImportRow[];
  issues: string[];
};

type YugiohPrinting = {
  id: string;
  setName: string;
  setCode: string;
  rarity: string;
  rarityCode: string | null;
};

type YugiohCard = {
  id: number;
  name: string;
  cardType: string;
  archetype: string | null;
  attribute: string | null;
  cardmarketPriceCents: number | null;
  importedStatus: "draft" | "active" | "archived" | null;
  printings: YugiohPrinting[];
};

type AdminDashboard = {
  owner: { id: string; name: string; email: string; image: string | null };
  metrics: {
    revenueCents: number;
    activeProducts: number;
    openOrders: number;
    lowStock: number;
    customers: number;
    unreadMessages: number;
  };
  products: AdminProduct[];
  orders: AdminOrder[];
  customers: AdminCustomer[];
  contacts: AdminContactMessage[];
  imports: ImportJob[];
  discounts: AdminDiscount[];
  content: {
    home?: Partial<StorefrontSettings>;
    business?: StoreProfile;
  };
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
  readiness: {
    ready: boolean;
    blockers: number;
    complete: number;
    total: number;
    items: Array<{
      id: string;
      category: "commerce" | "operations" | "legal" | "growth";
      label: string;
      detail: string;
      responsible: "developer" | "owner" | "joint";
      configured: boolean;
      blocking: boolean;
    }>;
  };
};

type ProductDraft = {
  name: string;
  slug: string;
  brand: string;
  game:
    | "pokemon"
    | "yugioh"
    | "magic"
    | "lorcana"
    | "riftbound"
    | "digimon"
    | "cyberpunk"
    | "other";
  productType: "single" | "sealed" | "graded" | "accessory";
  set: string;
  sku: string;
  variantName: string;
  barcode: string;
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
  shipsFrom: string;
  trailerUrl: string;
  releaseDate: string;
  preorder: boolean;
  finish: string;
  price: string;
  compareAtPrice: string;
  stock: string;
  trackInventory: boolean;
  status: "draft" | "active";
};

type VariantDraft = {
  name: string;
  sku: string;
  barcode: string;
  condition: string;
  language: string;
  finish: string;
  imageUrl: string;
  isDefault: boolean;
  price: string;
  compareAtPrice: string;
  stock: string;
  trackInventory: boolean;
};

type EditableVariantDraft = VariantDraft & { id: string };

const emptyProduct: ProductDraft = {
  name: "",
  slug: "",
  brand: "",
  game: "pokemon",
  productType: "single",
  set: "",
  sku: "",
  variantName: "Default",
  barcode: "",
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
  shipsFrom: "",
  trailerUrl: "",
  releaseDate: "",
  preorder: false,
  finish: "",
  price: "",
  compareAtPrice: "",
  stock: "1",
  trackInventory: true,
  status: "draft",
};

function createEmptyVariantDraft(): VariantDraft {
  return {
    name: "",
    sku: "",
    barcode: "",
    condition: "Near Mint",
    language: "English",
    finish: "",
    imageUrl: "",
    isDefault: false,
    price: "",
    compareAtPrice: "",
    stock: "0",
    trackInventory: true,
  };
}

const NAV_ITEMS: Array<{ id: AdminSection; label: string; short: string }> = [
  { id: "overview", label: "Overview", short: "Today" },
  { id: "products", label: "Catalogue", short: "Products and stock" },
  { id: "orders", label: "Orders", short: "Fulfilment" },
  { id: "contacts", label: "Messages", short: "Customer inbox" },
  { id: "customers", label: "Customers", short: "Accounts" },
  { id: "discounts", label: "Discounts", short: "Campaigns" },
  { id: "storefront", label: "Storefront", short: "Homepage content" },
  { id: "store", label: "Store setup", short: "Business and shipping" },
  { id: "analytics", label: "Analytics", short: "Sales performance" },
  { id: "activity", label: "Activity", short: "Security history" },
  { id: "imports", label: "Bulk import", short: "CSV tools" },
  { id: "readiness", label: "Launch readiness", short: "Owner and developer" },
];

const READINESS_CATEGORIES = [
  ["commerce", "Commerce core"],
  ["operations", "Operations"],
  ["legal", "Owner and legal"],
  ["growth", "Optional growth"],
] as const;

const ORDER_STATUSES = [
  "pending",
  "paid",
  "processing",
  "shipped",
  "completed",
  "cancelled",
  "refunded",
];

const CATALOG_PAGE_SIZES = [25, 50, 100] as const;

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

function eurosToCents(value: string) {
  return Math.round(Number(value) * 100);
}

function optionalEurosToCents(value: string) {
  return value.trim() ? eurosToCents(value) : null;
}

function centsToEuros(value: number | null | undefined) {
  return value == null ? "" : (value / 100).toFixed(2);
}

function editableVariantFrom(variant: AdminVariant): EditableVariantDraft {
  return {
    id: variant.id,
    name: variant.name,
    sku: variant.sku,
    barcode: variant.barcode ?? "",
    condition: variant.condition ?? "",
    language: variant.language ?? "",
    finish: variant.finish ?? "",
    imageUrl: variant.imageUrl ?? "",
    isDefault: variant.isDefault,
    price: centsToEuros(variant.priceCents),
    compareAtPrice: centsToEuros(variant.compareAtPriceCents),
    stock: String(variant.stock),
    trackInventory: variant.trackInventory,
  };
}

function matchesCatalogueFilters(
  product: AdminProduct,
  query: string,
  game: string,
  status: string,
) {
  if (game !== "all" && product.game !== game) return false;
  if (status !== "all" && product.status !== status) return false;

  const terms = query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (terms.length === 0) return true;

  const searchable = [
    product.name,
    product.slug,
    product.brand,
    product.game,
    typeof product.metadata.set === "string" ? product.metadata.set : "",
    ...product.variants.flatMap(variant => [
      variant.name,
      variant.sku,
      variant.barcode,
      variant.condition,
      variant.language,
      variant.finish,
    ]),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLocaleLowerCase();

  return terms.every(term => searchable.includes(term));
}

function readProductImage(
  file: File | undefined,
  onLoad: (image: string) => void,
  onError: (message: string) => void,
) {
  if (!file) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    onError("Choose a JPG, PNG, or WebP image.");
    return;
  }
  if (file.size > 850_000) {
    onError("Use an image smaller than 850 KB.");
    return;
  }

  const reader = new FileReader();
  reader.onload = () => onLoad(String(reader.result ?? ""));
  reader.readAsDataURL(file);
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
  ];
  const csv = `${header.map(escapeCsvCell).join(",")}\n${sample.map(escapeCsvCell).join(",")}\n`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "tcghaven-product-import.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

function parseCsv(text: string): Omit<CsvPreview, "fileName"> {
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
  if (!headers) return { rows: [], issues: ["The CSV is empty."] };
  const normalizedHeaders = headers.map(header => header.trim().toLowerCase());
  const indexOf = (name: string) =>
    normalizedHeaders.indexOf(name.toLowerCase());
  const requiredHeaders = ["name", "game", "producttype", "sku", "price", "stock"];
  const missingHeaders = requiredHeaders.filter(header => !normalizedHeaders.includes(header));
  if (missingHeaders.length) {
    return {
      rows: [],
      issues: [`Missing columns: ${missingHeaders.join(", ")}. Download a fresh template.`],
    };
  }

  const allowedGames = new Set([
    "pokemon",
    "yugioh",
    "magic",
    "lorcana",
    "riftbound",
    "digimon",
    "cyberpunk",
    "other",
  ]);
  const allowedTypes = new Set(["single", "sealed", "graded", "accessory"]);
  const parsedRows: CsvImportRow[] = [];
  const issues: string[] = [];
  const seenSkus = new Map<string, number>();

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const name = row[indexOf("name")]?.trim() ?? "";
    const game = row[indexOf("game")]?.trim().toLowerCase() ?? "";
    const productType = row[indexOf("productType")]?.trim().toLowerCase() ?? "";
    const set = row[indexOf("set")]?.trim() ?? "";
    const sku = row[indexOf("sku")]?.trim() ?? "";
    const price = Number(row[indexOf("price")]?.trim());
    const stock = Number(row[indexOf("stock")]?.trim());
    const image = row[indexOf("image")]?.trim() ?? "";

    if (name.length < 2) issues.push(`Row ${rowNumber}: enter a product name.`);
    if (!allowedGames.has(game)) issues.push(`Row ${rowNumber}: game is not supported.`);
    if (!allowedTypes.has(productType)) issues.push(`Row ${rowNumber}: productType is not supported.`);
    if (!sku) issues.push(`Row ${rowNumber}: enter a unique SKU.`);
    if (!Number.isFinite(price) || price <= 0) issues.push(`Row ${rowNumber}: price must be more than €0.`);
    if (!Number.isInteger(stock) || stock < 0) issues.push(`Row ${rowNumber}: stock must be a whole number of 0 or more.`);
    if (image) {
      try {
        if (new URL(image).protocol !== "https:") throw new Error();
      } catch {
        issues.push(`Row ${rowNumber}: image must be a valid HTTPS address.`);
      }
    }

    const normalizedSku = sku.toLocaleLowerCase("en-US");
    const firstSkuRow = seenSkus.get(normalizedSku);
    if (sku && firstSkuRow !== undefined) {
      issues.push(`Row ${rowNumber}: SKU ${sku} is already used on row ${firstSkuRow}.`);
    } else if (sku) {
      seenSkus.set(normalizedSku, rowNumber);
    }

    parsedRows.push({
      name,
      game,
      productType,
      set,
      sku,
      priceCents: Number.isFinite(price) ? Math.round(price * 100) : 0,
      stock: Number.isFinite(stock) ? stock : -1,
      image,
      status: "draft",
    });
  });

  if (parsedRows.length > 1000) issues.push("A CSV can contain no more than 1,000 products.");
  return { rows: parsedRows, issues };
}

function ProductRow(props: {
  product: AdminProduct;
  onSaved: () => unknown;
  selectable?: boolean;
  isSelected?: () => boolean;
  onToggle?: () => void;
}) {
  const metadata = () => props.product.metadata ?? {};
  const metadataText = (key: string) =>
    typeof metadata()[key] === "string" ? metadata()[key] as string : "";
  const [editing, setEditing] = createSignal(false);
  const [name, setName] = createSignal(props.product.name);
  const [slug, setSlug] = createSignal(props.product.slug);
  const [brand, setBrand] = createSignal(props.product.brand ?? "");
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
  const [shipsFrom, setShipsFrom] = createSignal(metadataText("shipsFrom"));
  const [finish, setFinish] = createSignal(
    props.product.variants[0]?.finish ?? "",
  );
  const [sku, setSku] = createSignal(props.product.sku ?? "");
  const [variantName, setVariantName] = createSignal(
    props.product.variants[0]?.name ?? "Default",
  );
  const [barcode, setBarcode] = createSignal(
    props.product.variants[0]?.barcode ?? "",
  );
  const [condition, setCondition] = createSignal(
    props.product.productType === "sealed"
      ? "Sealed"
      : props.product.condition ?? "Near Mint",
  );
  const [language, setLanguage] = createSignal(
    props.product.language ?? "English",
  );
  const [image, setImage] = createSignal(props.product.imageUrls[0] ?? "");
  const [trailerUrl, setTrailerUrl] = createSignal(metadataText("trailerUrl"));
  const [releaseDate, setReleaseDate] = createSignal(metadataText("releaseDate"));
  const [preorder, setPreorder] = createSignal(metadata().preorder === true);
  const [price, setPrice] = createSignal(
    centsToEuros(props.product.priceCents ?? 0),
  );
  const [compareAtPrice, setCompareAtPrice] = createSignal(
    centsToEuros(props.product.compareAtPriceCents),
  );
  const [stock, setStock] = createSignal(String(props.product.stock ?? 0));
  const [trackInventory, setTrackInventory] = createSignal(
    props.product.variants[0]?.trackInventory ?? true,
  );
  const [status, setStatus] = createSignal(props.product.status);
  const [saving, setSaving] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const [variantOpen, setVariantOpen] = createSignal(false);
  const [variantDraft, setVariantDraft] = createSignal<VariantDraft>(
    createEmptyVariantDraft(),
  );
  const [variantEditDraft, setVariantEditDraft] =
    createSignal<EditableVariantDraft | null>(null);

  const loadImage = (file?: File) => {
    readProductImage(file, setImage, setMessage);
  };

  const duplicateProduct = async () => {
    setSaving(true);
    setMessage("Creating draft copy");
    const response = await fetch("/api/admin/duplicate-product", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: props.product.id }),
    });
    const result = (await response.json()) as {
      error?: string;
      product?: { name: string; slug: string };
    };
    if (!response.ok) {
      setMessage(result.error ?? "Product could not be duplicated.");
      setSaving(false);
      return;
    }

    await Promise.resolve(props.onSaved());
    setMessage(`${result.product?.name ?? "Product copy"} created as a draft`);
    setSaving(false);
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
        slug: slug(),
        brand: brand(),
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
        shipsFrom: shipsFrom(),
        finish: finish(),
        sku: sku(),
        variantName: variantName(),
        barcode: barcode(),
        condition: condition(),
        language: language(),
        image: image(),
        trailerUrl: trailerUrl(),
        releaseDate: releaseDate(),
        preorder: preorder(),
        priceCents: eurosToCents(price()),
        compareAtPriceCents: optionalEurosToCents(compareAtPrice()),
        stock: Number(stock()),
        trackInventory: trackInventory(),
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
        barcode: current.barcode,
        condition: productType() === "sealed" ? "Sealed" : current.condition,
        language: current.language,
        finish: current.finish,
        imageUrl: current.imageUrl,
        isDefault: current.isDefault,
        priceCents: eurosToCents(current.price),
        compareAtPriceCents: optionalEurosToCents(current.compareAtPrice),
        stock: Number(current.stock),
        trackInventory: current.trackInventory,
      }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(result.error ?? "Variant could not be added.");
      setSaving(false);
      return;
    }
    await Promise.resolve(props.onSaved());
    setVariantDraft(createEmptyVariantDraft());
    setVariantOpen(false);
    setMessage("Variant added");
    setSaving(false);
  };

  const editVariant = (variant: AdminVariant) => {
    setVariantEditDraft(editableVariantFrom(variant));
  };

  const saveVariant = async (event: SubmitEvent) => {
    event.preventDefault();
    const current = variantEditDraft();
    if (!current) return;
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/admin/variants", {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: current.id,
        productId: props.product.id,
        name: current.name,
        sku: current.sku,
        barcode: current.barcode,
        condition: productType() === "sealed" ? "Sealed" : current.condition,
        language: current.language,
        finish: current.finish,
        imageUrl: current.imageUrl,
        isDefault: current.isDefault,
        priceCents: eurosToCents(current.price),
        compareAtPriceCents: optionalEurosToCents(current.compareAtPrice),
        stock: Number(current.stock),
        trackInventory: current.trackInventory,
      }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(result.error ?? "Variant could not be saved.");
      setSaving(false);
      return;
    }
    await Promise.resolve(props.onSaved());
    setVariantEditDraft(null);
    setMessage("Variant saved");
    setSaving(false);
  };

  const archiveProduct = async () => {
    if (metadataText("source") === "starter") return;
    if (!window.confirm(`Archive ${name()}? It will disappear from the shop but remain recoverable.`)) return;
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/admin/products", {
      method: "DELETE",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: props.product.id }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(result.error ?? "Product could not be archived.");
      setSaving(false);
      return;
    }
    setStatus("archived");
    await Promise.resolve(props.onSaved());
    setEditing(false);
    setMessage("Product archived");
    setSaving(false);
  };

  const removeVariant = async (variant: Pick<AdminVariant, "id" | "sku">) => {
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
    setVariantEditDraft(null);
    setMessage("Variant removed");
  };

  return (
    <>
      <tr>
        <td>
          <div class={styles.selectableCell}>
            <Show when={props.selectable}>
              <input
                type="checkbox"
                class={styles.rowCheckbox}
                checked={props.isSelected?.() ?? false}
                onChange={() => props.onToggle?.()}
                aria-label={`Select ${name()}`}
              />
            </Show>
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
              class={styles.duplicateAction}
              disabled={saving()}
              title="Create an editable draft copy"
              onClick={duplicateProduct}
            >
              Duplicate
            </button>
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
                <div class={styles.editorSectionHeading}>
                  <span>Listing</span>
                  <p>Customer-facing identity, URL, and visibility.</p>
                </div>
                <label class={styles.spanTwo}>
                  <span>Product name</span>
                  <input value={name()} onInput={event => setName(event.currentTarget.value)} />
                </label>
                <label>
                  <span>URL slug</span>
                  <input required placeholder="umbreon-vmax" value={slug()} onInput={event => setSlug(event.currentTarget.value)} />
                  <small>/products/{slug() || "product-name"}</small>
                </label>
                <label>
                  <span>Brand or manufacturer</span>
                  <input placeholder="The Pokémon Company" value={brand()} onInput={event => setBrand(event.currentTarget.value)} />
                </label>
                <label>
                  <span>Game</span>
                  <select value={game()} onChange={event => setGame(event.currentTarget.value as ProductDraft["game"])}>
                    <option value="pokemon">Pokémon</option>
                    <option value="yugioh">Yu-Gi-Oh!</option>
                    <option value="magic">Magic</option>
                    <option value="lorcana">Disney Lorcana</option>
                    <option value="riftbound">Riftbound</option>
                    <option value="digimon">Digimon</option>
                    <option value="cyberpunk">Cyberpunk</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label>
                  <span>Product type</span>
                  <select value={productType()} onChange={event => {
                    const nextType = event.currentTarget.value as ProductDraft["productType"];
                    setProductType(nextType);
                    if (nextType === "sealed") setCondition("Sealed");
                  }}>
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
                  <span>Set code</span>
                  <input placeholder="MEW, BLCR, MH3" value={setCode()} onInput={event => setSetCode(event.currentTarget.value.toUpperCase())} />
                  <small>The official code printed on products from this set.</small>
                </label>
                <label>
                  <span>Visibility</span>
                  <select value={status()} onChange={event => setStatus(event.currentTarget.value as AdminProduct["status"])}>
                    <option value="draft">Draft, private</option>
                    <option value="active">Live in shop</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>
                <label>
                  <span>Release date</span>
                  <input type="date" value={releaseDate()} onInput={event => setReleaseDate(event.currentTarget.value)} />
                  <small>Future dates place this item under upcoming releases.</small>
                </label>
                <label class={styles.editorToggle}>
                  <input type="checkbox" checked={preorder()} onChange={event => setPreorder(event.currentTarget.checked)} />
                  <span>Accept as pre-order</span>
                  <small>Shows this product in the upcoming release shelf.</small>
                </label>
                <div class={styles.editorSectionHeading}>
                  <span>Pricing and inventory</span>
                  <p>The first variant shown in the catalogue row.</p>
                </div>
                <label>
                  <span>SKU</span>
                  <input value={sku()} onInput={event => setSku(event.currentTarget.value)} />
                </label>
                <label>
                  <span>Format or variant name</span>
                  <input placeholder={productType() === "sealed" ? "Booster pack" : "Default"} value={variantName()} onInput={event => setVariantName(event.currentTarget.value)} />
                  <small>Customers use this to choose a pack, box, language, or printing.</small>
                </label>
                <label>
                  <span>Barcode</span>
                  <input placeholder="EAN, UPC, or internal barcode" value={barcode()} onInput={event => setBarcode(event.currentTarget.value)} />
                </label>
                <label>
                  <span>Selling price in EUR</span>
                  <input required type="number" min="0" step="0.01" value={price()} onInput={event => setPrice(event.currentTarget.value)} />
                </label>
                <label>
                  <span>Original price in EUR</span>
                  <input type="number" min="0" step="0.01" placeholder="Optional sale comparison" value={compareAtPrice()} onInput={event => setCompareAtPrice(event.currentTarget.value)} />
                </label>
                <label>
                  <span>Physical stock</span>
                  <input required type="number" min="0" step="1" value={stock()} onInput={event => setStock(event.currentTarget.value)} />
                  <small>{props.product.reservedStock ?? 0} currently reserved at checkout</small>
                </label>
                <label class={styles.editorToggle}>
                  <input type="checkbox" checked={trackInventory()} onChange={event => setTrackInventory(event.currentTarget.checked)} />
                  <span>Track and reserve inventory</span>
                  <small>Disable only for products that cannot sell out.</small>
                </label>
                <label>
                  <span>Condition</span>
                  <input value={productType() === "sealed" ? "Sealed" : condition()} disabled={productType() === "sealed"} onInput={event => setCondition(event.currentTarget.value)} />
                </label>
                <label>
                  <span>Language</span>
                  <input value={language()} onInput={event => setLanguage(event.currentTarget.value)} />
                </label>
                <label>
                  <span>Finish</span>
                  <input placeholder="Holofoil" value={finish()} onInput={event => setFinish(event.currentTarget.value)} />
                </label>
                <div class={styles.editorSectionHeading}>
                  <span>Card and grading details</span>
                  <p>Optional collector data shown on eligible product pages.</p>
                </div>
                <label>
                  <span>Badge</span>
                  <input placeholder="New, Vintage, PSA 10" value={badge()} onInput={event => setBadge(event.currentTarget.value)} />
                </label>
                <label>
                  <span>Card number</span>
                  <input placeholder="025/165" value={cardNumber()} onInput={event => setCardNumber(event.currentTarget.value)} />
                </label>
                <label>
                  <span>Rarity</span>
                  <input placeholder="Special illustration rare" value={rarity()} onInput={event => setRarity(event.currentTarget.value)} />
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
                  <span>Ships from</span>
                  <input placeholder="NL" value={shipsFrom()} onInput={event => setShipsFrom(event.currentTarget.value)} />
                </label>
                <div class={styles.editorSectionHeading}>
                  <span>Media and description</span>
                  <p>Use a clean product image and an accurate condition description.</p>
                </div>
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
                <Show when={productType() === "sealed"}>
                  <label class={styles.spanTwo}>
                    <span>Set trailer URL</span>
                    <input
                      type="url"
                      placeholder="https://www.youtube.com/watch?v=..."
                      value={trailerUrl()}
                      onInput={event => setTrailerUrl(event.currentTarget.value)}
                    />
                    <small>Optional. YouTube trailers appear only on sealed product pages.</small>
                  </label>
                </Show>
                <label class={styles.spanTwo}>
                  <span>Description</span>
                  <textarea rows="4" value={description()} onInput={event => setDescription(event.currentTarget.value)} />
                </label>
              </div>
              <div class={styles.editorActions}>
                <Show when={metadataText("source") !== "starter" && status() !== "archived"}>
                  <button type="button" class={styles.archiveAction} onClick={archiveProduct} disabled={saving()}>
                    Archive product
                  </button>
                </Show>
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
                    <p>Manage pack, box, language, printing, price, and stock options.</p>
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
                          <strong>
                            {variant.name}
                            <Show when={variant.isDefault}>
                              <small class={styles.mainVariantBadge}>Main</small>
                            </Show>
                          </strong>
                          <small>{variant.sku}</small>
                        </span>
                        <span>{variant.condition ?? "No condition"}</span>
                        <span>{variant.language ?? "No language"}</span>
                        <span>{variant.finish || "Standard"}</span>
                        <span>{formatMoney(variant.priceCents)}</span>
                        <span>{variant.stock - variant.reservedStock} available</span>
                        <span class={styles.variantActions}>
                          <button type="button" onClick={() => editVariant(variant)}>Edit</button>
                          <button type="button" onClick={() => removeVariant(variant)}>Remove</button>
                        </span>
                      </div>
                    )}
                  </For>
                </div>
                <Show when={variantEditDraft()}>
                  {current => (
                    <form class={`${styles.variantForm} ${styles.variantEditForm}`} onSubmit={saveVariant}>
                      <div class={styles.variantFormHeading}>
                        <strong>Edit variant</strong>
                        <button type="button" onClick={() => setVariantEditDraft(null)}>Cancel</button>
                      </div>
                      <label>
                        <span>Variant name</span>
                        <input required value={current().name} onInput={event => setVariantEditDraft(value => value && ({ ...value, name: event.currentTarget.value }))} />
                      </label>
                      <label>
                        <span>SKU</span>
                        <input required value={current().sku} onInput={event => setVariantEditDraft(value => value && ({ ...value, sku: event.currentTarget.value }))} />
                      </label>
                      <label>
                        <span>Barcode</span>
                        <input value={current().barcode} onInput={event => setVariantEditDraft(value => value && ({ ...value, barcode: event.currentTarget.value }))} />
                      </label>
                      <label>
                        <span>Condition</span>
                        <input value={productType() === "sealed" ? "Sealed" : current().condition} disabled={productType() === "sealed"} onInput={event => setVariantEditDraft(value => value && ({ ...value, condition: event.currentTarget.value }))} />
                      </label>
                      <label>
                        <span>Language</span>
                        <input value={current().language} onInput={event => setVariantEditDraft(value => value && ({ ...value, language: event.currentTarget.value }))} />
                      </label>
                      <label>
                        <span>Finish</span>
                        <input value={current().finish} onInput={event => setVariantEditDraft(value => value && ({ ...value, finish: event.currentTarget.value }))} />
                      </label>
                      <label>
                        <span>Variant photo</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={event => readProductImage(
                            event.currentTarget.files?.[0],
                            imageUrl => setVariantEditDraft(value => value && ({ ...value, imageUrl })),
                            setMessage,
                          )}
                        />
                      </label>
                      <label>
                        <span>Variant image URL</span>
                        <input
                          type="url"
                          placeholder="https://"
                          value={current().imageUrl.startsWith("data:") ? "" : current().imageUrl}
                          onInput={event => setVariantEditDraft(value => value && ({ ...value, imageUrl: event.currentTarget.value }))}
                        />
                      </label>
                      <Show when={current().imageUrl}>
                        <img class={styles.variantImagePreview} src={current().imageUrl} alt="Selected variant preview" />
                      </Show>
                      <label class={styles.variantToggle}>
                        <input
                          type="checkbox"
                          checked={current().isDefault}
                          disabled={current().isDefault}
                          onChange={event => setVariantEditDraft(value => value && ({ ...value, isDefault: event.currentTarget.checked }))}
                        />
                        <span>Use as the main variant</span>
                        <small>
                          {current().isDefault
                            ? "Already main. Choose another variant to replace it."
                            : "This price and image appear first in product lists."}
                        </small>
                      </label>
                      <label>
                        <span>Selling price</span>
                        <input required type="number" min="0" step="0.01" value={current().price} onInput={event => setVariantEditDraft(value => value && ({ ...value, price: event.currentTarget.value }))} />
                      </label>
                      <label>
                        <span>Original price</span>
                        <input type="number" min="0" step="0.01" value={current().compareAtPrice} onInput={event => setVariantEditDraft(value => value && ({ ...value, compareAtPrice: event.currentTarget.value }))} />
                      </label>
                      <label>
                        <span>Physical stock</span>
                        <input required type="number" min="0" step="1" value={current().stock} onInput={event => setVariantEditDraft(value => value && ({ ...value, stock: event.currentTarget.value }))} />
                      </label>
                      <label class={styles.variantToggle}>
                        <input type="checkbox" checked={current().trackInventory} onChange={event => setVariantEditDraft(value => value && ({ ...value, trackInventory: event.currentTarget.checked }))} />
                        <span>Track inventory</span>
                      </label>
                      <button type="submit" class={styles.primaryAction} disabled={saving()}>
                        {saving() ? "Saving variant" : "Save variant"}
                      </button>
                      <button
                        type="button"
                        class={styles.variantDeleteAction}
                        disabled={saving()}
                        onClick={() => removeVariant(current())}
                      >
                        Delete selected variant
                      </button>
                    </form>
                  )}
                </Show>
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
                      <span>Barcode</span>
                      <input value={variantDraft().barcode} onInput={event => setVariantDraft(current => ({ ...current, barcode: event.currentTarget.value }))} />
                    </label>
                    <label>
                      <span>Condition</span>
                      <input value={productType() === "sealed" ? "Sealed" : variantDraft().condition} disabled={productType() === "sealed"} onInput={event => setVariantDraft(current => ({ ...current, condition: event.currentTarget.value }))} />
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
                      <span>Variant photo</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={event => readProductImage(
                          event.currentTarget.files?.[0],
                          imageUrl => setVariantDraft(current => ({ ...current, imageUrl })),
                          setMessage,
                        )}
                      />
                    </label>
                    <label>
                      <span>Variant image URL</span>
                      <input
                        type="url"
                        placeholder="https://"
                        value={variantDraft().imageUrl.startsWith("data:") ? "" : variantDraft().imageUrl}
                        onInput={event => setVariantDraft(current => ({ ...current, imageUrl: event.currentTarget.value }))}
                      />
                    </label>
                    <Show when={variantDraft().imageUrl}>
                      <img class={styles.variantImagePreview} src={variantDraft().imageUrl} alt="New variant preview" />
                    </Show>
                    <label class={styles.variantToggle}>
                      <input
                        type="checkbox"
                        checked={variantDraft().isDefault}
                        onChange={event => setVariantDraft(current => ({ ...current, isDefault: event.currentTarget.checked }))}
                      />
                      <span>Make this the main variant</span>
                      <small>Show this price and photo as the product default.</small>
                    </label>
                    <label>
                      <span>Price in EUR</span>
                      <input required type="number" min="0" step="0.01" value={variantDraft().price} onInput={event => setVariantDraft(current => ({ ...current, price: event.currentTarget.value }))} />
                    </label>
                    <label>
                      <span>Original price in EUR</span>
                      <input type="number" min="0" step="0.01" value={variantDraft().compareAtPrice} onInput={event => setVariantDraft(current => ({ ...current, compareAtPrice: event.currentTarget.value }))} />
                    </label>
                    <label>
                      <span>Opening stock</span>
                      <input required type="number" min="0" step="1" value={variantDraft().stock} onInput={event => setVariantDraft(current => ({ ...current, stock: event.currentTarget.value }))} />
                    </label>
                    <label class={styles.variantToggle}>
                      <input type="checkbox" checked={variantDraft().trackInventory} onChange={event => setVariantDraft(current => ({ ...current, trackInventory: event.currentTarget.checked }))} />
                      <span>Track inventory</span>
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
                    <div><dt>Method</dt><dd>{props.order.shippingMethod.replaceAll("_", " ")}</dd></div>
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

function ContactInbox(props: {
  messages: AdminContactMessage[];
  onUpdated: () => unknown;
}) {
  const [busyId, setBusyId] = createSignal("");
  const [message, setMessage] = createSignal("");
  const [replyingTo, setReplyingTo] = createSignal("");
  const [reply, setReply] = createSignal("");

  const openReply = (item: AdminContactMessage) => {
    setMessage("");
    setReply("");
    setReplyingTo(current => current === item.id ? "" : item.id);
  };

  const sendReply = async (
    event: SubmitEvent,
    item: AdminContactMessage,
  ) => {
    event.preventDefault();
    const replyText = reply().trim();
    if (replyText.length < 2) {
      setMessage("Write a reply before sending it.");
      return;
    }

    setBusyId(item.id);
    setMessage("");
    try {
      const response = await fetch("/api/admin/contacts", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, reply: replyText }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(result.error ?? "The reply could not be sent.");
        return;
      }

      setReply("");
      setReplyingTo("");
      setMessage(`Reply sent to ${item.email}.`);
      await Promise.resolve(props.onUpdated());
    } catch {
      setMessage("The reply could not be sent. Check your connection and try again.");
    } finally {
      setBusyId("");
    }
  };

  const updateStatus = async (
    id: string,
    status: AdminContactMessage["status"],
  ) => {
    setBusyId(id);
    setMessage("");
    try {
      const response = await fetch("/api/admin/contacts", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(result.error ?? "The message could not be updated.");
        return;
      }
      await Promise.resolve(props.onUpdated());
    } catch {
      setMessage("The message could not be updated.");
    } finally {
      setBusyId("");
    }
  };

  const removeMessage = async (id: string) => {
    if (!window.confirm("Permanently delete this contact message?")) return;
    setBusyId(id);
    setMessage("");
    try {
      const response = await fetch("/api/admin/contacts", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, confirmation: "DELETE" }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(result.error ?? "The message could not be removed.");
        return;
      }
      await Promise.resolve(props.onUpdated());
    } catch {
      setMessage("The message could not be removed.");
    } finally {
      setBusyId("");
    }
  };

  return (
    <>
      <section class={styles.sectionIntro}>
        <div>
          <h2>Customer inbox</h2>
          <p>Contact submissions are stored here even when SMTP notifications are unavailable.</p>
        </div>
        <span class={styles.inboxCount}>
          {props.messages.filter(item => item.status === "unread").length} unread
        </span>
      </section>
      <Show when={message()}>
        <p class={styles.inlineMessage} role="alert">{message()}</p>
      </Show>
      <div class={styles.contactInbox}>
        <For each={props.messages}>
          {item => (
            <article
              class={styles.contactMessage}
              classList={{ [styles.contactUnread]: item.status === "unread" }}
            >
              <header>
                <div>
                  <strong>{item.name}</strong>
                  <button
                    type="button"
                    class={styles.contactEmailButton}
                    title={`Reply to ${item.email}`}
                    onClick={() => openReply(item)}
                  >
                    {item.email}
                  </button>
                </div>
                <div>
                  <span data-status={item.status}>{item.status}</span>
                  <time datetime={item.createdAt}>{formatDate(item.createdAt)}</time>
                </div>
              </header>
              <div class={styles.contactBody}>
                <h3>{item.topic}</h3>
                <p>{item.message}</p>
              </div>
              <footer>
                <button
                  type="button"
                  class={styles.contactReplyButton}
                  aria-expanded={replyingTo() === item.id}
                  aria-controls={`contact-reply-${item.id}`}
                  onClick={() => openReply(item)}
                >
                  {replyingTo() === item.id ? "Close reply" : "Reply here"}
                </button>
                <a
                  href={`mailto:${item.email}?subject=${encodeURIComponent(`Re: ${item.topic}`)}`}
                  title={`Open your mail app and email ${item.email}`}
                >
                  Open mail app
                </a>
                <Show when={item.status === "unread"}>
                  <button
                    type="button"
                    disabled={busyId() === item.id}
                    onClick={() => updateStatus(item.id, "read")}
                  >
                    Mark as read
                  </button>
                </Show>
                <Show when={item.status !== "resolved"}>
                  <button
                    type="button"
                    disabled={busyId() === item.id}
                    onClick={() => updateStatus(item.id, "resolved")}
                  >
                    Resolve
                  </button>
                </Show>
                <button
                  type="button"
                  class={styles.contactDelete}
                  disabled={busyId() === item.id}
                  onClick={() => removeMessage(item.id)}
                >
                  Delete permanently
                </button>
              </footer>
              <Show when={replyingTo() === item.id}>
                <form
                  id={`contact-reply-${item.id}`}
                  class={styles.contactReplyForm}
                  onSubmit={event => sendReply(event, item)}
                >
                  <div class={styles.contactReplyHeading}>
                    <div>
                      <strong>Reply to {item.name}</strong>
                      <span>{item.email}</span>
                    </div>
                    <span>Re: {item.topic}</span>
                  </div>
                  <label for={`contact-reply-message-${item.id}`}>Message</label>
                  <textarea
                    id={`contact-reply-message-${item.id}`}
                    value={reply()}
                    maxLength={5_000}
                    rows={7}
                    placeholder={`Write your reply to ${item.name}…`}
                    disabled={busyId() === item.id}
                    onInput={event => setReply(event.currentTarget.value)}
                    required
                  />
                  <div class={styles.contactReplyActions}>
                    <span>{reply().length.toLocaleString()} / 5,000</span>
                    <button
                      type="button"
                      disabled={busyId() === item.id}
                      onClick={() => setReplyingTo("")}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={busyId() === item.id || reply().trim().length < 2}
                    >
                      {busyId() === item.id ? "Sending…" : "Send email"}
                    </button>
                  </div>
                </form>
              </Show>
            </article>
          )}
        </For>
        <Show when={!props.messages.length}>
          <div class={styles.empty}>No contact messages yet.</div>
        </Show>
      </div>
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

function StoreSetupManager(props: {
  profile?: StoreProfile;
  onUpdated: () => unknown;
}) {
  const [profile, setProfile] = createSignal<StoreProfile>(
    parseStoreProfile(props.profile ?? DEFAULT_STORE_PROFILE),
  );
  const [busy, setBusy] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const patch = <K extends keyof StoreProfile>(
    key: K,
    value: StoreProfile[K],
  ) => setProfile(current => ({ ...current, [key]: value }));
  const patchInternationalRate = (countryCode: string, value: number) =>
    setProfile(current => ({
      ...current,
      internationalPostnlRates: {
        ...current.internationalPostnlRates,
        [countryCode]: value,
      },
    }));
  const euros = (cents: number | null) =>
    cents === null ? "" : (cents / 100).toFixed(2);
  const cents = (value: string) => Math.max(0, Math.round(Number(value) * 100));

  const save = async (event: SubmitEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/store-profile", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile()),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(result.error ?? "Store settings could not be saved.");
        return;
      }
      await Promise.resolve(props.onUpdated());
      setMessage("Store details and shipping prices saved");
    } catch {
      setMessage("Store settings are unavailable right now.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section class={styles.sectionIntro}>
        <div>
          <h2>Store setup</h2>
          <p>Manage public business details and owner-approved PostNL shipping prices.</p>
        </div>
        <A href="/shipping" target="_blank">Preview shipping page</A>
      </section>

      <Show when={!profile().businessAddress || !profile().returnAddress}>
        <div class={styles.storeSetupNotice}>
          <strong>Setup is not complete</strong>
          <p>
            Add the registered business address and Dutch return address before launch.
          </p>
        </div>
      </Show>

      <form class={styles.storeSetupForm} onSubmit={save}>
        <section>
          <div class={styles.storeFormHeading}>
            <span>Business identity</span>
            <h3>Public company details</h3>
          </div>
          <div class={styles.storeFields}>
            <label>
              <span>Company name</span>
              <input required value={profile().companyName} onInput={event => patch("companyName", event.currentTarget.value)} />
            </label>
            <label>
              <span>KVK number</span>
              <input required inputmode="numeric" value={profile().kvkNumber} onInput={event => patch("kvkNumber", event.currentTarget.value)} />
            </label>
            <label>
              <span>VAT ID</span>
              <input required value={profile().vatId} onInput={event => patch("vatId", event.currentTarget.value.toUpperCase())} />
            </label>
            <label>
              <span>Business email</span>
              <input required type="email" value={profile().businessEmail} onInput={event => patch("businessEmail", event.currentTarget.value)} />
            </label>
            <label>
              <span>Private contact notification email</span>
              <input required type="email" autocomplete="off" value={profile().contactNotificationEmail} onInput={event => patch("contactNotificationEmail", event.currentTarget.value)} />
              <small>Receives contact-form copies and is never shown publicly</small>
            </label>
            <label>
              <span>Customer email sender</span>
              <input required type="email" value={profile().customerEmailFrom} onInput={event => patch("customerEmailFrom", event.currentTarget.value)} />
            </label>
            <label>
              <span>Phone number</span>
              <input required type="tel" value={profile().phone} onInput={event => patch("phone", event.currentTarget.value)} />
            </label>
            <label class={styles.spanTwo}>
              <span>Registered business address</span>
              <textarea required rows="3" placeholder="Street, house number, postal code, city, Netherlands" value={profile().businessAddress} onInput={event => patch("businessAddress", event.currentTarget.value)} />
            </label>
            <label class={styles.spanTwo}>
              <span>Dutch return address</span>
              <textarea required rows="3" placeholder="Street, house number, postal code, city, Netherlands" value={profile().returnAddress} onInput={event => patch("returnAddress", event.currentTarget.value)} />
            </label>
          </div>
        </section>

        <section>
          <div class={styles.storeFormHeading}>
            <span>Shipping</span>
            <h3>PostNL delivery prices</h3>
          </div>
          <div class={styles.carrierTags}>
            <For each={profile().carriers}>{carrier => <span>{carrier}</span>}</For>
          </div>
          <div class={styles.shippingRateGrid}>
            <label>
              <span>Letter or postcard</span>
              <div><b>€</b><input type="number" min="0" step="0.01" value={euros(profile().postnlLetterCents)} onInput={event => patch("postnlLetterCents", cents(event.currentTarget.value))} /></div>
              <small>Up to 2 kg</small>
            </label>
            <label>
              <span>Letterbox parcel</span>
              <div><b>€</b><input type="number" min="0" step="0.01" value={euros(profile().postnlLetterboxCents)} onInput={event => patch("postnlLetterboxCents", cents(event.currentTarget.value))} /></div>
              <small>38 × 26.5 × 3 cm</small>
            </label>
            <label>
              <span>Small parcel</span>
              <div><b>€</b><input type="number" min="0" step="0.01" value={euros(profile().postnlSmallParcelCents)} onInput={event => patch("postnlSmallParcelCents", cents(event.currentTarget.value))} /></div>
              <small>Up to 3 kg</small>
            </label>
            <label>
              <span>Medium parcel</span>
              <div><b>€</b><input type="number" min="0" step="0.01" value={euros(profile().postnlParcelCents)} onInput={event => patch("postnlParcelCents", cents(event.currentTarget.value))} /></div>
              <small>Up to 10 kg</small>
            </label>
            <label>
              <span>Large parcel</span>
              <div><b>€</b><input type="number" min="0" step="0.01" value={euros(profile().postnlLargeParcelCents)} onInput={event => patch("postnlLargeParcelCents", cents(event.currentTarget.value))} /></div>
              <small>Up to 23 kg</small>
            </label>
            <label>
              <span>Free shipping from</span>
              <div><b>€</b><input required type="number" min="0" step="0.01" value={euros(profile().freeShippingThresholdCents)} onInput={event => patch("freeShippingThresholdCents", cents(event.currentTarget.value))} /></div>
              <small>Based on cart subtotal</small>
            </label>
          </div>

          <div class={styles.internationalRateEditor}>
            <h4>International customer prices</h4>
            <p>Checkout uses the delivery country and verifies this price on the server.</p>
            <div class={styles.shippingRateGrid}>
              <For each={INTERNATIONAL_POSTNL_DESTINATIONS}>
                {destination => (
                  <label>
                    <span>{destination.name}</span>
                    <div>
                      <b>€</b>
                      <input
                        required
                        type="number"
                        min="0"
                        step="0.01"
                        value={euros(
                          profile().internationalPostnlRates[destination.code] ??
                            destination.priceCents,
                        )}
                        onInput={event =>
                          patchInternationalRate(
                            destination.code,
                            cents(event.currentTarget.value),
                          )
                        }
                      />
                    </div>
                    <small>{destination.zone}</small>
                  </label>
                )}
              </For>
            </div>
          </div>
        </section>

        <div class={styles.storeSetupActions}>
          <Show when={message()}><p role="status">{message()}</p></Show>
          <button type="submit" class={styles.primaryAction} disabled={busy()}>
            {busy() ? "Saving store setup" : "Save store setup"}
          </button>
        </div>
      </form>
    </>
  );
}

export default function Admin() {
  const [clientReady, setClientReady] = createSignal(false);
  const [section, setSection] = createSignal<AdminSection>("overview");
  const [dashboard, { refetch }] = createResource(
    clientReady,
    loadDashboard,
  );
  const [composerOpen, setComposerOpen] = createSignal(false);
  const [catalogSearch, setCatalogSearch] = createSignal("");
  const [catalogGame, setCatalogGame] = createSignal("all");
  const [catalogStatus, setCatalogStatus] = createSignal("all");
  const [catalogPage, setCatalogPage] = createSignal(1);
  const [catalogPageSize, setCatalogPageSize] = createSignal<number>(25);
  const [draft, setDraft] = createSignal<ProductDraft>({ ...emptyProduct });
  const [productStatus, setProductStatus] = createSignal("");
  const [savingProduct, setSavingProduct] = createSignal(false);
  const [importMessage, setImportMessage] = createSignal("");
  const [importing, setImporting] = createSignal(false);
  const [csvPreview, setCsvPreview] = createSignal<CsvPreview | null>(null);
  const [yugiohQuery, setYugiohQuery] = createSignal("");
  const [yugiohSearchBy, setYugiohSearchBy] = createSignal<"card" | "set">("card");
  const [yugiohMatchedSets, setYugiohMatchedSets] = createSignal<string[]>([]);
  const [yugiohCards, setYugiohCards] = createSignal<YugiohCard[]>([]);
  const [yugiohSearching, setYugiohSearching] = createSignal(false);
  const [yugiohImporting, setYugiohImporting] = createSignal<Set<number>>(new Set());
  const [yugiohMessage, setYugiohMessage] = createSignal("");
  const [yugiohSelected, setYugiohSelected] = createSignal<Set<number>>(new Set());
  const [yugiohBulkRunning, setYugiohBulkRunning] = createSignal(false);
  let yugiohSearchController: AbortController | undefined;
  let imageInput: HTMLInputElement | undefined;
  const [selectedVariantIds, setSelectedVariantIds] = createSignal<Set<string>>(
    new Set(),
  );
  const [bulkVisibility, setBulkVisibility] = createSignal("");
  const [bulkStock, setBulkStock] = createSignal("");
  const [bulkPrice, setBulkPrice] = createSignal("");
  const [bulkMessage, setBulkMessage] = createSignal("");
  const [bulkBusy, setBulkBusy] = createSignal(false);
  const filteredProducts = () =>
    (dashboard()?.products ?? []).filter(product =>
      matchesCatalogueFilters(
        product,
        catalogSearch(),
        catalogGame(),
        catalogStatus(),
      ),
    );
  const catalogPageCount = () =>
    Math.max(1, Math.ceil(filteredProducts().length / catalogPageSize()));
  const currentCatalogPage = () =>
    Math.min(catalogPage(), catalogPageCount());
  const paginatedProducts = () => {
    const start = (currentCatalogPage() - 1) * catalogPageSize();
    return filteredProducts().slice(start, start + catalogPageSize());
  };
  const catalogRangeStart = () =>
    filteredProducts().length
      ? (currentCatalogPage() - 1) * catalogPageSize() + 1
      : 0;
  const catalogRangeEnd = () =>
    Math.min(currentCatalogPage() * catalogPageSize(), filteredProducts().length);

  // Bulk edit only targets managed products (real database variants) —
  // starter/static listings must be saved once before they can be updated.
  const isManaged = (product: AdminProduct) =>
    !!product.variantId &&
    !product.variantId.startsWith("static:") &&
    !product.id.startsWith("static:");
  const selectableProducts = () => paginatedProducts().filter(isManaged);
  const bulkTargets = () =>
    selectableProducts().filter(product =>
      selectedVariantIds().has(product.variantId!),
    );
  const allSelected = () => {
    const selectable = selectableProducts();
    return (
      selectable.length > 0 &&
      selectable.every(product => selectedVariantIds().has(product.variantId!))
    );
  };
  const toggleSelect = (variantId: string) =>
    setSelectedVariantIds(previous => {
      const next = new Set(previous);
      if (next.has(variantId)) next.delete(variantId);
      else next.add(variantId);
      return next;
    });
  const toggleSelectAll = () =>
    setSelectedVariantIds(
      allSelected()
        ? new Set<string>()
        : new Set<string>(selectableProducts().map(product => product.variantId!)),
    );
  const clearSelection = () => setSelectedVariantIds(new Set<string>());

  const applyBulk = async (patch: Record<string, unknown>) => {
    const targets = bulkTargets();
    if (!targets.length) return;
    setBulkBusy(true);
    setBulkMessage("");
    try {
      const response = await fetch("/api/admin/products-bulk", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variantIds: targets.map(product => product.variantId),
          ...patch,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        updatedProducts?: number;
      };
      if (!response.ok) {
        setBulkMessage(result.error ?? "The selected products could not be updated.");
        return;
      }
      await refetch();
      clearSelection();
      setBulkVisibility("");
      setBulkStock("");
      setBulkPrice("");
      setBulkMessage(`${result.updatedProducts ?? targets.length} products updated.`);
    } catch {
      setBulkMessage("The bulk update could not reach the server. Try again.");
    } finally {
      setBulkBusy(false);
    }
  };
  const applyBulkStatus = () => {
    const status = bulkVisibility();
    if (!status) return;
    void applyBulk({ status });
  };
  const applyBulkStock = () => {
    const value = Number(bulkStock());
    if (!Number.isInteger(value) || value < 0) {
      setBulkMessage("Quantity must be a whole number of 0 or more.");
      return;
    }
    void applyBulk({ stock: value });
  };
  const applyBulkPrice = () => {
    const normalized = bulkPrice().trim().replace(",", ".");
    const value = Number(normalized);
    if (!Number.isFinite(value) || value <= 0 || value > 1_000_000) {
      setBulkMessage("Price must be between €0.01 and €1,000,000.");
      return;
    }
    void applyBulk({ priceCents: Math.round(value * 100) });
  };
  const deleteSelectedProducts = async () => {
    const targets = bulkTargets();
    if (!targets.length) return;
    if (!window.confirm(
      `Permanently delete ${targets.length} selected product${targets.length === 1 ? "" : "s"}? They will be removed from the catalogue and public shop. Existing order records stay intact.`,
    )) return;

    setBulkBusy(true);
    try {
      const failures: string[] = [];
      let removed = 0;
      for (const product of targets) {
        try {
          const response = await fetch("/api/admin/products", {
            method: "DELETE",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: product.id,
              confirmation: "DELETE",
            }),
          });
          const result = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          if (!response.ok) {
            failures.push(`${product.name}: ${result.error ?? `request failed (${response.status})`}`);
          } else {
            removed += 1;
          }
        } catch {
          failures.push(`${product.name}: network request failed`);
        }
      }
      await refetch();
      clearSelection();
      window.alert(
        failures.length
          ? `${removed} deleted. ${failures.length} failed:\n\n${failures.slice(0, 5).join("\n")}`
          : `${removed} product${removed === 1 ? "" : "s"} permanently deleted.`,
      );
    } finally {
      setBulkBusy(false);
    }
  };
  const productTable = createSolidTable({
    get data() {
      return paginatedProducts();
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
    readProductImage(
      file,
      image => patchDraft("image", image),
      setProductStatus,
    );
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
        priceCents: eurosToCents(current.price),
        compareAtPriceCents: optionalEurosToCents(current.compareAtPrice),
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

  const prepareCsv = async (file?: File) => {
    if (!file) return;
    setImportMessage("");
    try {
      if (file.size > 5_000_000) {
        setCsvPreview(null);
        setImportMessage("The CSV is too large. Use a file smaller than 5 MB.");
        return;
      }
      const parsed = parseCsv(await file.text());
      setCsvPreview({ fileName: file.name, ...parsed });
      if (!parsed.rows.length && !parsed.issues.length) {
        setImportMessage("The CSV has no product rows.");
      }
    } catch {
      setCsvPreview(null);
      setImportMessage("The CSV could not be read.");
    }
  };

  const importCsv = async () => {
    const preview = csvPreview();
    if (!preview || !preview.rows.length || preview.issues.length) return;
    setImporting(true);
    setImportMessage("");
    try {
      const response = await fetch("/api/admin/import", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: preview.fileName, rows: preview.rows }),
      });
      const result = (await response.json()) as {
        error?: string;
        processedRows?: number;
        createdRows?: number;
        updatedRows?: number;
        failedRows?: number;
        errors?: Array<{ row: number; message: string }>;
      };
      if (!response.ok) {
        setImportMessage(result.error ?? "The CSV could not be imported.");
        return;
      }
      await refetch();
      setCsvPreview(null);
      const rejectedDetails = (result.errors ?? [])
        .slice(0, 3)
        .map(error => `Row ${error.row}: ${error.message}`)
        .join(" ");
      setImportMessage(
        `${result.createdRows ?? 0} new drafts created. ${result.updatedRows ?? 0} existing products updated. ${result.failedRows ?? 0} rows were rejected.${rejectedDetails ? ` ${rejectedDetails}` : ""} Review the batch in Catalogue before publishing new products.`,
      );
    } catch {
      setImportMessage("The CSV import could not be completed.");
    } finally {
      setImporting(false);
    }
  };

  const searchYugiohCards = async (event: SubmitEvent) => {
    event.preventDefault();
    yugiohSearchController?.abort();
    const controller = new AbortController();
    yugiohSearchController = controller;
    setYugiohSearching(true);
    setYugiohMessage("");
    setYugiohSelected(new Set<number>());
    try {
      const response = await fetch(
        `/api/admin/ygoprodeck?by=${yugiohSearchBy()}&q=${encodeURIComponent(yugiohQuery().trim())}`,
        {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        },
      );
      const result = (await response.json().catch(() => ({}))) as {
        cards?: YugiohCard[];
        matchedSets?: string[];
        error?: string;
      };
      if (!response.ok) {
        setYugiohMessage(result.error ?? "The local Yu-Gi-Oh database could not be searched.");
        return;
      }
      setYugiohCards(result.cards ?? []);
      setYugiohMatchedSets(result.matchedSets ?? []);
      if (!result.cards?.length) setYugiohMessage("No matching cards found in the local snapshot.");
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setYugiohMessage("The local Yu-Gi-Oh database could not be searched.");
      }
    } finally {
      if (yugiohSearchController === controller) setYugiohSearching(false);
    }
  };

  // One request per card: the endpoint imports a single card, and running them
  // in sequence keeps the YGOPRODeck image fetches from being rate limited.
  const importYugiohCard = async (card: YugiohCard) => {
    const response = await fetch("/api/admin/ygoprodeck", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: card.id }),
    });
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
      variants?: number;
      hasImage?: boolean;
    };
    if (response.ok) {
      setYugiohCards(cards => cards.map(item =>
        item.id === card.id ? { ...item, importedStatus: "draft" } : item,
      ));
    }
    return { ok: response.ok, ...result };
  };

  const selectableYugiohCards = () =>
    yugiohCards().filter(card => !card.importedStatus);

  const toggleYugiohSelected = (cardId: number) => {
    setYugiohSelected(previous => {
      const next = new Set(previous);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  };

  const toggleAllYugiohSelected = () => {
    const selectable = selectableYugiohCards();
    setYugiohSelected(previous =>
      previous.size === selectable.length
        ? new Set<number>()
        : new Set<number>(selectable.map(card => card.id)),
    );
  };

  const runYugiohBulkImport = async (chosen: YugiohCard[]) => {
    if (!chosen.length) return;
    setYugiohBulkRunning(true);
    setYugiohMessage(`Adding ${chosen.length} cards...`);

    let added = 0;
    let withoutArt = 0;
    const failed: string[] = [];

    for (const [index, card] of chosen.entries()) {
      setYugiohMessage(`Adding ${index + 1} of ${chosen.length}: ${card.name}`);
      setYugiohImporting(previous => new Set(previous).add(card.id));
      try {
        const result = await importYugiohCard(card);
        if (result.ok) {
          added += 1;
          if (result.hasImage === false) withoutArt += 1;
        } else {
          failed.push(`${card.name} (${result.error ?? "failed"})`);
        }
      } catch {
        failed.push(`${card.name} (network error)`);
      } finally {
        setYugiohImporting(previous => {
          const next = new Set(previous);
          next.delete(card.id);
          return next;
        });
      }
    }

    setYugiohSelected(new Set<number>());
    setYugiohBulkRunning(false);
    setYugiohMessage(
      [
        `Added ${added} of ${chosen.length} cards as drafts.`,
        withoutArt ? `${withoutArt} came in without artwork.` : "",
        failed.length ? `Skipped: ${failed.slice(0, 3).join("; ")}${failed.length > 3 ? ` and ${failed.length - 3} more` : ""}.` : "",
      ].filter(Boolean).join(" "),
    );
    await refetch();
  };

  const addSelectedYugiohCards = () =>
    runYugiohBulkImport(
      yugiohCards().filter(card => yugiohSelected().has(card.id)),
    );

  const addAllYugiohResults = () =>
    runYugiohBulkImport(selectableYugiohCards());

  const addYugiohCard = async (card: YugiohCard) => {
    setYugiohImporting(previous => new Set(previous).add(card.id));
    setYugiohMessage("");
    try {
      const response = await fetch("/api/admin/ygoprodeck", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: card.id }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        variants?: number;
        hasImage?: boolean;
      };
      if (!response.ok) {
        setYugiohMessage(result.error ?? "The card could not be added.");
        return;
      }
      setYugiohCards(cards => cards.map(item =>
        item.id === card.id ? { ...item, importedStatus: "draft" } : item,
      ));
      setYugiohMessage(
        `${card.name} added as a draft with ${result.variants ?? card.printings.length} zero-stock variants.${
          result.hasImage === false ? " No artwork was available, so add an image before publishing." : ""
        }`,
      );
      await refetch();
    } finally {
      setYugiohImporting(previous => {
        const next = new Set(previous);
        next.delete(card.id);
        return next;
      });
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
                  <span class={styles.liveStatus}>
                    <i />
                    {data().readiness.ready
                      ? "Ready for owner approval"
                      : `${data().readiness.blockers} launch blockers`}
                  </span>
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

                <Show when={section() === "readiness"}>
                  <section class={styles.readinessHero}>
                    <div>
                      <span>Launch control</span>
                      <h2>
                        {data().readiness.ready
                          ? "The technical checklist is complete."
                          : `${data().readiness.blockers} required items still need attention.`}
                      </h2>
                      <p>
                        Developer tasks configure the application. Owner tasks require the shop owner's company data, provider accounts, commercial decisions, or formal approval.
                      </p>
                    </div>
                    <div class={styles.readinessScore}>
                      <strong>{data().readiness.complete}</strong>
                      <span>of {data().readiness.total} complete</span>
                    </div>
                  </section>

                  <div class={styles.readinessRoles}>
                    <article>
                      <span>Developer</span>
                      <strong>Build and configure</strong>
                      <p>Code, credentials wiring, monitoring, storage, deployment, and restore testing.</p>
                    </article>
                    <article>
                      <span>Shop owner</span>
                      <strong>Provide and approve</strong>
                      <p>Legal identity, VAT policy, carrier and payment accounts, rates, policies, and final approval.</p>
                    </article>
                  </div>

                  <For each={READINESS_CATEGORIES}>
                    {([category, label]) => (
                      <section class={styles.readinessGroup}>
                        <div class={styles.sectionHead}>
                          <div>
                            <h2>{label}</h2>
                            <p>Configuration status for this part of the shop.</p>
                          </div>
                        </div>
                        <div class={styles.readinessList}>
                          <For each={data().readiness.items.filter(item => item.category === category)}>
                            {item => (
                              <article classList={{ [styles.readinessDone]: item.configured }}>
                                <span class={styles.readinessMark} aria-hidden="true">
                                  {item.configured ? "✓" : "!"}
                                </span>
                                <div>
                                  <strong>{item.label}</strong>
                                  <p>{item.detail}</p>
                                </div>
                                <span class={styles.readinessOwner}>
                                  {item.responsible === "joint"
                                    ? "Owner and developer"
                                    : item.responsible === "owner"
                                      ? "Shop owner"
                                      : "Developer"}
                                </span>
                                <b>{item.configured ? "Configured" : item.blocking ? "Required" : "Optional"}</b>
                              </article>
                            )}
                          </For>
                        </div>
                      </section>
                    )}
                  </For>
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
                      <strong>Full product workspace</strong>
                      <span>Edit identity, URL, pricing, stock, barcode, card data, media, and every variant.</span>
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
                          <span>URL slug</span>
                          <input placeholder="Created from the name if empty" value={draft().slug} onInput={event => patchDraft("slug", event.currentTarget.value)} />
                        </label>
                        <label>
                          <span>Brand or manufacturer</span>
                          <input placeholder="The Pokémon Company" value={draft().brand} onInput={event => patchDraft("brand", event.currentTarget.value)} />
                        </label>
                        <label>
                          <span>Game</span>
                          <select value={draft().game} onChange={event => patchDraft("game", event.currentTarget.value as ProductDraft["game"])}>
                            <option value="pokemon">Pokémon</option>
                            <option value="yugioh">Yu-Gi-Oh!</option>
                            <option value="magic">Magic</option>
                            <option value="lorcana">Disney Lorcana</option>
                            <option value="riftbound">Riftbound</option>
                            <option value="digimon">Digimon</option>
                            <option value="cyberpunk">Cyberpunk</option>
                            <option value="other">Other</option>
                          </select>
                        </label>
                        <label>
                          <span>Product type</span>
                          <select value={draft().productType} onChange={event => {
                            const nextType = event.currentTarget.value as ProductDraft["productType"];
                            setDraft(current => ({
                              ...current,
                              productType: nextType,
                              variantName:
                                nextType === "sealed" && current.variantName === "Default"
                                  ? "Booster pack"
                                  : current.variantName,
                            }));
                          }}>
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
                          <span>Set code</span>
                          <input placeholder="MEW, BLCR, MH3" value={draft().setCode} onInput={event => patchDraft("setCode", event.currentTarget.value.toUpperCase())} />
                        </label>
                        <label>
                          <span>SKU</span>
                          <input placeholder="Created automatically if empty" value={draft().sku} onInput={event => patchDraft("sku", event.currentTarget.value)} />
                        </label>
                        <label>
                          <span>Format or variant name</span>
                          <input required placeholder={draft().productType === "sealed" ? "Booster pack" : "Default"} value={draft().variantName} onInput={event => patchDraft("variantName", event.currentTarget.value)} />
                        </label>
                        <label>
                          <span>Barcode</span>
                          <input placeholder="EAN, UPC, or internal barcode" value={draft().barcode} onInput={event => patchDraft("barcode", event.currentTarget.value)} />
                        </label>
                        <label>
                          <span>Price in EUR</span>
                          <input required type="number" min="0" step="0.01" value={draft().price} onInput={event => patchDraft("price", event.currentTarget.value)} />
                        </label>
                        <label>
                          <span>Original price in EUR</span>
                          <input type="number" min="0" step="0.01" placeholder="Optional sale comparison" value={draft().compareAtPrice} onInput={event => patchDraft("compareAtPrice", event.currentTarget.value)} />
                        </label>
                        <label>
                          <span>Stock</span>
                          <input required type="number" min="0" step="1" value={draft().stock} onInput={event => patchDraft("stock", event.currentTarget.value)} />
                        </label>
                        <label class={styles.editorToggle}>
                          <input type="checkbox" checked={draft().trackInventory} onChange={event => patchDraft("trackInventory", event.currentTarget.checked)} />
                          <span>Track and reserve inventory</span>
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
                          <span>Ships from</span>
                          <input placeholder="NL" value={draft().shipsFrom} onInput={event => patchDraft("shipsFrom", event.currentTarget.value)} />
                        </label>
                        <label>
                          <span>Initial status</span>
                          <select value={draft().status} onChange={event => patchDraft("status", event.currentTarget.value as ProductDraft["status"])}>
                            <option value="draft">Save as draft</option>
                            <option value="active">Publish now</option>
                          </select>
                        </label>
                        <label>
                          <span>Release date</span>
                          <input type="date" value={draft().releaseDate} onInput={event => patchDraft("releaseDate", event.currentTarget.value)} />
                          <small>Future dates appear as upcoming releases.</small>
                        </label>
                        <label class={styles.editorToggle}>
                          <input type="checkbox" checked={draft().preorder} onChange={event => patchDraft("preorder", event.currentTarget.checked)} />
                          <span>Accept as pre-order</span>
                        </label>
                        <label class={styles.spanTwo}>
                          <span>Description</span>
                          <textarea rows="4" value={draft().description} onInput={event => patchDraft("description", event.currentTarget.value)} />
                        </label>
                        <Show when={draft().productType === "sealed"}>
                          <label class={styles.spanTwo}>
                            <span>Set trailer URL</span>
                            <input
                              type="url"
                              placeholder="https://www.youtube.com/watch?v=..."
                              value={draft().trailerUrl}
                              onInput={event => patchDraft("trailerUrl", event.currentTarget.value)}
                            />
                            <small>Optional YouTube trailer, shown only on the sealed product page.</small>
                          </label>
                        </Show>
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

                  <section class={styles.catalogToolbar} aria-label="Catalogue filters">
                    <label class={styles.catalogSearch}>
                      <span>Search catalogue</span>
                      <input
                        type="search"
                        placeholder="Name, SKU, barcode, set, or slug"
                        value={catalogSearch()}
                        onInput={event => {
                          setCatalogSearch(event.currentTarget.value);
                          setCatalogPage(1);
                          clearSelection();
                        }}
                      />
                    </label>
                    <label>
                      <span>Game</span>
                      <select value={catalogGame()} onChange={event => {
                        setCatalogGame(event.currentTarget.value);
                        setCatalogPage(1);
                        clearSelection();
                      }}>
                        <option value="all">All games</option>
                        <option value="pokemon">Pokémon</option>
                        <option value="yugioh">Yu-Gi-Oh!</option>
                        <option value="magic">Magic</option>
                        <option value="lorcana">Disney Lorcana</option>
                        <option value="riftbound">Riftbound</option>
                        <option value="digimon">Digimon</option>
                        <option value="cyberpunk">Cyberpunk</option>
                        <option value="other">Other</option>
                      </select>
                    </label>
                    <label>
                      <span>Visibility</span>
                      <select value={catalogStatus()} onChange={event => {
                        setCatalogStatus(event.currentTarget.value);
                        setCatalogPage(1);
                        clearSelection();
                      }}>
                        <option value="all">Every status</option>
                        <option value="active">Live</option>
                        <option value="draft">Draft</option>
                        <option value="archived">Archived</option>
                      </select>
                    </label>
                    <label>
                      <span>Rows</span>
                      <select value={catalogPageSize()} onChange={event => {
                        setCatalogPageSize(Number(event.currentTarget.value));
                        setCatalogPage(1);
                        clearSelection();
                      }}>
                        <For each={CATALOG_PAGE_SIZES}>
                          {size => <option value={size}>{size} per page</option>}
                        </For>
                      </select>
                    </label>
                    <span class={styles.catalogResultCount}>
                      {catalogRangeStart()} to {catalogRangeEnd()} of {filteredProducts().length} products
                    </span>
                    <Show when={selectableProducts().length}>
                      <button
                        type="button"
                        class={styles.selectAllBtn}
                        onClick={toggleSelectAll}
                      >
                        {allSelected() ? "Clear page selection" : "Select this page"}
                      </button>
                    </Show>
                  </section>

                  <Show when={selectedVariantIds().size}>
                    <div class={styles.bulkBar}>
                      <span class={styles.bulkCount}>
                        <strong>{bulkTargets().length}</strong> selected
                      </span>
                      <div class={styles.bulkActions}>
                        <label class={styles.bulkField}>
                          <span>Visibility</span>
                          <select
                            disabled={bulkBusy()}
                            value={bulkVisibility()}
                            onChange={event => setBulkVisibility(event.currentTarget.value)}
                          >
                            <option value="">Choose status</option>
                            <option value="active">Live</option>
                            <option value="draft">Draft</option>
                            <option value="archived">Archived</option>
                          </select>
                          <button
                            type="button"
                            disabled={bulkBusy() || bulkVisibility() === ""}
                            onClick={applyBulkStatus}
                          >
                            Apply
                          </button>
                        </label>
                        <label class={styles.bulkField}>
                          <span>Quantity</span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            placeholder="Qty"
                            disabled={bulkBusy()}
                            value={bulkStock()}
                            onInput={event => setBulkStock(event.currentTarget.value)}
                          />
                          <button
                            type="button"
                            disabled={bulkBusy() || bulkStock() === ""}
                            onClick={applyBulkStock}
                          >
                            Set
                          </button>
                        </label>
                        <label class={styles.bulkField}>
                          <span>Price</span>
                          <input
                            type="text"
                            inputmode="decimal"
                            placeholder="€ 0.00"
                            disabled={bulkBusy()}
                            value={bulkPrice()}
                            onInput={event => setBulkPrice(event.currentTarget.value)}
                          />
                          <button
                            type="button"
                            disabled={bulkBusy() || bulkPrice().trim() === ""}
                            onClick={applyBulkPrice}
                          >
                            Set
                          </button>
                        </label>
                      </div>
                      <button
                        type="button"
                        class={styles.bulkClear}
                        disabled={bulkBusy()}
                        onClick={clearSelection}
                      >
                        {bulkBusy() ? "Applying…" : "Clear"}
                      </button>
                      <button
                        type="button"
                        class={styles.bulkDelete}
                        disabled={bulkBusy()}
                        onClick={deleteSelectedProducts}
                      >
                        Delete selected
                      </button>
                    </div>
                  </Show>
                  <Show when={bulkMessage()}>
                    <p class={styles.bulkMessage} role="status">{bulkMessage()}</p>
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
                          {row => (
                            <ProductRow
                              product={row.original}
                              onSaved={refetch}
                              selectable={isManaged(row.original)}
                              isSelected={() =>
                                selectedVariantIds().has(row.original.variantId ?? "")
                              }
                              onToggle={() =>
                                row.original.variantId &&
                                toggleSelect(row.original.variantId)
                              }
                            />
                          )}
                        </For>
                      </tbody>
                    </table>
                    <Show when={!filteredProducts().length}>
                      <div class={styles.catalogEmpty}>
                        <strong>{data().products.length ? "No products match these filters" : "Your managed catalogue is empty"}</strong>
                        <p>{data().products.length ? "Try a different name, SKU, game, or visibility." : "Add one product here, or use Bulk import for a full inventory file."}</p>
                        <Show when={data().products.length} fallback={
                          <button type="button" onClick={() => setComposerOpen(true)}>+ Add the first product</button>
                        }>
                          <button type="button" onClick={() => {
                            setCatalogSearch("");
                            setCatalogGame("all");
                            setCatalogStatus("all");
                            setCatalogPage(1);
                            clearSelection();
                          }}>Clear catalogue filters</button>
                        </Show>
                      </div>
                    </Show>
                  </div>
                  <Show when={filteredProducts().length > 0}>
                    <nav class={styles.catalogPagination} aria-label="Catalogue pages">
                      <button
                        type="button"
                        disabled={currentCatalogPage() <= 1}
                        onClick={() => {
                          setCatalogPage(page => Math.max(1, page - 1));
                          clearSelection();
                        }}
                      >
                        Previous
                      </button>
                      <span>
                        Page <strong>{currentCatalogPage()}</strong> of {catalogPageCount()}
                      </span>
                      <button
                        type="button"
                        disabled={currentCatalogPage() >= catalogPageCount()}
                        onClick={() => {
                          setCatalogPage(page => Math.min(catalogPageCount(), page + 1));
                          clearSelection();
                        }}
                      >
                        Next
                      </button>
                    </nav>
                  </Show>
                </Show>

                <Show when={section() === "orders"}>
                  <section class={styles.sectionIntro}>
                    <div>
                      <h2>Order fulfilment</h2>
                      <p>Review items and addresses, dispatch parcels, print invoices, record returns, and issue Mollie refunds.</p>
                    </div>
                    <A href="/api/admin/export?type=orders" target="_blank">Export orders CSV</A>
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

                <Show when={section() === "contacts"}>
                  <ContactInbox messages={data().contacts} onUpdated={refetch} />
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

                <Show when={section() === "store"}>
                  <StoreSetupManager profile={data().content.business} onUpdated={refetch} />
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
                        Check up to 1,000 products before importing. New rows stay private until you review and publish them.
                      </p>
                    </div>
                    <div class={styles.importActions}>
                      <button type="button" onClick={downloadTemplate}>Download CSV template</button>
                      <label class={styles.primaryAction}>
                        Choose CSV file
                        <input
                          type="file"
                          accept=".csv,text/csv"
                          disabled={importing()}
                          onChange={event => {
                            const file = event.currentTarget.files?.[0];
                            event.currentTarget.value = "";
                            void prepareCsv(file);
                          }}
                        />
                      </label>
                    </div>
                  </section>
                  <Show when={importMessage()}><p class={styles.importMessage} role="status">{importMessage()}</p></Show>
                  <Show when={csvPreview()}>
                    {preview => (
                      <section class={styles.csvReview} aria-label="CSV import review">
                        <div class={styles.csvReviewSummary}>
                          <div>
                            <strong>{preview().fileName}</strong>
                            <p>
                              {preview().rows.length} product{preview().rows.length === 1 ? "" : "s"} found. New SKUs become private drafts; matching SKUs update the existing product.
                            </p>
                          </div>
                          <span classList={{ [styles.csvReady]: preview().issues.length === 0, [styles.csvBlocked]: preview().issues.length > 0 }}>
                            {preview().issues.length === 0 ? "Ready to import" : `${preview().issues.length} issue${preview().issues.length === 1 ? "" : "s"}`}
                          </span>
                        </div>

                        <Show when={preview().issues.length}>
                          <div class={styles.csvIssues} role="alert">
                            <strong>Fix these rows before importing</strong>
                            <ul>
                              <For each={preview().issues.slice(0, 8)}>{issue => <li>{issue}</li>}</For>
                            </ul>
                            <Show when={preview().issues.length > 8}>
                              <p>{preview().issues.length - 8} more issues are not shown.</p>
                            </Show>
                          </div>
                        </Show>

                        <div class={styles.csvReviewActions}>
                          <button type="button" onClick={() => setCsvPreview(null)} disabled={importing()}>
                            Discard file
                          </button>
                          <button
                            type="button"
                            class={styles.primaryAction}
                            onClick={() => void importCsv()}
                            disabled={importing() || preview().issues.length > 0 || preview().rows.length === 0}
                          >
                            {importing() ? "Importing drafts" : `Import ${preview().rows.length} drafts`}
                          </button>
                        </div>
                      </section>
                    )}
                  </Show>

                  <section class={styles.yugiohLibrary}>
                    <div class={styles.yugiohLibraryHead}>
                      <div>
                        <h2>Yu-Gi-Oh card library</h2>
                        <p>
                          Search the locally stored YGOPRODeck snapshot. Adding a card creates one private draft with every known set and rarity at zero stock.
                        </p>
                      </div>
                      <span>Local data only</span>
                    </div>

                    <form class={styles.yugiohSearch} onSubmit={searchYugiohCards}>
                      <label class={styles.yugiohSearchMode}>
                        <span>Search by</span>
                        <select
                          value={yugiohSearchBy()}
                          onChange={event => {
                            setYugiohSearchBy(event.currentTarget.value as "card" | "set");
                            setYugiohCards([]);
                            setYugiohMatchedSets([]);
                            setYugiohSelected(new Set<number>());
                            setYugiohMessage("");
                          }}
                        >
                          <option value="card">Card name</option>
                          <option value="set">Set name</option>
                        </select>
                      </label>
                      <label>
                        <span>{yugiohSearchBy() === "set" ? "Set name" : "Card name"}</span>
                        <input
                          type="search"
                          value={yugiohQuery()}
                          onInput={event => setYugiohQuery(event.currentTarget.value)}
                          placeholder={yugiohSearchBy() === "set"
                            ? "Chaos Origins, Battle of Chaos"
                            : "Dark Magician, Blue-Eyes, Kuriboh"}
                        />
                      </label>
                      <button type="submit" disabled={yugiohSearching()}>
                        {yugiohSearching()
                          ? "Searching"
                          : yugiohSearchBy() === "set" ? "Find set" : "Find cards"}
                      </button>
                    </form>

                    <Show when={yugiohMatchedSets().length}>
                      <p class={styles.yugiohSetMatch}>
                        Set{yugiohMatchedSets().length === 1 ? "" : "s"}: {yugiohMatchedSets().join(", ")}
                      </p>
                    </Show>

                    <Show when={yugiohMessage()}>
                      <p class={styles.importMessage} role="status">{yugiohMessage()}</p>
                    </Show>

                    <Show when={selectableYugiohCards().length}>
                      <div class={styles.yugiohBulkBar}>
                        <label>
                          <input
                            type="checkbox"
                            checked={
                              yugiohSelected().size > 0 &&
                              yugiohSelected().size === selectableYugiohCards().length
                            }
                            onChange={toggleAllYugiohSelected}
                          />
                          <span>Select all {selectableYugiohCards().length}</span>
                        </label>
                        <button
                          type="button"
                          disabled={
                            yugiohBulkRunning() ||
                            (!yugiohSelected().size && yugiohSearchBy() !== "set")
                          }
                          onClick={() => {
                            if (yugiohSelected().size) void addSelectedYugiohCards();
                            else void addAllYugiohResults();
                          }}
                        >
                          {yugiohBulkRunning()
                            ? "Adding cards..."
                            : yugiohSelected().size
                              ? `Import ${yugiohSelected().size} selected as drafts`
                              : yugiohSearchBy() === "set"
                                ? `Import all ${selectableYugiohCards().length} cards as drafts`
                                : "Select cards to import"}
                        </button>
                      </div>
                    </Show>

                    <Show when={yugiohCards().length}>
                      <div class={styles.yugiohResults}>
                        <For each={yugiohCards()}>
                          {card => (
                            <article classList={{ [styles.yugiohRowPicked]: yugiohSelected().has(card.id) }}>
                              <Show
                                when={!card.importedStatus}
                                fallback={<div class={styles.yugiohCardId}>{card.id}</div>}
                              >
                                <label class={styles.yugiohPick}>
                                  <input
                                    type="checkbox"
                                    checked={yugiohSelected().has(card.id)}
                                    disabled={yugiohBulkRunning()}
                                    onChange={() => toggleYugiohSelected(card.id)}
                                    aria-label={`Select ${card.name}`}
                                  />
                                </label>
                              </Show>
                              <div class={styles.yugiohCardInfo}>
                                <strong>{card.name}</strong>
                                <span>
                                  {[card.cardType, card.attribute, card.archetype]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </span>
                                <small>
                                  {card.printings.length} printing{card.printings.length === 1 ? "" : "s"}
                                  <Show when={card.printings.length}>
                                    {` · ${[...new Set(card.printings.map(printing => printing.rarity))].slice(0, 4).join(", ")}`}
                                  </Show>
                                </small>
                              </div>
                              <div class={styles.yugiohCardPrice}>
                                <span>Reference</span>
                                <strong>
                                  {card.cardmarketPriceCents === null
                                    ? "No price"
                                    : formatMoney(card.cardmarketPriceCents)}
                                </strong>
                              </div>
                              <button
                                type="button"
                                disabled={Boolean(card.importedStatus) || yugiohImporting().has(card.id)}
                                onClick={() => addYugiohCard(card)}
                              >
                                {card.importedStatus
                                  ? card.importedStatus === "active" ? "Live" : "Already added"
                                  : yugiohImporting().has(card.id) ? "Adding card" : "Add as draft"}
                              </button>
                            </article>
                          )}
                        </For>
                      </div>
                    </Show>
                  </section>

                  <section class={styles.importGuide}>
                    <div>
                      <h3>How the product file works</h3>
                      <p>Download the latest template, keep its header row, and fill one product per line. SKU identifies an existing product. Leave image blank to keep its current photo.</p>
                    </div>
                    <dl>
                      <div><dt>game</dt><dd>pokemon, yugioh, magic, lorcana, riftbound, digimon, cyberpunk, or other</dd></div>
                      <div><dt>productType</dt><dd>single, sealed, graded, or accessory</dd></div>
                      <div><dt>price</dt><dd>Use euros, for example 12.95</dd></div>
                      <div><dt>visibility</dt><dd>CSV products always begin as private drafts</dd></div>
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
