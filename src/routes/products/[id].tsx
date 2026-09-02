import { Link, Meta, Title } from "@solidjs/meta";
import { A, useParams } from "@solidjs/router";
import {
  createResource,
  createSignal,
  For,
  onMount,
  Show,
} from "solid-js";
import ProductCard, {
  BoxArt,
  type ProductVariantOption,
  type SectionProduct,
} from "~/components/product/ProductCard";
import { fetchDatabaseCatalogState } from "~/lib/catalog";
import { findProduct, relatedProducts, type ShopProduct } from "~/lib/categories";
import { formatPrice, useCart } from "~/lib/cart";
import styles from "./[id].module.scss";

function isSealedProduct(product: ShopProduct) {
  return product.productType === "sealed" || Boolean(product.priceRangeCents);
}

function youtubeEmbedUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const videoId = url.hostname === "youtu.be"
      ? url.pathname.split("/").filter(Boolean)[0]
      : url.searchParams.get("v") ??
        (url.pathname.startsWith("/embed/") ? url.pathname.split("/")[2] : null);
    return videoId && /^[A-Za-z0-9_-]{6,20}$/.test(videoId)
      ? `https://www.youtube-nocookie.com/embed/${videoId}`
      : undefined;
  } catch {
    return undefined;
  }
}

function describe(product: ShopProduct) {
  if (product.description) return product.description;
  if (isSealedProduct(product)) {
    return `A factory-sealed ${product.gameName} release, stored carefully and shipped tracked from the Netherlands.`;
  }

  return `An authentic ${product.gameName} single${product.set ? ` from ${product.set}` : ""}. The card shown is the exact card you will receive.`;
}

function conditionFor(product: ShopProduct) {
  if (isSealedProduct(product)) return "Sealed";
  return product.condition ??
    (product.productType === "graded" ? "Professionally graded" : "Near Mint");
}

const SERVICE_NOTES = [
  {
    title: "Condition checked",
    text: "Inspected in clear light before listing.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <path d="M12 3 5 6v5c0 4.6 2.8 8.1 7 10 4.2-1.9 7-5.4 7-10V6l-7-3Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
  },
  {
    title: "Protected packing",
    text: "Sleeved, rigid, and water resistant.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <path d="m4 7 8-4 8 4-8 4-8-4Z" />
        <path d="m4 7 8 4 8-4v10l-8 4-8-4V7Z" />
        <path d="M12 11v10" />
      </svg>
    ),
  },
  {
    title: "Tracked delivery",
    text: "Sent from the Netherlands across the EU.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" />
        <circle cx="7" cy="18" r="1.5" />
        <circle cx="18" cy="18" r="1.5" />
      </svg>
    ),
  },
  {
    title: "14-day returns",
    text: "Simple returns under EU consumer rules.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <path d="M4 8V4m0 0h4M4 4l4 4" />
        <path d="M5.5 15a8 8 0 1 0 .3-6" />
      </svg>
    ),
  },
];

