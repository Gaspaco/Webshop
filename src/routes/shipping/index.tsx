import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import { createSignal, For, onMount, Show } from "solid-js";
import { formatPrice } from "~/lib/cart";
import { INTERNATIONAL_POSTNL_DESTINATIONS } from "~/lib/shipping";
import {
  DEFAULT_STORE_PROFILE,
  fetchStoreProfile,
  type StoreProfile,
} from "~/lib/store-profile";
import styles from "./index.module.scss";

export default function Shipping() {
  const [profile, setProfile] = createSignal<StoreProfile>(DEFAULT_STORE_PROFILE);
  onMount(async () => setProfile(await fetchStoreProfile()));

  const postnlRates = () => [
    { name: "Letter or postcard", detail: "14 × 9 cm to 32.4 × 22.9 cm, up to 2 kg", price: profile().postnlLetterCents },
    { name: "Letterbox parcel", detail: "Maximum 38 × 26.5 × 3 cm, up to 2 kg", price: profile().postnlLetterboxCents },
    { name: "Small parcel", detail: "Maximum 34 × 28 × 12 cm, up to 3 kg", price: profile().postnlSmallParcelCents },
    { name: "Medium parcel", detail: "Maximum 100 × 50 × 50 cm, up to 10 kg", price: profile().postnlParcelCents },
    { name: "Large parcel", detail: "Maximum 176 × 78 × 58 cm, up to 23 kg", price: profile().postnlLargeParcelCents },
  ];

  return (
    <main class={styles.page}>
      <Title>Shipping and returns | TCGHaven</Title>
      <div class={styles.wide}>
        <header class={styles.header}>
          <h1>Shipping and returns</h1>
          <p>
            Every order ships from the Netherlands with PostNL, or you can collect it
            for free in Rotterdam.
          </p>
          <span class={styles.freeShipping}>
            Free shipping from {formatPrice(profile().freeShippingThresholdCents)}
          </span>
        </header>

        <div class={styles.grid}>
          <section class={`${styles.panel} ${styles.rates}`} aria-labelledby="nl-rates">
            <h2 id="nl-rates">Netherlands</h2>
            <p class={styles.panelIntro}>
              The final method depends on the size, value and protection the order needs.
            </p>
            <ul class={styles.rateList}>
              <For each={postnlRates()}>
                {rate => (
                  <li>
                    <span>
                      <strong>{rate.name}</strong>
                      <small>{rate.detail}</small>
                    </span>
                    <b>{formatPrice(rate.price)}</b>
                  </li>
                )}
              </For>
              <li>
                <span>
                  <strong>Pick up in Rotterdam</strong>
                  <small>Wait for the ready-for-pickup email before travelling.</small>
                </span>
                <b>Free</b>
              </li>
            </ul>
          </section>

          <section class={`${styles.panel} ${styles.international}`} aria-labelledby="intl-rates">
            <h2 id="intl-rates">International</h2>
            <p class={styles.panelIntro}>
              Per order. Orders of {formatPrice(profile().freeShippingThresholdCents)} or more ship free.
            </p>
            <ul class={styles.countryList}>
              <For each={INTERNATIONAL_POSTNL_DESTINATIONS}>
                {destination => (
                  <li>
                    <strong>{destination.name}</strong>
                    <span>{destination.zone}</span>
                    <b>{formatPrice(
                      profile().internationalPostnlRates[destination.code] ??
                        destination.priceCents,
                    )}</b>
                  </li>
                )}
              </For>
            </ul>
            <p class={styles.note}>
              Somewhere else? <A href="/contact">Contact the shop</A> before ordering and we'll confirm the PostNL price.
            </p>
          </section>
        </div>

        <section class={`${styles.panel} ${styles.returns}`} aria-labelledby="return-policy-title">
          <div class={styles.returnsIntro}>
            <h2 id="return-policy-title">Returns</h2>
            <p>
              Let us know within 14 days after delivery. You don't need to give a reason.
              After that you have another 14 days to send the products back.
            </p>
            <div class={styles.returnsActions}>
              <A href="/returns" class={styles.primaryAction}>Start a return</A>
              <a href={`mailto:${profile().businessEmail}`} class={styles.secondaryAction}>Email the shop</a>
            </div>
            <Show when={profile().returnAddress}>
              <address>
                <span>Return address</span>
                <strong>{profile().companyName}</strong>
                {profile().returnAddress}
              </address>
            </Show>
          </div>

          <div class={styles.policyDetails}>
            <article>
              <h3>Change of mind</h3>
              <p>You pay the direct return shipping cost. Keep proof of dispatch and use packaging that protects the card, slab, or sealed product.</p>
            </article>
            <article>
              <h3>Incorrect or damaged item</h3>
              <p>Contact us with the order number and clear photos. TCGHaven pays necessary return costs when a product does not match the agreement.</p>
            </article>
            <article>
              <h3>Product handling</h3>
              <p>You may inspect an item as you could in a shop. A deduction may apply only for actual value lost through handling beyond what was necessary. Opening randomized sealed products can cause substantial value loss.</p>
            </article>
            <article>
              <h3>Refund timing</h3>
              <p>For a full withdrawal, we refund the purchase price and standard outbound delivery within 14 days of notice. We may wait for the goods or proof of dispatch. A partial return does not include the original delivery charge.</p>
            </article>
          </div>
        </section>
      </div>
    </main>
  );
}
