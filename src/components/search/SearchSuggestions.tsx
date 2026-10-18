import { useNavigate } from "@solidjs/router";
import { createEffect, createSignal, For, on, onCleanup, Show } from "solid-js";
import { formatPrice } from "~/lib/cart";
import styles from "./SearchSuggestions.module.scss";

type Suggestion = {
  id: string;
  name: string;
  href: string;
  set: string | null;
  number: string | null;
  game: string | null;
  image: string | null;
  priceCents: number | null;
  inStock: boolean;
};

type SearchSuggestionsProps = {
  query: () => string;
  /** The text field the dropdown belongs to; keyboard control hooks into it. */
  input: () => HTMLInputElement | undefined;
  /** Called after the visitor picks a result or "see all". */
  onDone?: () => void;
  align?: "start" | "end";
};

// Type-ahead results under a search field: product image, name, set and
// price. Arrow keys move through them, Enter opens one, Escape closes.
export default function SearchSuggestions(props: SearchSuggestionsProps) {
  const navigate = useNavigate();
  const [results, setResults] = createSignal<Suggestion[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [open, setOpen] = createSignal(false);
  const [active, setActive] = createSignal(-1);
  const listId = `search-suggestions-${Math.random().toString(36).slice(2, 8)}`;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;

  const trimmed = () => props.query().trim();

  createEffect(on(trimmed, query => {
    clearTimeout(timer);
    controller?.abort();
    setActive(-1);
    if (query.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    // A short pause so every keystroke doesn't start a request.
    timer = setTimeout(async () => {
      controller = new AbortController();
      try {
        const response = await fetch(`/api/catalog/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        const data = response.ok ? ((await response.json()) as { results: Suggestion[] }) : { results: [] };
        setResults(data.results);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setResults([]);
      } finally {
        setLoading(false);
      }
    }, 180);
  }, { defer: true }));

  const go = (href: string) => {
    setOpen(false);
    props.onDone?.();
    navigate(href);
  };

  const seeAllHref = () => `/products?q=${encodeURIComponent(trimmed())}`;

  // Wire up the field: show on focus/typing, keyboard navigation, close on blur.
  createEffect(() => {
    const input = props.input();
    if (!input) return;
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", listId);

    const onFocus = () => setOpen(true);
    const onInput = () => setOpen(true);
    const onBlur = () => setTimeout(() => setOpen(false), 120);
    const onKeyDown = (event: KeyboardEvent) => {
      const count = results().length;
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (!open() || !count) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive(index => (index + 1) % count);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive(index => (index <= 0 ? count - 1 : index - 1));
      } else if (event.key === "Enter" && active() >= 0) {
        event.preventDefault();
        go(results()[active()].href);
      }
    };

    input.addEventListener("focus", onFocus);
    input.addEventListener("input", onInput);
    input.addEventListener("blur", onBlur);
    input.addEventListener("keydown", onKeyDown);
    onCleanup(() => {
      input.removeEventListener("focus", onFocus);
      input.removeEventListener("input", onInput);
      input.removeEventListener("blur", onBlur);
      input.removeEventListener("keydown", onKeyDown);
    });
  });

  createEffect(() => {
    const input = props.input();
    if (!input) return;
    const expanded = open() && trimmed().length >= 2;
    input.setAttribute("aria-expanded", String(expanded));
    if (active() >= 0) input.setAttribute("aria-activedescendant", `${listId}-${active()}`);
    else input.removeAttribute("aria-activedescendant");
  });

  onCleanup(() => {
    clearTimeout(timer);
    controller?.abort();
  });

  return (
    <Show when={open() && trimmed().length >= 2}>
      <div
        class={styles.panel}
        classList={{ [styles.alignEnd]: props.align === "end" }}
        // Keep focus in the field while clicking a result.
        onMouseDown={event => event.preventDefault()}
      >
        <Show
          when={results().length}
          fallback={
            <p class={styles.empty}>
              {loading() ? "Searching…" : `No products match "${trimmed()}"`}
            </p>
          }
        >
          <ul id={listId} role="listbox" class={styles.list} classList={{ [styles.listLoading]: loading() }}>
            <For each={results()}>
              {(item, index) => (
                <li
                  id={`${listId}-${index()}`}
                  role="option"
                  aria-selected={active() === index()}
                  class={styles.item}
                  classList={{ [styles.itemActive]: active() === index() }}
                  onMouseEnter={() => setActive(index())}
                  onClick={() => go(item.href)}
                >
                  <span class={styles.thumb}>
                    <Show when={item.image} fallback={<img src="/images/logo-mark.png" alt="" class={styles.placeholder} />}>
                      {image => <img src={image()} alt="" loading="lazy" />}
                    </Show>
                  </span>
                  <span class={styles.text}>
                    <strong>{item.name}</strong>
                    <small>{[item.number, item.set, item.game].filter(Boolean).join(" · ")}</small>
                  </span>
                  <span class={styles.price}>
                    <Show when={item.priceCents} fallback={<span />}>
                      {price => <b>{formatPrice(price())}</b>}
                    </Show>
                    <Show when={!item.inStock}>
                      <em>Sold out</em>
                    </Show>
                  </span>
                </li>
              )}
            </For>
          </ul>
        </Show>
        <a
          href={seeAllHref()}
          class={styles.seeAll}
          onClick={event => {
            event.preventDefault();
            go(seeAllHref());
          }}
        >
          See all results for "{trimmed()}"
        </a>
      </div>
    </Show>
  );
}
