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
  | "imports";

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
  updatedAt: string;
};

type AdminOrder = {
  id: string;
  orderNumber: string;
  email: string;
  status: string;
  currency: string;
  totalCents: number;
  createdAt: string;
};

type AdminCustomer = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: string;
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
  price: "",
  stock: "1",
  status: "draft",
};

const NAV_ITEMS: Array<{ id: AdminSection; label: string; short: string }> = [
  { id: "overview", label: "Overview", short: "Today" },
  { id: "products", label: "Catalogue", short: "Products and stock" },
  { id: "orders", label: "Orders", short: "Fulfilment" },
  { id: "customers", label: "Customers", short: "Accounts" },
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
  const [price, setPrice] = createSignal(
    ((props.product.priceCents ?? 0) / 100).toFixed(2),
  );
  const [stock, setStock] = createSignal(String(props.product.stock ?? 0));
  const [status, setStatus] = createSignal(props.product.status);
  const [saving, setSaving] = createSignal(false);
  const [message, setMessage] = createSignal("");

  const save = async () => {
    if (!props.product.variantId) return;
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/admin/products", {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: props.product.id,
        variantId: props.product.variantId,
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
    setSaving(false);
  };

  return (
    <tr>
      <td>
        <div class={styles.productIdentity}>
          <Show
            when={props.product.imageUrls[0]}
            fallback={<span class={styles.productFallback}>{props.product.name[0]}</span>}
          >
            <img src={props.product.imageUrls[0]} alt="" />
          </Show>
          <div>
            <strong>{props.product.name}</strong>
            <span>{props.product.sku ?? "No SKU"}</span>
          </div>
        </div>
      </td>
      <td><span class={styles.gameTag}>{props.product.game ?? "other"}</span></td>
      <td>
        <input
          class={styles.tableInput}
          type="number"
          min="0"
          step="0.01"
          aria-label={`Price for ${props.product.name}`}
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
          aria-label={`Stock for ${props.product.name}`}
          value={stock()}
          onInput={event => setStock(event.currentTarget.value)}
        />
      </td>
      <td>
        <select
          class={styles.tableSelect}
          aria-label={`Status for ${props.product.name}`}
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
          <A href={`/products/${props.product.slug}`} target="_blank">View</A>
          <button type="button" onClick={save} disabled={saving()}>
            {saving() ? "Saving" : "Save"}
          </button>
          <Show when={message()}>
            <span>{message()}</span>
          </Show>
        </div>
      </td>
    </tr>
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
                </Show>

                <Show when={section() === "products"}>
                  <section class={styles.sectionIntro}>
                    <div>
                      <h2>Catalogue and inventory</h2>
                      <p>Live listings appear in the customer shop. Drafts remain private.</p>
                    </div>
                    <button
                      type="button"
                      class={styles.primaryAction}
                      onClick={() => setComposerOpen(value => !value)}
                    >
                      {composerOpen() ? "Close product form" : "Add product"}
                    </button>
                  </section>

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
                      <p class={styles.empty}>No database products yet. Add the first listing above.</p>
                    </Show>
                  </div>
                </Show>

                <Show when={section() === "orders"}>
                  <section class={styles.sectionIntro}>
                    <div>
                      <h2>Order fulfilment</h2>
                      <p>Review payment state and move each order through dispatch.</p>
                    </div>
                    <Show when={orderMessage()}><p class={styles.inlineMessage}>{orderMessage()}</p></Show>
                  </section>
                  <div class={styles.tableWrap}>
                    <table>
                      <thead><tr><th>Order</th><th>Customer</th><th>Date</th><th>Total</th><th>Status</th></tr></thead>
                      <tbody>
                        <For each={orderTable.getRowModel().rows}>
                          {row => {
                            const order = row.original;
                            return (
                            <tr>
                              <td><strong>{order.orderNumber}</strong></td>
                              <td>{order.email}</td>
                              <td>{formatDate(order.createdAt)}</td>
                              <td>{formatMoney(order.totalCents, order.currency)}</td>
                              <td>
                                <select
                                  class={styles.orderSelect}
                                  value={order.status}
                                  onChange={event => updateOrder(order.id, event.currentTarget.value)}
                                >
                                  <For each={ORDER_STATUSES}>{status => <option value={status}>{status}</option>}</For>
                                </select>
                              </td>
                            </tr>
                            );
                          }}
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
                      <p>Account status only. Passwords and authentication secrets are never exposed here.</p>
                    </div>
                  </section>
                  <div class={styles.tableWrap}>
                    <table>
                      <thead><tr><th>Customer</th><th>Email</th><th>Verification</th><th>Joined</th></tr></thead>
                      <tbody>
                        <For each={customerTable.getRowModel().rows}>
                          {row => {
                            const customer = row.original;
                            return (
                            <tr>
                              <td>
                                <div class={styles.customerIdentity}>
                                  <span>{initials(customer.name)}</span>
                                  <strong>{customer.name}</strong>
                                </div>
                              </td>
                              <td>{customer.email}</td>
                              <td><span class={`${styles.status} ${customer.emailVerified ? styles.verified : styles.unverified}`}>{customer.emailVerified ? "Verified" : "Unverified"}</span></td>
                              <td>{formatDate(customer.createdAt)}</td>
                            </tr>
                            );
                          }}
                        </For>
                      </tbody>
                    </table>
                    <Show when={!data().customers.length}><p class={styles.empty}>No customer accounts yet.</p></Show>
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
