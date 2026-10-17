import { A } from "@solidjs/router";
import { createSignal, onMount } from "solid-js";
import PaymentMethods from "~/components/layout/PaymentMethods";
import SocialLinks from "~/components/layout/SocialLinks";
import { authClient } from "~/lib/auth-client";
import {
  DEFAULT_STORE_PROFILE,
  fetchStoreProfile,
} from "~/lib/store-profile";
import styles from "./Footer.module.scss";

export default function Footer() {
  const session = authClient.useSession();
  const [profile, setProfile] = createSignal(DEFAULT_STORE_PROFILE);
  const accountHref = () =>
    (session().data?.user as { role?: string } | undefined)?.role === "admin"
      ? "/admin"
      : "/account";

  onMount(() => {
    void fetchStoreProfile().then(setProfile);
  });

  return (
    <footer class={styles.footer}>
      <div class={`${styles.wide} ${styles.top}`}>
        <div class={styles.brandCol}>
          <A href="/" class={styles.logo}>
            <span class={styles.logoMark}>
              <img src="/images/logo-mark.png" alt="" width="409" height="379" />
            </span>
            <span class={styles.logoText}>TCG<span class={styles.logoAccent}>Haven</span></span>
          </A>
          <p class={styles.blurb}>
            A haven for collectors. Singles, sealed product, and accessories
            across the games you play, shipped fast from the Netherlands.
          </p>

          <SocialLinks class={styles.socials} />
        </div>

        <div class={styles.linkCol}>
          <h3 class={styles.linkHeading}>Shop</h3>
          <A href="/categories/pokemon">Pokémon</A>
          <A href="/categories/yugioh">Yu-Gi-Oh!</A>
          <A href="/categories/magic">Magic: The Gathering</A>
          <A href="/categories">All games</A>
        </div>

        <div class={styles.linkCol}>
          <h3 class={styles.linkHeading}>Account</h3>
          <A href={accountHref()}>{accountHref() === "/admin" ? "Owner dashboard" : "My account"}</A>
          <A href="/account?section=wishlist">Wishlist</A>
          <A href="/cart">Cart</A>
          <A href="/login">Sign in</A>
        </div>

        <div class={styles.linkCol}>
          <h3 class={styles.linkHeading}>Company</h3>
          <A href="/about">About us</A>
          <A href="/contact">Contact</A>
          <A href="/shipping">Shipping & returns</A>
          <A href="/returns">Withdraw from an order</A>
        </div>
      </div>

      <div class={`${styles.wide} ${styles.payments}`}>
        <PaymentMethods />
        <span class={styles.paymentsNote}>Secure payments processed by Mollie</span>
      </div>

      <div class={`${styles.wide} ${styles.bottom}`}>
        {/* Company registration details (KVK, VAT, address) live on the Terms
            and Privacy pages, which are linked below from every page. That
            keeps them "permanently accessible" per Art. 3:15d BW without
            printing them across the whole site. */}
        <div class={styles.businessDetails}>
          <p>© {new Date().getFullYear()} {profile().companyName}. All rights reserved.</p>
          <a href={`mailto:${profile().businessEmail}`}>{profile().businessEmail}</a>
        </div>
        <div class={styles.bottomLinks}>
          <A href="/terms">Business details</A>
          <A href="/privacy">Privacy</A>
          <A href="/terms">Terms</A>
        </div>
      </div>
    </footer>
  );
}
