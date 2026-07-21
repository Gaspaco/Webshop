import { Title } from "@solidjs/meta";
import { A, useParams } from "@solidjs/router";
import { createSignal, For, Show } from "solid-js";
import ProductCard, { BoxArt, Stars, type SectionProduct } from "~/components/product/ProductCard";
import { findProduct, relatedProducts, type ShopProduct } from "~/lib/categories";
import { formatPrice, useCart } from "~/lib/cart";
import styles from "./[id].module.scss";

// Replace this id with the shop's own inspection video when it is ready.
const VIDEO_ID = "aqz-KE-bpKQ";

function describe(product: ShopProduct) {
  if (product.priceRangeCents) {
    return `A factory-sealed ${product.gameName} release, stored carefully and shipped tracked from the Netherlands.`;
  }

  return `An authentic ${product.gameName} single${product.set ? ` from ${product.set}` : ""}. The card shown is the exact card you will receive.`;
}

function conditionFor(product: ShopProduct) {
  return product.priceRangeCents ? "Factory sealed" : "Near Mint";
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
  const product = () => findProduct(params.id ?? "");

  const [quantity, setQuantity] = createSignal(1);
  const [added, setAdded] = createSignal(false);
  const [saved, setSaved] = createSignal(false);
  const [justAdded, setJustAdded] = createSignal<Set<string>>(new Set());

  const addMain = (item: ShopProduct) => {
    if (item.priceRangeCents || item.priceCents === undefined) return;

    for (let index = 0; index < quantity(); index += 1) {
      cart.addItem({
        id: item.id,
        name: item.set ? `${item.name} · ${item.set}` : item.name,
        image: item.image ?? "/images/logo-mark.png",
        priceCents: item.priceCents,
      });
    }

    setAdded(true);
    setTimeout(() => setAdded(false), 1600);
  };

  const addRelated = (item: SectionProduct) => {
    if (item.priceRangeCents || item.priceCents === undefined) return;

    cart.addItem({
      id: item.id,
      name: item.set ? `${item.name} · ${item.set}` : item.name,
      image: item.image ?? "/images/logo-mark.png",
      priceCents: item.priceCents,
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

          <div class={styles.wide}>
            <nav class={styles.breadcrumb} aria-label="Breadcrumb">
              <A href="/products">Shop</A>
              <span aria-hidden="true">/</span>
              <A href={`/categories/${item().game}`}>{item().gameName}</A>
              <span aria-hidden="true">/</span>
              <span>{item().name}</span>
            </nav>

            <section class={`${styles.hero} ${styles[item().theme]}`}>
              <div class={styles.heroTopline}>
                <A href={`/categories/${item().game}`} class={styles.gameLink}>
                  {item().gameName}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </A>
                <span>{item().image ? "Exact item photographed" : "Product preview"}</span>
              </div>

              <div class={styles.heroGrid}>
                <div class={styles.stage}>
                  <div class={styles.titleBlock}>
                    <Show when={item().set}>
                      <p class={styles.setName}>{item().set}</p>
                    </Show>
                    <h1>{item().name}</h1>
                  </div>

                  <div class={styles.productMedia}>
                    <span class={styles.mediaIndex} aria-hidden="true">MLTH / 001</span>
                    <Show
                      when={item().image}
                      fallback={<BoxArt theme={item().theme} label={item().set ?? item().name} />}
                    >
                      <img
                        src={item().image}
                        alt={item().set ? `${item().name}, ${item().set}` : item().name}
                        draggable={false}
                      />
                    </Show>
                    <span class={styles.mediaNote}>{item().badge ?? conditionFor(item())}</span>
                  </div>

                  <div class={styles.stageFacts} aria-label="Product highlights">
                    <span>{conditionFor(item())}</span>
                    <span>English</span>
                    <span>Ships from NL</span>
                  </div>
                </div>

                <aside class={styles.purchase}>
                <div class={styles.purchaseTopline}>
                  <div class={styles.ratingRow}>
                    <Stars rating={item().rating ?? 5} />
                    <span>{(item().rating ?? 5).toFixed(1)} collector rating</span>
                  </div>
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

                <p class={styles.price}>
                  <Show
                    when={item().priceRangeCents}
                    fallback={formatPrice(item().priceCents ?? 0)}
                  >
                    {formatPrice(item().priceRangeCents![0])} to {formatPrice(item().priceRangeCents![1])}
                  </Show>
                </p>

                <div class={styles.stockLine}>
                  <span />
                  {item().priceRangeCents ? "Available in multiple formats" : "In stock, ready to ship"}
                </div>

                <p class={styles.description}>{describe(item())}</p>

                <Show
                  when={!item().priceRangeCents}
                  fallback={
                    <div class={styles.optionActions}>
                      <A href={`/categories/${item().game}`} class={styles.primaryButton}>View available formats</A>
                      <A href="/cart" class={styles.secondaryButton}>View cart</A>
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
                        onClick={() => setQuantity(value => Math.min(99, value + 1))}
                      >
                        +
                      </button>
                    </div>

                    <button
                      type="button"
                      class={styles.primaryButton}
                      classList={{ [styles.primaryButtonDone]: added() }}
                      onClick={() => addMain(item())}
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
                        Add to cart
                      </Show>
                    </button>
                  </div>
                  <A href="/cart" class={styles.cartLink}>View your cart</A>
                </Show>

                <div class={styles.purchaseFoot}>
                  <div>
                    <span>Condition</span>
                    <strong>{conditionFor(item())}</strong>
                  </div>
                  <div>
                    <span>Dispatch</span>
                    <strong>Within 1 business day</strong>
                  </div>
                </div>
                </aside>
              </div>

              <a href="#product-story" class={styles.scrollCue}>
                Explore the card
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path d="M12 4v16M6 14l6 6 6-6" />
                </svg>
              </a>
            </section>

            <section class={styles.detailsSection} id="product-story">
              <div class={styles.detailsIntro}>
                <span class={styles.sectionLabel}>The card</span>
                <h2>Every detail, shown clearly.</h2>
                <p>{describe(item())}</p>
                <p>
                  {item().priceRangeCents
                    ? "Stored unopened in a smoke-free, climate-stable room until dispatch."
                    : "Stored in a penny sleeve and top loader from the moment it is listed, then packed in a rigid mailer for dispatch."}
                </p>
              </div>

              <dl class={styles.specifications}>
                <div><dt>Game</dt><dd>{item().gameName}</dd></div>
                <div><dt>Set</dt><dd>{item().set ?? "Various"}</dd></div>
                <div><dt>Product type</dt><dd>{item().priceRangeCents ? "Sealed product" : "Single card"}</dd></div>
                <div><dt>Condition</dt><dd>{conditionFor(item())}</dd></div>
                <div><dt>Language</dt><dd>English</dd></div>
                <div><dt>Ships from</dt><dd>Netherlands</dd></div>
              </dl>
            </section>

            <section class={styles.videoSection}>
              <div class={styles.videoCopy}>
                <span class={styles.sectionLabel}>Closer look</span>
                <h2>Inspect it before it reaches your collection.</h2>
                <p>
                  Check the surface, corners, centering, and finish at a larger scale before buying.
                </p>
              </div>

              <div class={styles.videoFrame}>
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${VIDEO_ID}`}
                  title={`${item().name} product video`}
                  loading="lazy"
                  allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowfullscreen
                />
              </div>
            </section>

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
