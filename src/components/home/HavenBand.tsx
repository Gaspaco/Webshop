import { A } from "@solidjs/router";
import { createSignal, For, Show } from "solid-js";
import styles from "./HavenBand.module.scss";

const TRENDING = [
  { name: "Charizard", image: "/images/cards/charizard.png", href: "/products" },
  { name: "Umbreon VMAX", image: "/images/cards/umbreon.png", href: "/products" },
  { name: "Pikachu", image: "/images/cards/pikachu.png", href: "/products" },
  { name: "Rayquaza VMAX", image: "/images/cards/rayquaza.png", href: "/products" },
  { name: "Palkia V", image: "/images/cards/palkia.png", href: "/products" },
  { name: "Venusaur", image: "/images/cards/venusaur.png", href: "/products" },
];

export default function HavenBand() {
  const [email, setEmail] = createSignal("");
  const [subscribed, setSubscribed] = createSignal(false);

  const onSubscribe = (event: SubmitEvent) => {
    event.preventDefault();
    if (!email().trim()) return;
    setSubscribed(true);
  };

  return (
    <section class={styles.section}>
      <div class={styles.wide}>
        {/* Trending searches */}
        <div class={styles.trending}>
          <h2 class={styles.trendingTitle}>Trending searches</h2>
          <div class={styles.trendingRow}>
            <For each={TRENDING}>
              {card => (
                <A href={card.href} class={styles.trendingCard}>
                  <span class={styles.trendingThumb}>
                    <img src={card.image} alt="" draggable={false} />
                  </span>
                  <span class={styles.trendingName}>{card.name}</span>
                </A>
              )}
            </For>
          </div>
        </div>

        {/* Trust strip */}
        <ul class={styles.perks}>
          <li class={styles.perk}>
            <span class={styles.perkIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 3l7 4v5c0 4.4-3 7.4-7 9-4-1.6-7-4.6-7-9V7l7-4Z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </span>
            <div class={styles.perkText}>
              <h3>Honest grading</h3>
              <p>Real photos, real conditions. No surprises at your door.</p>
            </div>
          </li>
          <li class={styles.perk}>
            <span class={styles.perkIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 7h11v8H3zM14 10h4l3 3v2h-7z" />
                <circle cx="7" cy="17" r="1.8" />
                <circle cx="17" cy="17" r="1.8" />
              </svg>
            </span>
            <div class={styles.perkText}>
              <h3>Fast NL shipping</h3>
              <p>Packed with care, shipped tracked from the Netherlands.</p>
            </div>
          </li>
          <li class={styles.perk}>
            <span class={styles.perkIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="4" y="10" width="16" height="10" rx="2" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" />
              </svg>
            </span>
            <div class={styles.perkText}>
              <h3>Secure checkout</h3>
              <p>Pay with iDEAL, cards, and more through Mollie.</p>
            </div>
          </li>
          <li class={styles.perk}>
            <span class={styles.perkIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 20s-7.5-4.6-10-9.3C.4 7.1 2 3.5 5.6 3a5 5 0 0 1 6.4 2.2A5 5 0 0 1 18.4 3c3.6.5 5.2 4.1 3.6 7.7C19.5 15.4 12 20 12 20Z" />
              </svg>
            </span>
            <div class={styles.perkText}>
              <h3>Run by collectors</h3>
              <p>We chase the same cards you do. Small shop, real people.</p>
            </div>
          </li>
        </ul>

        {/* Newsletter */}
        <div class={styles.newsletter}>
          <div class={styles.newsletterCopy}>
            <h2 class={styles.newsletterTitle}>Join the Haven</h2>
            <p class={styles.newsletterBlurb}>
              New drops, restocks, and preorder windows straight to your inbox.
              No spam, ever.
            </p>
          </div>

          <Show
            when={!subscribed()}
            fallback={
              <p class={styles.newsletterDone} role="status">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                You're in. See you at the next drop.
              </p>
            }
          >
            <form class={styles.newsletterForm} onSubmit={onSubscribe}>
              <input
                type="email"
                class={styles.newsletterInput}
                placeholder="you@example.com"
                aria-label="Email address"
                required
                value={email()}
                onInput={event => setEmail(event.currentTarget.value)}
              />
              <button type="submit" class={styles.newsletterBtn}>
                Sign me up
              </button>
            </form>
          </Show>
        </div>
      </div>
    </section>
  );
}
