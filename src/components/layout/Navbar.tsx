import { A, useLocation, useNavigate } from "@solidjs/router";
import { createEffect, createSignal, For, on, onCleanup, onMount, Show } from "solid-js";
import { authClient } from "~/lib/auth-client";
import { useCart } from "~/lib/cart";
import CardScan from "~/components/search/CardScan";
import SearchSuggestions from "~/components/search/SearchSuggestions";
import styles from "./Navbar.module.scss";

const LINKS = [
  { href: "/", label: "Home", match: (path: string) => path === "/" },
  { href: "/products", label: "Shop", match: (path: string) => path.startsWith("/products") },
  { href: "/categories", label: "Games", match: (path: string) => path.startsWith("/categories") },
];

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const cart = useCart();
  const [menuOpen, setMenuOpen] = createSignal(false);
  const [scrolled, setScrolled] = createSignal(false);
  const [compact, setCompact] = createSignal(false);
  let navList: HTMLUListElement | undefined;
  let indicator: HTMLLIElement | undefined;
  let headerRef: HTMLElement | undefined;
  const activeIndex = () => LINKS.findIndex(link => link.match(location.pathname));
  const session = authClient.useSession();
  const [searchOpen, setSearchOpen] = createSignal(false);
  const [query, setQuery] = createSignal("");
  let searchInput: HTMLInputElement | undefined;
  let wrapRef: HTMLFormElement | undefined;
  const accountHref = () => {
    const currentUser = session().data?.user as { role?: string } | undefined;
    // During hydration Better Auth has not restored the session yet. Sending
    // the visitor to /login in that short window makes an authenticated user
    // look logged out. Let /account perform the authoritative session check.
    if (session().isPending || session().error) return "/account";
    if (!currentUser) return "/login?next=%2Faccount";
    return currentUser.role === "admin" ? "/admin" : "/account";
  };

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
    if (menuOpen() && headerRef && !headerRef.contains(e.target as Node)) {
      setMenuOpen(false);
    }
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      closeSearch();
      setMenuOpen(false);
    }
  };

  // Past the first screenful the bar contracts into a centred pill.
  const onScroll = () => {
    setScrolled(window.scrollY > 24);
    setCompact(window.scrollY > 120);
  };

  onMount(() => {
    document.addEventListener("pointerdown", onOutsidePointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    onCleanup(() => {
      document.removeEventListener("pointerdown", onOutsidePointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll);
    });
  });

  // A pill slides behind the nav links: it rests on the current page and
  // follows the pointer while it moves across the other links.
  const moveIndicator = (index: number, instant = false) => {
    if (!navList || !indicator) return;
    const link = navList.querySelectorAll<HTMLElement>("a")[index];
    if (!link) {
      indicator.style.opacity = "0";
      return;
    }
    const listBox = navList.getBoundingClientRect();
    const linkBox = link.getBoundingClientRect();
    // The CSS transition does the sliding; `instant` skips it for the first
    // placement so the pill doesn't fly in from the left on load.
    indicator.classList.toggle(styles.indicatorInstant, instant);
    indicator.style.transform = `translateX(${linkBox.left - listBox.left}px)`;
    indicator.style.width = `${linkBox.width}px`;
    indicator.style.opacity = "1";
  };

  onMount(() => {
    moveIndicator(activeIndex(), true);
    // Web fonts change the link widths once they load.
    void document.fonts?.ready.then(() => moveIndicator(activeIndex(), true));
  });

  createEffect(on(() => location.pathname, () => {
    moveIndicator(activeIndex());
    setMenuOpen(false);
  }, { defer: true }));



  return (
    <header class={styles.navbar} ref={headerRef}>
      <div
        class={styles.inner}
        classList={{ [styles.scrolled]: scrolled(), [styles.compact]: compact() }}
      >
        <A href="/" class={styles.logo}>
          <span class={styles.logoMark}>
            <img src="/images/logo-mark.png" alt="" width="409" height="379" />
          </span>
          <span class={styles.logoText}>TCG<span class={styles.logoAccent}>Haven</span></span>
        </A>

        <nav class={styles.navWrap} aria-label="Main">
          <ul
            class={styles.nav}
            ref={navList}
            onPointerLeave={() => moveIndicator(activeIndex())}
          >
            <li class={styles.indicator} ref={indicator} aria-hidden="true" />
            <For each={LINKS}>
              {(link, i) => (
                <li>
                  <A
                    href={link.href}
                    class={styles.navLink}
                    classList={{ [styles.navLinkActive]: i() === activeIndex() }}
                    aria-current={i() === activeIndex() ? "page" : undefined}
                    end={link.href === "/"}
                    onPointerEnter={() => moveIndicator(i())}
                    onFocus={() => moveIndicator(i())}
                    onBlur={() => moveIndicator(activeIndex())}
                  >
                    {link.label}
                  </A>
                </li>
              )}
            </For>
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
              aria-label="Search the catalogue"
              value={query()}
              onFocus={() => setSearchOpen(true)}
              onInput={e => setQuery(e.currentTarget.value)}
            />
            <button
              type={searchOpen() ? "submit" : "button"}
              class={`${styles.iconBtn} ${styles.searchTrigger}`}
              aria-label={searchOpen() ? "Submit search" : "Open search"}
              onClick={() => {
                if (!searchOpen()) openSearch();
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </button>
            <SearchSuggestions
              query={query}
              input={() => searchInput}
              onDone={() => {
                setQuery("");
                closeSearch();
              }}
              align="end"
            />
            <Show when={searchOpen()}>
              <button
                type="button"
                class={`${styles.iconBtn} ${styles.searchClose}`}
                aria-label="Close search"
                onClick={closeSearch}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </Show>
          </form>

          <CardScan />
          <A
            href="/account?section=wishlist"
            class={`${styles.iconBtn} ${styles.wishlistBtn}`}
            aria-label="Wishlist"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20s-7.5-4.6-10-9.3C.4 7.1 2 3.5 5.6 3a5 5 0 0 1 6.4 2.2A5 5 0 0 1 18.4 3c3.6.5 5.2 4.1 3.6 7.7C19.5 15.4 12 20 12 20Z" />
            </svg>
          </A>
          <A
            href={accountHref()}
            class={`${styles.iconBtn} ${styles.accountBtn}`}
            aria-label="Customer account"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M5 20a7 7 0 0 1 14 0" />
            </svg>
          </A>
          <A
            href="/cart"
            class={styles.cartBtn}
            classList={{ [styles.cartFilled]: cart.count() > 0 }}
            data-cart-target
            aria-label={`Cart, ${cart.count()} item${cart.count() === 1 ? "" : "s"}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
              <path d="M3 6h18" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
            {/* Keyed on the count so the badge pops each time it changes. */}
            <Show when={cart.count() > 0 ? cart.count() : undefined} keyed>
              {count => <span class={styles.cartCount}>{count > 99 ? "99+" : count}</span>}
            </Show>
          </A>

          <button
            type="button"
            class={`${styles.iconBtn} ${styles.menuBtn}`}
            aria-label={menuOpen() ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen()}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen(open => !open)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">
              <Show when={menuOpen()} fallback={<path d="M4 8h16M4 16h16" />}>
                <path d="M18 6 6 18M6 6l12 12" />
              </Show>
            </svg>
          </button>
        </div>
      </div>

      <Show when={menuOpen()}>
        <div class={styles.menu} id="mobile-menu">
          <nav aria-label="Mobile">
            <For each={LINKS}>
              {(link, i) => (
                <A
                  href={link.href}
                  class={styles.menuLink}
                  classList={{ [styles.menuLinkActive]: i() === activeIndex() }}
                  end={link.href === "/"}
                >
                  {link.label}
                </A>
              )}
            </For>
          </nav>
          <div class={styles.menuSecondary}>
            <A href="/account?section=wishlist">Wishlist</A>
            <A href={accountHref()}>Account</A>
            <A href="/contact">Contact</A>
          </div>
        </div>
      </Show>
    </header>
  );
}
