import { Title } from "@solidjs/meta";
import { A, useParams } from "@solidjs/router";
import { createSignal, For, Show } from "solid-js";
import { formatPrice, useCart } from "~/lib/cart";
import { findProduct, relatedProducts, type ShopProduct } from "~/lib/categories";
import ProductCard, { BoxArt, Stars } from "~/components/product/ProductCard";
import styles from "./[id].module.scss";

// Placeholder review video. Swap this id for a real product video anytime.
const VIDEO_ID = "aqz-KE-bpKQ";

const VIDEO_POINTS = [
  "Close-ups of the holo, print lines, and texture",
  "Corners, edges, and centering under good light",
  "Exactly how it's sleeved and packed to ship",
];

const REVIEWS = [
  { name: "Sanne V.", rating: 5, text: "Card arrived exactly as graded, better in person, honestly. Packed like a brick. Will buy again." },
  { name: "Daan K.", rating: 5, text: "Fast shipping across the border and the condition notes were spot on. Proper collector service." },
  { name: "Emma R.", rating: 4, text: "Lovely card and great comms. Took a couple of days to ship but worth the wait." },
];

function describe(p: ShopProduct) {
  if (p.priceRangeCents) {
    return `Factory-sealed ${p.gameName} product, brand new and never opened. Stored properly and shipped tracked from the Netherlands, so it reaches you in collector-ready condition.`;
  }
  return `An authentic ${p.gameName} single${p.set ? ` from ${p.set}` : ""}. Every card is hand-checked and graded before it ships. The card in the photo is the exact one that lands on your doorstep.`;
}

function moreInfo(p: ShopProduct) {
  if (p.priceRangeCents) {
    return "Sealed the way it left the factory and kept in a smoke-free, climate-stable room. Choose your quantity at checkout, from a single pack right up to a full booster box.";
  }
  return "It's kept in a penny sleeve and top-loader from the moment it's listed, then packed in a rigid, water-resistant mailer so it travels safe. If anything's off when it arrives, message me and I'll make it right.";
}

const PROMISES = [
  {
    title: "Hand-graded",
    text: "Checked and graded in-house. No mystery conditions.",
    icon: () => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 3l7 4v5c0 4.4-3 7.4-7 9-4-1.6-7-4.6-7-9V7l7-4Z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
  {
    title: "Packed safe",
    text: "Sleeved, toploadered, and posted in a rigid mailer.",
    icon: () => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
        <path d="m3 8 9 5 9-5M12 13v8" />
      </svg>
    ),
  },
  {
    title: "Tracked shipping",
    text: "Sent from the Netherlands with tracking across the EU.",
    icon: () => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 7h11v8H3zM14 10h4l3 3v2h-7z" />
        <circle cx="7" cy="17" r="1.6" />
        <circle cx="17.5" cy="17" r="1.6" />
      </svg>
    ),
  },
  {
    title: "14-day returns",
    text: "Not what you hoped? Send it back within 14 days.",
    icon: () => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
        <path d="M3 3v5h5" />
      </svg>
    ),
  },
];

