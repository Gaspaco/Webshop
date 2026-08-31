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
import styles from "./shipping.module.scss";

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
        <header class={styles.hero}>
          <div>
            <span>Delivery from the Netherlands</span>
            <h1>Shipping that fits the collection.</h1>
          </div>
          <div class={styles.heroFact}>
            <strong>{formatPrice(profile().freeShippingThresholdCents)}</strong>
            <span>Free PostNL shipping from this order value</span>
          </div>
        </header>

        <section class={styles.rateSection}>
          <div class={styles.sectionIntro}>
            <span>PostNL</span>
            <h2>Current Netherlands rates</h2>
            <p>The final method depends on the size, value, and protection needed for the order. Checkout offers the suitable everyday options.</p>
          </div>
          <div class={styles.rateList}>
            <For each={postnlRates()}>
              {(rate, index) => (
                <article>
                  <span>{String(index() + 1).padStart(2, "0")}</span>
                  <div><strong>{rate.name}</strong><small>{rate.detail}</small></div>
                  <b>{formatPrice(rate.price)}</b>
                </article>
              )}
            </For>
          </div>
        </section>

        <section class={styles.carrierSection}>
          <article>
            <span>PostNL</span>
            <h2>One trusted carrier</h2>
            <p>Every order ships with PostNL. Dutch checkout offers letterbox and parcel delivery, depending on the order.</p>
          </article>
          <article>
            <span>International</span>
            <h2>{INTERNATIONAL_POSTNL_DESTINATIONS.length} destinations</h2>
            <p>The checkout calculates the owner-approved rate from the delivery country and verifies it again on the server.</p>
          </article>
        </section>

        <section class={styles.internationalSection}>
          <div class={styles.sectionIntro}>
            <span>PostNL abroad</span>
            <h2>International rates</h2>
            <p>These customer prices apply per order. Orders of {formatPrice(profile().freeShippingThresholdCents)} or more ship free.</p>
          </div>
          <div class={styles.internationalRates}>
            <div class={styles.rateHeader} aria-hidden="true">
              <span>Destination</span>
              <span>Zone</span>
              <span>Price</span>
            </div>
            <For each={INTERNATIONAL_POSTNL_DESTINATIONS}>
              {destination => (
                <div class={styles.internationalRate}>
                  <strong>{destination.name}</strong>
                  <span>{destination.zone}</span>
                  <b>{formatPrice(
                    profile().internationalPostnlRates[destination.code] ??
                      destination.priceCents,
                  )}</b>
                </div>
              )}
            </For>
          </div>
          <p class={styles.destinationNote}>
            Need delivery somewhere else? Contact the shop before ordering so the current PostNL price can be confirmed.
          </p>
        </section>

        <section class={styles.returnSection}>
          <div>
            <span>Withdrawal and returns</span>
            <h2>Clear dates, costs, and refund steps.</h2>
          </div>
          <div>
            <p>Notify us within 14 days after delivery. You do not need to give a reason. After notifying us, send the products back within another 14 days.</p>
            <A href="/returns">Submit withdrawal request</A>
          </div>
        </section>

        <section class={styles.returnPolicy} aria-labelledby="return-policy-title">
          <div class={styles.policyIntro}>
            <h2 id="return-policy-title">How a return works</h2>
            <p>Use the online form or email {profile().businessEmail}. We send a reference and the correct return instructions.</p>
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