export default function ProductDetail() {
  const params = useParams();
  const cart = useCart();
  const [clientReady, setClientReady] = createSignal(false);
  const [databaseCatalog] = createResource(
    () => (clientReady() ? params.id : undefined),
    id => fetchDatabaseCatalogState(id),
  );
  const product = () => {
    const id = params.id ?? "";
    const catalog = databaseCatalog();
    if (catalog?.managedSlugs.includes(id)) return catalog.products[0];
    return findProduct(id);
  };

  const [quantity, setQuantity] = createSignal(1);
  const [selectedVariantId, setSelectedVariantId] = createSignal("");
  const [added, setAdded] = createSignal(false);
  const [saved, setSaved] = createSignal(false);
  const [justAdded, setJustAdded] = createSignal<Set<string>>(new Set());

  onMount(() => setClientReady(true));

  const selectedVariant = () => {
    const variants = product()?.variants ?? [];
    return variants.find(variant => variant.id === selectedVariantId());
  };

  const mainVariant = () => {
    const current = product();
    const variants = current?.variants ?? [];
    return (
      variants.find(variant => variant.isDefault) ??
      variants.find(variant => variant.id === current?.variantId) ??
      variants[0]
    );
  };

  const displayVariant = () => {
    return selectedVariant() ?? mainVariant();
  };

  const activeProduct = () => {
    const current = product();
    const variant = displayVariant();
    if (!current || !variant) return current;
    return {
      ...current,
      variantId: variant.id,
      sku: variant.sku,
      condition: variant.condition,
      language: variant.language,
      finish: variant.finish,
      image: variant.image ?? current.image,
      priceCents: variant.priceCents,
      compareAtPriceCents: variant.compareAtPriceCents,
      priceRangeCents: undefined,
      stock: variant.stock,
    };
  };

  const productJsonLd = () => {
    const current = product();
    if (!current) return "";
    const variants = current.variants?.length
      ? current.variants
      : current.priceCents !== undefined
        ? [{
            id: current.variantId ?? current.id,
            sku: current.sku ?? current.id,
            priceCents: current.priceCents,
            stock: current.stock ?? 1,
          }]
        : [];
    const data = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: current.name,
      description: describe(current),
      image: current.image ? [current.image] : undefined,
      sku: current.sku,
      category: current.gameName,
      brand: { "@type": "Brand", name: "TCGHaven" },
      offers: variants.map(variant => ({
        "@type": "Offer",
        sku: variant.sku,
        priceCurrency: "EUR",
        price: (variant.priceCents / 100).toFixed(2),
        availability:
          variant.stock > 0
            ? "https://schema.org/InStock"
            : "https://schema.org/OutOfStock",
        url: `https://my-little-tcg-haven.vercel.app/products/${encodeURIComponent(current.id)}`,
      })),
    };
    return JSON.stringify(data).replaceAll("<", "\\u003c");
  };

  const addMain = (item: ShopProduct) => {
    if (item.priceCents === undefined) return;

    const selected = selectedVariant();
    const variantLabel = isSealedProduct(item)
      ? selected?.name ?? ""
      : [item.condition, item.language, item.finish].filter(Boolean).join(", ");
    cart.addItem(
      {
        id: item.id,
        variantId: item.variantId,
        name: `${item.set ? `${item.name} · ${item.set}` : item.name}${variantLabel ? ` (${variantLabel})` : ""}`,
        image: item.image ?? "/images/logo-mark.png",
        priceCents: item.priceCents,
      },
      quantity(),
    );

    setAdded(true);
    setTimeout(() => setAdded(false), 1600);
  };

  const addRelated = (
    item: SectionProduct,
    variant?: ProductVariantOption,
  ) => {
    const priceCents = variant?.priceCents ?? item.priceCents;
    if (priceCents === undefined) return;

    cart.addItem({
      id: item.id,
      variantId: variant?.id,
      name: `${item.set ? `${item.name} · ${item.set}` : item.name}${variant ? ` (${variant.name})` : ""}`,
      image: variant?.image ?? item.image ?? "/images/logo-mark.png",
      priceCents,
    });

    setJustAdded(previous => new Set(previous).add(item.id));
    setTimeout(() => {
      setJustAdded(previous => {
        const next = new Set(previous);
        next.delete(item.id);
        return next;
      });
    }, 1400);
  };

  return (
    <Show
      when={product()}
      fallback={
        <main class={styles.page}>
          <div class={styles.wide}>
            <div class={styles.missing}>
              <p class={styles.missingTitle}>Product not found</p>
              <p>That card may have sold or moved to another collection.</p>
              <A href="/products" class={styles.primaryButton}>Return to shop</A>
            </div>
          </div>
        </main>
      }
    >
      {item => (
        <main class={styles.page}>
          <Title>{item().name} | TCGHaven</Title>
          <Meta name="description" content={describe(item())} />
          <Link rel="canonical" href={`https://my-little-tcg-haven.vercel.app/products/${encodeURIComponent(item().id)}`} />
          <script type="application/ld+json" textContent={productJsonLd()} />

          <div class={styles.wide}>
            <nav class={styles.breadcrumb} aria-label="Breadcrumb">
              <A href="/products">Shop</A>
              <span aria-hidden="true">/</span>
              <A href={`/categories/${item().game}`}>{item().gameName}</A>
              <span aria-hidden="true">/</span>
              <span>{item().name}</span>
            </nav>

            <section
              class={styles.hero}
              classList={{
                [styles.sealedHero]: isSealedProduct(item()),
                [styles.variableHero]: (item().variants?.length ?? 0) > 1,
              }}
            >
              <div class={styles.mediaPanel}>
                <div class={styles.mediaHeader}>
                  <A href={`/categories/${item().game}/products`}>{item().gameName}</A>
                  <span>{item().setCode ?? item().sku ?? "TCGH"}</span>
                </div>

                <div class={styles.productMedia}>
                  <Show
                    when={activeProduct()?.image}
                    fallback={<BoxArt theme={item().theme} label={item().set ?? item().name} />}
                  >
                    <img
                      src={activeProduct()!.image}
                      alt={item().set ? `${item().name}, ${item().set}` : item().name}
                      draggable={false}
                    />
                  </Show>
                </div>

                <div class={styles.mediaFooter}>
                  <span>{item().image ? "Product image" : "Product preview"}</span>
                  <strong>{displayVariant()?.name ?? item().badge ?? conditionFor(item())}</strong>
                </div>
              </div>

              <aside class={styles.purchase}>
                <header class={styles.purchaseHeader}>
                  <div class={styles.productKicker}>
                    <span>{isSealedProduct(item()) ? "Sealed product" : item().productType ?? "Single card"}</span>
                    <Show when={item().set}>
                      <A href={`/categories/${item().game}/sets`}>{item().set}</A>
                    </Show>
                  </div>
                  <div class={styles.titleRow}>
                    <h1>{item().name}</h1>
                    <button
                      type="button"
                      class={styles.saveButton}
                      classList={{ [styles.saveButtonActive]: saved() }}
                      aria-label={saved() ? `Remove ${item().name} from wishlist` : `Save ${item().name} to wishlist`}
                      aria-pressed={saved()}
                      onClick={() => setSaved(value => !value)}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
                      </svg>
                    </button>
                  </div>
                </header>

                <div class={styles.priceStockRow}>
                  <div class={styles.priceBlock}>
                    <Show when={activeProduct()?.compareAtPriceCents && activeProduct()!.compareAtPriceCents! > (activeProduct()?.priceCents ?? 0)}>
                      <del>{formatPrice(activeProduct()!.compareAtPriceCents!)}</del>
                    </Show>
                    <p class={styles.price}>
                      <Show
                        when={!displayVariant() && item().priceRangeCents}
                        fallback={formatPrice(activeProduct()?.priceCents ?? 0)}
                      >
                        {formatPrice(item().priceRangeCents![0])} to {formatPrice(item().priceRangeCents![1])}
                      </Show>
                    </p>
                  </div>

                  <div class={styles.stockLine}>
                    <span />
                    {activeProduct()?.stock === 0
                      ? "Out of stock"
                      : "In stock"}
                  </div>
                </div>

                <p class={styles.description}>{describe(item())}</p>

                <Show when={(item().variants?.length ?? 0) > 1}>
                  <fieldset class={styles.variantPicker}>
                    <legend>{isSealedProduct(item()) ? "Choose a format" : "Choose your card"}</legend>
                    <div>
                      <For each={item().variants}>
                        {variant => (
                          <button
                            type="button"
                            classList={{
                              [styles.variantActive]:
                                selectedVariantId() === variant.id,
                            }}
                            aria-pressed={selectedVariantId() === variant.id}
                            disabled={variant.stock <= 0}
                            onClick={() => {
                              setSelectedVariantId(variant.id);
                              setQuantity(1);
                            }}
                          >
                            <span>
                              <strong>{variant.name}</strong>
                              <small>
                                {(isSealedProduct(item())
                                  ? [variant.language, variant.finish]
                                  : [variant.condition, variant.language, variant.finish])
                                  .filter(Boolean)
                                  .join(" · ") || variant.sku}
                              </small>
                            </span>
                            <span>
                              <strong>{formatPrice(variant.priceCents)}</strong>
                              <small>{variant.stock > 0 ? `${variant.stock} available` : "Sold out"}</small>
                            </span>
                          </button>
                        )}
                      </For>
                    </div>
                  </fieldset>
                </Show>

                <Show
                  when={activeProduct()?.priceCents !== undefined}
                  fallback={
                    <div class={styles.unavailablePanel} role="status">
                      <strong>Formats are being prepared</strong>
                      <p>This listing stays on this page until the owner adds a purchasable pack, box, or product format.</p>
                    </div>
                  }
                >
                  <div class={styles.buyArea}>
                    <div class={styles.quantity} aria-label="Quantity">
                      <button
                        type="button"
                        aria-label="Decrease quantity"
                        disabled={quantity() === 1}
                        onClick={() => setQuantity(value => Math.max(1, value - 1))}
                      >
                        −
                      </button>
                      <span aria-live="polite">{quantity()}</span>
                      <button
                        type="button"
                        aria-label="Increase quantity"
                        onClick={() => setQuantity(value => Math.min(99, activeProduct()?.stock ?? 99, value + 1))}
                      >
                        +
                      </button>
                    </div>

                    <button
                      type="button"
                      class={styles.primaryButton}
                      classList={{ [styles.primaryButtonDone]: added() }}
                      disabled={
                        activeProduct()?.stock === 0 ||
                        ((item().variants?.length ?? 0) > 1 && !selectedVariant())
                      }
                      onClick={() => {
                        const current = activeProduct();
                        if (current) addMain(current);
                      }}
                    >
                      <Show
                        when={!added()}
                        fallback={
                          <>
                            Added
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" aria-hidden="true">
                              <path d="m5 12 4 4L19 6" />
                            </svg>
                          </>
                        }
                      >
                        {(item().variants?.length ?? 0) > 1 && !selectedVariant()
                          ? "Choose a variant"
                          : "Add to cart"}
                      </Show>
                    </button>
                  </div>
                  <A href="/cart" class={styles.cartLink}>View your cart</A>
                </Show>

                <div class={styles.purchaseFoot}>
                  <div>
                    <span>Condition</span>
                    <strong>{activeProduct() ? conditionFor(activeProduct()!) : conditionFor(item())}</strong>
                  </div>
                  <div>
                    <span>Language</span>
                    <strong>{activeProduct()?.language ?? item().language ?? "English"}</strong>
                  </div>
                  <div>
                    <span>Dispatch</span>
                    <strong>Within 1 business day</strong>
                  </div>
                </div>
              </aside>
            </section>

            <section class={styles.detailsSection} id="product-story">
              <div class={styles.detailsIntro}>
                <span class={styles.sectionLabel}>{isSealedProduct(item()) ? "The sealed release" : "The card"}</span>
                <h2>{isSealedProduct(item()) ? "Know exactly what you are opening." : "Every detail, shown clearly."}</h2>
                <p>{describe(item())}</p>
                <p>
                  {isSealedProduct(item())
                    ? "Stored unopened in a smoke-free, climate-stable room until dispatch."
                    : "Stored in a penny sleeve and top loader from the moment it is listed, then packed in a rigid mailer for dispatch."}
                </p>
              </div>

              <dl class={styles.specifications}>
                <div><dt>Game</dt><dd>{item().gameName}</dd></div>
                <div><dt>Set</dt><dd>{item().set ?? "Various"}</dd></div>
                <div><dt>Product type</dt><dd>{isSealedProduct(item()) ? "Sealed product" : item().productType ?? "Single card"}</dd></div>
                <div><dt>Condition</dt><dd>{conditionFor(item())}</dd></div>
                <div><dt>Language</dt><dd>{item().language ?? "English"}</dd></div>
                <Show when={item().finish}><div><dt>Finish</dt><dd>{item().finish}</dd></div></Show>
                <Show when={item().cardNumber}><div><dt>Card number</dt><dd>{item().cardNumber}</dd></div></Show>
                <Show when={item().rarity}><div><dt>Rarity</dt><dd>{item().rarity}</dd></div></Show>
                <Show when={item().setCode}><div><dt>Set code</dt><dd>{item().setCode}</dd></div></Show>
                <Show when={item().illustrator}><div><dt>Illustrator</dt><dd>{item().illustrator}</dd></div></Show>
                <Show when={item().gradingCompany}><div><dt>Grading company</dt><dd>{item().gradingCompany}</dd></div></Show>
                <Show when={item().grade}><div><dt>Grade</dt><dd>{item().grade}</dd></div></Show>
                <Show when={item().certificationNumber}><div><dt>Certification</dt><dd>{item().certificationNumber}</dd></div></Show>
                <div><dt>Ships from</dt><dd>{item().shipsFrom ?? "Netherlands"}</dd></div>
              </dl>
            </section>

            <Show when={isSealedProduct(item()) && youtubeEmbedUrl(item().trailerUrl)}>
              {trailerUrl => (
                <section class={styles.videoSection}>
                  <div class={styles.videoCopy}>
                    <span class={styles.sectionLabel}>Set trailer</span>
                    <h2>See what this release brings to the table.</h2>
                    <p>The official set trailer is provided for collectors who want a closer look before choosing a pack or display.</p>
                  </div>

                  <div class={styles.videoFrame}>
                    <iframe
                      src={trailerUrl()}
                      title={`${item().name} set trailer`}
                      loading="lazy"
                      allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowfullscreen
                    />
                  </div>
                </section>
              )}
            </Show>

            <section class={styles.serviceBand} aria-label="Service information">
              <For each={SERVICE_NOTES}>
                {note => (
                  <div class={styles.serviceItem}>
                    <span class={styles.serviceIcon}>{note.icon}</span>
                    <div>
                      <h3>{note.title}</h3>
                      <p>{note.text}</p>
                    </div>
                  </div>
                )}
              </For>
            </section>

            <Show when={relatedProducts(item()).length}>
              <section class={styles.related}>
                <div class={styles.relatedHead}>
                  <div>
                    <h2>More from {item().gameName}</h2>
                    <p>Continue browsing the same collection.</p>
                  </div>
                  <A href={`/categories/${item().game}`}>
                    View all
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </A>
                </div>

                <div class={styles.relatedGrid}>
                  <For each={relatedProducts(item())}>
                    {related => (
                      <ProductCard
                        product={related}
                        isJustAdded={() => justAdded().has(related.id)}
                        onAdd={addRelated}
                        fill
                      />
                    )}
                  </For>
                </div>
              </section>
            </Show>
          </div>
        </main>
      )}
    </Show>
  );
}
