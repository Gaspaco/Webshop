import { A } from "@solidjs/router";
import { For } from "solid-js";
import styles from "./HavenBand.module.scss";

const TRENDING = [
  { name: "Charizard", image: "/images/cards/charizard.png", href: "/products?q=Charizard" },
  { name: "Umbreon VMAX", image: "/images/cards/umbreon.png", href: "/products?q=Umbreon%20VMAX" },
  { name: "Pikachu", image: "/images/cards/pikachu.png", href: "/products?q=Pikachu" },
  { name: "Rayquaza VMAX", image: "/images/cards/rayquaza.png", href: "/products?q=Rayquaza%20VMAX" },
  { name: "Palkia V", image: "/images/cards/palkia.png", href: "/products?q=Palkia%20V" },
  { name: "Venusaur", image: "/images/cards/venusaur.png", href: "/products?q=Venusaur" },
];

export default function HavenBand() {
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
        <dl class={styles.perks}>
          <div class={styles.perk}>
            <dt>Honest grading</dt>
            <dd>Real photos, real conditions. No surprises at your door.</dd>
          </div>
          <div class={styles.perk}>
            <dt>PostNL delivery</dt>
            <dd>Packed with care, shipped tracked from the Netherlands.</dd>
          </div>
          <div class={styles.perk}>
            <dt>Secure checkout</dt>
            <dd>Pay with iDEAL, cards, and more through Mollie.</dd>
          </div>
          <div class={styles.perk}>
            <dt>Run by collectors</dt>
            <dd>We chase the same cards you do. Small shop, real people.</dd>
          </div>
        </dl>

        <div class={styles.accountPanel}>
          <div class={styles.accountHeading}>
            <span>Member access</span>
            <h2>Pick up where you left off.</h2>
          </div>

          <div class={styles.accountInfo}>
            <p>Keep the practical parts of collecting together.</p>
            <ul aria-label="Account benefits">
              <li>Orders</li>
              <li>Addresses</li>
              <li>Wishlist</li>
            </ul>
          </div>

          <div class={styles.accountActions}>
            <A href="/signup" class={styles.accountPrimary}>
              Create account
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </A>
            <A href="/login" class={styles.accountSecondary}>I already have an account</A>
          </div>
        </div>
      </div>
    </section>
  );
}
