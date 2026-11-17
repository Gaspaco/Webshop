import { A } from "@solidjs/router";
import { createMemo, createSignal, For, Show } from "solid-js";
import styles from "./StorefrontManager.module.scss";

export type StorefrontSettings = {
  announcement: string;
  heroTitle: string;
  heroCopy: string;
  featuredProductSlugs: string[];
  socialInstagram: string;
  socialTiktok: string;
  socialYoutube: string;
  socialDiscord: string;
};

type PickableProduct = {
  name: string;
  slug: string;
  status: "draft" | "active" | "archived";
  imageUrls: string[];
};

const DEFAULTS: StorefrontSettings = {
  announcement: "",
  heroTitle: "Umbreon VMAX has landed",
  heroCopy: "Freshly graded cards and collector favourites, ready to ship from our Dutch stock.",
  featuredProductSlugs: [],
  socialInstagram: "",
  socialTiktok: "",
  socialYoutube: "",
  socialDiscord: "",
};

const SOCIALS = [
  ["socialInstagram", "Instagram", "@mylittletcghaven or full URL"],
  ["socialTiktok", "TikTok", "@handle or full URL"],
  ["socialYoutube", "YouTube", "Channel URL"],
  ["socialDiscord", "Discord", "Server invite URL"],
] as const;

const MAX_FEATURED = 12;

function Counter(props: { value: string; max: number }) {
  return (
    <span class={styles.counter} data-near={props.value.length > props.max * 0.9 ? "" : undefined}>
      {props.value.length}/{props.max}
    </span>
  );
}