export default function ProductDetail() {
  const params = useParams();
  const cart = useCart();
  const product = () => findProduct(params.id ?? "");

  const [qty, setQty] = createSignal(1);
  const [added, setAdded] = createSignal(false);
  const [justAdded, setJustAdded] = createSignal<Set<string>>(new Set());
  const [openSections, setOpenSections] = createSignal<Set<string>>(new Set(["description"]));

  const toggleSection = (key: string) =>
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const addMain = (p: ShopProduct) => {
    if (p.priceRangeCents || p.priceCents === undefined) return;
    for (let i = 0; i < qty(); i++) {
      cart.addItem({
        id: p.id,
        name: p.set ? `${p.name} · ${p.set}` : p.name,
        image: p.image ?? "/images/logo-mark.png",
        priceCents: p.priceCents,
      });
    }
    setAdded(true);
    setTimeout(() => setAdded(false), 1600);
  };

  const addRelated = (p: { id: string; name: string; set?: string; image?: string; priceCents?: number; priceRangeCents?: [number, number] }) => {
    if (p.priceRangeCents || p.priceCents === undefined) return;
    cart.addItem({
      id: p.id,
      name: p.set ? `${p.name} · ${p.set}` : p.name,
      image: p.image ?? "/images/logo-mark.png",
      priceCents: p.priceCents,
    });
    setJustAdded(prev => new Set(prev).add(p.id));
    setTimeout(() => {
      setJustAdded(prev => {
        const next = new Set(prev);
        next.delete(p.id);
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
              <p class={styles.missingText}>
                That card may have sold out or moved. Let's get you back to the shelf.
              </p>
              <A href="/products" class={styles.missingBtn}>Back to shop</A>
            </div>
          </div>
        </main>
      }
    >
      {p => (
        <main class={styles.page}>
          <Title>{p().name} | TCGHaven</Title>

          <div class={styles.wide}>
            <nav class={styles.breadcrumb} aria-label="Breadcrumb">
              <A href="/products">Shop</A>
              <span aria-hidden="true">/</span>
              <A href={`/categories/${p().game}`}>{p().gameName}</A>
              <span aria-hidden="true">/</span>
              <span class={styles.crumbCurrent}>{p().name}</span>
            </nav>

            <div class={styles.detail}>
              <div class={`${styles.media} ${styles[p().theme]}`}>
                <Show
                  when={p().image}
                  fallback={<BoxArt theme={p().theme} label={p().set ?? p().name} />}
                >
                  <img src={p().image} alt={p().set ? `${p().name}, ${p().set}` : p().name} draggable={false} />
                </Show>
                <Show when={p().badge}>
                  <span class={styles.badge}>{p().badge}</span>
                </Show>
              </div>

              <div class={styles.info}>
                <A href={`/categories/${p().game}`} class={styles.gameTag}>{p().gameName}</A>
                <h1 class={styles.name}>{p().name}</h1>
                <Show when={p().set}>
                  <p class={styles.set}>{p().set}</p>
                </Show>
                <div class={styles.rating}>
                  <Stars rating={p().rating ?? 5} />
                  <span class={styles.ratingText}>
                    {(p().rating ?? 5).toFixed(1)} · {REVIEWS.length} reviews
                  </span>
                </div>

                <p class={styles.price}>
                  <Show
                    when={p().priceRangeCents}
                    fallback={formatPrice(p().priceCents ?? 0)}
                  >
                    {formatPrice(p().priceRangeCents![0])} – {formatPrice(p().priceRangeCents![1])}
                  </Show>
                </p>

                <p class={styles.desc}>{describe(p())}</p>

                <Show
                  when={!p().priceRangeCents}
                  fallback={
                    <div class={styles.actions}>
                      <A href={`/categories/${p().game}`} class={styles.buyBtn}>View options</A>
                      <A href="/cart" class={styles.cartBtn}>View cart</A>
                    </div>
                  }
                >
                  <div class={styles.buyRow}>
                    <div class={styles.qty}>
                      <button type="button" aria-label="Decrease quantity" onClick={() => setQty(q => Math.max(1, q - 1))}>−</button>
                      <span class={styles.qtyValue}>{qty()}</span>
                      <button type="button" aria-label="Increase quantity" onClick={() => setQty(q => Math.min(99, q + 1))}>+</button>
                    </div>
                    <button
                      type="button"
                      class={styles.buyBtn}
                      classList={{ [styles.buyBtnDone]: added() }}
                      onClick={() => addMain(p())}
                    >
                      {added() ? "Added to cart ✓" : "Add to cart"}
                    </button>
                  </div>
                  <A href="/cart" class={styles.cartLink}>View cart →</A>
                </Show>

                <ul class={styles.trust}>
                  <For
                    each={[
                      "In stock, ready to ship today",
                      p().priceRangeCents ? "Brand new, factory sealed" : "Graded & hand-checked in-house",
                      "Tracked shipping from the Netherlands",
                    ]}
                  >
                    {line => (
                      <li>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                        {line}
                      </li>
                    )}
                  </For>
                </ul>
              </div>
            </div>

            <section class={styles.info2}>
              <h2 class={styles.sectionTitle}>Product information</h2>

              <div class={styles.accordion}>
                <div class={styles.accItem} classList={{ [styles.accOpen]: openSections().has("description") }}>
                  <button
                    type="button"
                    class={styles.accHead}
                    aria-expanded={openSections().has("description")}
                    onClick={() => toggleSection("description")}
                  >
                    <span>Description</span>
                    <svg class={styles.accChevron} viewBox="0 0 24 24" aria-hidden="true">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                  <div class={styles.accBody}>
                    <div class={styles.accInner}>
                      <p>{describe(p())}</p>
                      <p>{moreInfo(p())}</p>
                    </div>
                  </div>
                </div>

                <div class={styles.accItem} classList={{ [styles.accOpen]: openSections().has("details") }}>
                  <button
                    type="button"
                    class={styles.accHead}
                    aria-expanded={openSections().has("details")}
                    onClick={() => toggleSection("details")}
                  >
                    <span>Details &amp; specifications</span>
                    <svg class={styles.accChevron} viewBox="0 0 24 24" aria-hidden="true">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                  <div class={styles.accBody}>
                    <div class={styles.accInner}>
                      <dl class={styles.detailsStrip}>
                        <div class={styles.detailCell}>
                          <dt>Game</dt>
                          <dd>{p().gameName}</dd>
                        </div>
                        <div class={styles.detailCell}>
                          <dt>Set</dt>
                          <dd>{p().set ?? "Various"}</dd>
                        </div>
                        <div class={styles.detailCell}>
                          <dt>Type</dt>
                          <dd>{p().priceRangeCents ? "Sealed product" : "Single card"}</dd>
                        </div>
                        <div class={styles.detailCell}>
                          <dt>Condition</dt>
                          <dd>{p().priceRangeCents ? "Factory sealed" : "Near Mint"}</dd>
                        </div>
                        <div class={styles.detailCell}>
                          <dt>Language</dt>
                          <dd>English</dd>
                        </div>
                        <div class={styles.detailCell}>
                          <dt>Ships from</dt>
                          <dd>Netherlands</dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                </div>

                <div class={styles.accItem} classList={{ [styles.accOpen]: openSections().has("shipping") }}>
                  <button
                    type="button"
                    class={styles.accHead}
                    aria-expanded={openSections().has("shipping")}
                    onClick={() => toggleSection("shipping")}
                  >
                    <span>Shipping &amp; returns</span>
                    <svg class={styles.accChevron} viewBox="0 0 24 24" aria-hidden="true">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                  <div class={styles.accBody}>
                    <div class={styles.accInner}>
                      <p>
                        Every order is sleeved, toploadered, and posted in a rigid,
                        water-resistant mailer, tracked from the Netherlands. EU
                        delivery usually lands within 2–5 business days.
                      </p>
                      <p>
                        Changed your mind? You have 14 days to return an unused item
                        for a refund under EU consumer law. Just get in touch first.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section class={styles.video}>
              <div class={styles.videoFrame}>
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${VIDEO_ID}`}
                  title={`${p().name} review`}
                  loading="lazy"
                  allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowfullscreen
                />
              </div>

              <div class={styles.videoAside}>
                <span class={styles.eyebrow}>On camera</span>
                <h2 class={styles.sectionTitle}>See it in action</h2>
                <p class={styles.videoSub}>
                  A closer look at {p().name} before you buy, no filters, just the card.
                </p>
                <ul class={styles.videoPoints}>
                  <For each={VIDEO_POINTS}>
                    {point => (
                      <li>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                        {point}
                      </li>
                    )}
                  </For>
                </ul>
              </div>
            </section>

            <section class={styles.reviews}>
              <div class={styles.reviewsHead}>
                <div>
                  <h2 class={styles.sectionTitle}>What collectors say</h2>
                  <p class={styles.reviewsSummary}>
                    <strong>{(p().rating ?? 5).toFixed(1)}</strong> out of 5 · based on {REVIEWS.length} reviews
                  </p>
                </div>
                <Stars rating={Math.round(p().rating ?? 5)} />
              </div>

              <div class={styles.reviewGrid}>
                <For each={REVIEWS}>
                  {review => (
                    <div class={styles.reviewCard}>
                      <Stars rating={review.rating} />
                      <p class={styles.reviewText}>“{review.text}”</p>
                      <p class={styles.reviewName}>{review.name}</p>
                    </div>
                  )}
                </For>
              </div>
            </section>

            <section class={styles.promise}>
              <For each={PROMISES}>
                {item => (
                  <div class={styles.promiseItem}>
                    <span class={styles.promiseIcon}>{item.icon()}</span>
                    <div>
                      <h3 class={styles.promiseTitle}>{item.title}</h3>
                      <p class={styles.promiseText}>{item.text}</p>
                    </div>
                  </div>
                )}
              </For>
            </section>

            <Show when={relatedProducts(p()).length}>
              <section class={styles.related}>
                <div class={styles.relatedHead}>
                  <h2 class={styles.relatedTitle}>More {p().gameName}</h2>
                  <A href={`/categories/${p().game}`} class={styles.relatedLink}>
                    View all
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </A>
                </div>
                <div class={styles.relatedGrid}>
                  <For each={relatedProducts(p())}>
                    {r => (
                      <ProductCard
                        product={r}
                        isJustAdded={() => justAdded().has(r.id)}
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
