import { A } from "@solidjs/router";
import { Show } from "solid-js";
import { authClient } from "~/lib/auth-client";
import styles from "./HavenBand.module.scss";

const ArrowIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    aria-hidden="true"
  >
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export default function HavenBand() {
  const session = authClient.useSession();
  const currentUser = () => session().data?.user as
    | { name?: string; role?: string }
    | undefined;
  const accountHref = () =>
    currentUser()?.role === "admin" ? "/admin" : "/account";

  return (
    <section class={styles.section} aria-labelledby="collector-confidence-title">
      <div class={styles.layout}>
        <div class={styles.cardStage} aria-hidden="true">
          <div class={`${styles.card} ${styles.cardBack}`}>
            <img src="/images/cards/charizard.png" alt="" loading="lazy" />
          </div>
          <div class={`${styles.card} ${styles.cardMiddle}`}>
            <img src="/images/cards/palkia.png" alt="" loading="lazy" />
          </div>
          <div class={`${styles.card} ${styles.cardFront}`}>
            <img src="/images/cards/umbreon.png" alt="" loading="lazy" />
          </div>

          <div class={styles.cardNote}>
            <span>Exact card shown</span>
            <strong>Photo, printing and condition stay together.</strong>
          </div>
        </div>

        <div class={styles.content}>
          <div class={styles.intro}>
            <h2 id="collector-confidence-title">
              Know exactly which card is arriving.
            </h2>
            <p>
              The option you choose stays connected to its image, finish,
              language, condition and live stock.
            </p>
          </div>

          <dl class={styles.facts}>
            <div>
              <dt>Choose precisely</dt>
              <dd>The product image changes with the selected printing.</dd>
            </div>
            <div>
              <dt>Trust the stock</dt>
              <dd>Unavailable variants remain visible, but cannot be bought.</dd>
            </div>
            <div>
              <dt>Follow the order</dt>
              <dd>Use PostNL delivery or local pickup and track it from your account.</dd>
            </div>
          </dl>

          <div class={styles.actions}>
            <A href="/products?type=single" class={styles.primaryAction}>
              Browse single cards
              <ArrowIcon />
            </A>

            <Show
              when={currentUser()}
              fallback={
                <A href="/signup?next=%2Faccount" class={styles.accountAction}>
                  Create an account
                </A>
              }
            >
              <A href={accountHref()} class={styles.accountAction}>
                {currentUser()?.role === "admin" ? "Open dashboard" : "View my account"}
              </A>
            </Show>
          </div>
        </div>
      </div>
    </section>
  );
}