export default function StorefrontManager(props: {
  settings?: Partial<StorefrontSettings>;
  products: PickableProduct[];
  onUpdated: () => unknown;
}) {
  const initial = (): StorefrontSettings => ({
    ...DEFAULTS,
    ...(props.settings ?? {}),
    featuredProductSlugs: props.settings?.featuredProductSlugs ?? [],
  });
  const [saved, setSaved] = createSignal(JSON.stringify(initial()));
  const [settings, setSettings] = createSignal<StorefrontSettings>(initial());
  const [busy, setBusy] = createSignal(false);
  const [notice, setNotice] = createSignal<{ tone: "ok" | "error"; text: string } | null>(null);
  const [search, setSearch] = createSignal("");

  const dirty = () => JSON.stringify(settings()) !== saved();
  const patch = <K extends keyof StorefrontSettings>(key: K, value: StorefrontSettings[K]) =>
    setSettings(current => ({ ...current, [key]: value }));

  const productBySlug = createMemo(() => new Map(props.products.map(product => [product.slug, product])));
  const featured = () => settings().featuredProductSlugs;
  const matches = createMemo(() => {
    const query = search().trim().toLowerCase();
    if (query.length < 2) return [];
    return props.products
      .filter(product => product.status === "active" && !featured().includes(product.slug))
      .filter(product => product.name.toLowerCase().includes(query) || product.slug.includes(query))
      .slice(0, 6);
  });

  const addFeatured = (slug: string) => {
    if (featured().includes(slug) || featured().length >= MAX_FEATURED) return;
    patch("featuredProductSlugs", [...featured(), slug]);
    setSearch("");
  };
  const removeFeatured = (slug: string) =>
    patch("featuredProductSlugs", featured().filter(entry => entry !== slug));
  const moveFeatured = (index: number, direction: -1 | 1) => {
    const next = [...featured()];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    patch("featuredProductSlugs", next);
  };

  const save = async (event: SubmitEvent) => {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/content", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings()),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setNotice({ tone: "error", text: result.error ?? "The storefront could not be updated." });
        return;
      }
      setSaved(JSON.stringify(settings()));
      await Promise.resolve(props.onUpdated());
      setNotice({ tone: "ok", text: "Published. Customers see the changes on their next visit." });
    } catch {
      setNotice({ tone: "error", text: "The storefront could not be updated. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form class={styles.storefront} onSubmit={save}>
      <div class={styles.toolbar}>
        <p>Changes stay private until you publish them.</p>
        <A href="/" target="_blank">Open homepage</A>
      </div>

      <section class={styles.panel}>
        <header class={styles.head}>
          <div>
            <h2>Homepage</h2>
            <p>The announcement bar and the first thing visitors read.</p>
          </div>
        </header>

        <div class={styles.split}>
          <div class={styles.fields}>
            <label>
              <span>Announcement bar <Counter value={settings().announcement} max={180} /></span>
              <input
                maxlength="180"
                placeholder="Free shipping in the Netherlands this weekend"
                value={settings().announcement}
                onInput={event => patch("announcement", event.currentTarget.value)}
              />
              <small>Leave empty to hide the bar.</small>
            </label>
            <label>
              <span>Headline <Counter value={settings().heroTitle} max={100} /></span>
              <input required maxlength="100" value={settings().heroTitle} onInput={event => patch("heroTitle", event.currentTarget.value)} />
            </label>
            <label>
              <span>Intro text <Counter value={settings().heroCopy} max={300} /></span>
              <textarea required rows="3" maxlength="300" value={settings().heroCopy} onInput={event => patch("heroCopy", event.currentTarget.value)} />
            </label>
          </div>

          <figure class={styles.preview} aria-label="Preview of the top of the homepage">
            <figcaption>Preview</figcaption>
            <div class={styles.previewFrame}>
              <Show when={settings().announcement.trim()}>
                <div class={styles.previewBar}>{settings().announcement}</div>
              </Show>
              <div class={styles.previewHero}>
                <strong>{settings().heroTitle || "Your headline"}</strong>
                <p>{settings().heroCopy || "Your intro text"}</p>
                <span aria-hidden="true">Shop now</span>
              </div>
            </div>
          </figure>
        </div>
      </section>

      <section class={styles.panel}>
        <header class={styles.head}>
          <div>
            <h2>Featured products</h2>
            <p>Shown under "New arrivals and best sellers", in this order. Leave empty and the shop picks eight products automatically.</p>
          </div>
          <span class={styles.headCount}>{featured().length} of {MAX_FEATURED}</span>
        </header>

        <div class={styles.featured}>
          <Show when={featured().length}>
            <ol class={styles.picks}>
              <For each={featured()}>
                {(slug, index) => {
                  const product = () => productBySlug().get(slug);
                  const problem = () =>
                    !product() ? "No product has this link" : product()!.status !== "active" ? "Not live, so it won't show" : "";
                  return (
                    <li data-problem={problem() ? "" : undefined}>
                      <span class={styles.thumb} aria-hidden="true">
                        <Show when={product()?.imageUrls[0]} fallback={(product()?.name ?? slug).slice(0, 1).toUpperCase()}>
                          {src => <img src={src()} alt="" loading="lazy" />}
                        </Show>
                      </span>
                      <span class={styles.pickText}>
                        <strong>{product()?.name ?? slug}</strong>
                        <small>{problem() || `/${slug}`}</small>
                      </span>
                      <span class={styles.pickActions}>
                        <button type="button" disabled={index() === 0} aria-label={`Move ${product()?.name ?? slug} up`} onClick={() => moveFeatured(index(), -1)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 15 6-6 6 6" /></svg>
                        </button>
                        <button type="button" disabled={index() === featured().length - 1} aria-label={`Move ${product()?.name ?? slug} down`} onClick={() => moveFeatured(index(), 1)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                        </button>
                        <button type="button" class={styles.remove} aria-label={`Remove ${product()?.name ?? slug}`} onClick={() => removeFeatured(slug)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                        </button>
                      </span>
                    </li>
                  );
                }}
              </For>
            </ol>
          </Show>

          <div class={styles.search}>
            <label for="featured-search" class={styles.srOnly}>Find a live product to feature</label>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m20 20-4.2-4.2M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Z" /></svg>
            <input
              id="featured-search"
              type="search"
              autocomplete="off"
              placeholder={featured().length >= MAX_FEATURED ? `Remove one to add another (max ${MAX_FEATURED})` : "Search live products to feature"}
              disabled={featured().length >= MAX_FEATURED}
              value={search()}
              onInput={event => setSearch(event.currentTarget.value)}
              onKeyDown={event => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  const first = matches()[0];
                  if (first) addFeatured(first.slug);
                }
              }}
            />
            <Show when={matches().length}>
              <ul class={styles.results}>
                <For each={matches()}>
                  {product => (
                    <li>
                      <button type="button" onClick={() => addFeatured(product.slug)}>
                        <span class={styles.thumb} aria-hidden="true">
                          <Show when={product.imageUrls[0]} fallback={product.name.slice(0, 1).toUpperCase()}>
                            {src => <img src={src()} alt="" loading="lazy" />}
                          </Show>
                        </span>
                        <span class={styles.pickText}>
                          <strong>{product.name}</strong>
                          <small>/{product.slug}</small>
                        </span>
                        <span class={styles.add}>Add</span>
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
            <Show when={search().trim().length >= 2 && !matches().length}>
              <p class={styles.noResults}>No live products match "{search().trim()}".</p>
            </Show>
          </div>
        </div>
      </section>

      <section class={styles.panel}>
        <header class={styles.head}>
          <div>
            <h2>Social links</h2>
            <p>Shown in the footer and on the contact page. Empty links are hidden.</p>
          </div>
        </header>
        <div class={styles.socials}>
          <For each={SOCIALS}>
            {([key, label, placeholder]) => (
              <label>
                <span>{label}</span>
                <input
                  type="text"
                  inputmode="url"
                  autocomplete="off"
                  placeholder={placeholder}
                  value={settings()[key]}
                  onInput={event => patch(key, event.currentTarget.value)}
                />
              </label>
            )}
          </For>
        </div>
      </section>

      <div class={styles.saveBar} data-dirty={dirty() ? "" : undefined}>
        <p role="status">
          <Show
            when={notice()}
            fallback={dirty() ? "You have unpublished changes." : "Everything here is live."}
          >
            {current => <span data-tone={current().tone}>{current().text}</span>}
          </Show>
        </p>
        <Show when={dirty()}>
          <button type="button" class={styles.discard} disabled={busy()} onClick={() => { setSettings(JSON.parse(saved()) as StorefrontSettings); setNotice(null); }}>
            Discard
          </button>
        </Show>
        <button type="submit" class={styles.publish} disabled={busy() || !dirty()}>
          {busy() ? "Publishing…" : "Publish changes"}
        </button>
      </div>
    </form>
  );
}
