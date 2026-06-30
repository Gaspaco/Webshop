import { A, useNavigate } from "@solidjs/router";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { useCart } from "~/lib/cart";
import styles from "./Navbar.module.scss";

export default function Navbar() {
  const navigate = useNavigate();
  const cart = useCart();
  const [searchOpen, setSearchOpen] = createSignal(false);
  const [query, setQuery] = createSignal("");
  let searchInput: HTMLInputElement | undefined;
  let wrapRef: HTMLFormElement | undefined;

  const openSearch = () => {
    setSearchOpen(true);
    requestAnimationFrame(() => searchInput?.focus());
  };

  const closeSearch = () => setSearchOpen(false);

  const submitSearch = (e: SubmitEvent) => {
    e.preventDefault();
    const q = query().trim();
    if (!q) {
      searchInput?.focus();
      return;
    }
    navigate(`/products?q=${encodeURIComponent(q)}`);
    closeSearch();
  };

  // pointerdown (not click) so this never races against the trigger
  // button's own click handler that opens/closes the search field.
  const onOutsidePointer = (e: PointerEvent) => {
    if (searchOpen() && wrapRef && !wrapRef.contains(e.target as Node)) {
      closeSearch();
    }
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") closeSearch();
  };

  onMount(() => {
    document.addEventListener("pointerdown", onOutsidePointer);
    document.addEventListener("keydown", onKey);
    onCleanup(() => {
      document.removeEventListener("pointerdown", onOutsidePointer);
      document.removeEventListener("keydown", onKey);
    });
  });

  return (
    <header class={styles.navbar}>
      <div class={styles.inner}>
        <A href="/" class={styles.logo}>
          <span class={styles.logoMark}>
            <img src="/images/logo-mark.png" alt="" width="409" height="379" />
          </span>
          <span class={styles.logoText}>TCG<span class={styles.logoAccent}>Haven</span></span>
        </A>

        <nav>
          <ul class={styles.nav}>
            <li><A href="/products" class={styles.navLink}>Shop</A></li>
            <li><A href="/categories" class={styles.navLink}>Categories</A></li>
            <li><A href="/about" class={styles.navLink}>About</A></li>
          </ul>
        </nav>

        <div class={styles.actions}>
          <form
            class={styles.searchWrap}
            classList={{ [styles.searchOpen]: searchOpen() }}
            ref={wrapRef}
            onSubmit={submitSearch}
            role="search"
          >
            <input
              ref={searchInput}
              type="search"
              class={styles.searchInput}
              placeholder="Search cards, sets, sealed…"
              tabIndex={searchOpen() ? 0 : -1}
              value={query()}
              onInput={e => setQuery(e.currentTarget.value)}
            />
            <button
              type="button"
              class={`${styles.iconBtn} ${styles.searchTrigger}`}
              aria-label={searchOpen() ? "Close search" : "Search"}
              onClick={() => (searchOpen() ? closeSearch() : openSearch())}
            >
              <Show
                when={!searchOpen()}
                fallback={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M18 6 6 18" />
                    <path d="M6 6l12 12" />
                  </svg>
                }
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
              </Show>
            </button>
          </form>

          <A href="/wishlist" class={styles.iconBtn} aria-label="Wishlist">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20s-7.5-4.6-10-9.3C.4 7.1 2 3.5 5.6 3a5 5 0 0 1 6.4 2.2A5 5 0 0 1 18.4 3c3.6.5 5.2 4.1 3.6 7.7C19.5 15.4 12 20 12 20Z" />
            </svg>
          </A>
          <A href="/account" class={styles.iconBtn} aria-label="Account">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M5 20a7 7 0 0 1 14 0" />
            </svg>
          </A>
          <A href="/cart" class={styles.iconBtn} aria-label={`Cart, ${cart.count()} item${cart.count() === 1 ? "" : "s"}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
              <path d="M3 6h18" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
            <Show when={cart.count() > 0}>
              <span class={styles.cartBadge}>{cart.count()}</span>
            </Show>
          </A>
        </div>
      </div>
    </header>
  );
}
