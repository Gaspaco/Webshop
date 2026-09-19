import { A } from "@solidjs/router";
import { Show } from "solid-js";
import { authClient } from "~/lib/auth-client";
import styles from "./HavenBand.module.scss";

export default function HavenBand() {
  const session = authClient.useSession();
  const currentUser = () => session().data?.user as
    | { name?: string; role?: string }
    | undefined;
  const accountHref = () =>
    currentUser()?.role === "admin" ? "/admin" : "/account";

  return (
    <section class={styles.section}>
      <div class={styles.wide}>
        <div class={styles.serviceNote}>
          <div class={styles.serviceLead}>
            <p>Packed by the people who listed it.</p>
            <span>A small collector-run shop in Rotterdam.</span>
          </div>

          <dl class={styles.serviceFacts}>
            <div>
              <dt>Condition</dt>
              <dd>Checked under clear light before listing</dd>
            </div>
            <div>
              <dt>Delivery</dt>
              <dd>Tracked with PostNL from the Netherlands</dd>
            </div>
            <div>
              <dt>Payment</dt>
              <dd>iDEAL and cards, processed by Mollie</dd>
            </div>
          </dl>
        </div>

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
            <Show
              when={currentUser()}
              fallback={
                <>
                  <A href="/signup?next=%2Faccount" class={styles.accountPrimary}>
                    Create account
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </A>
                  <A href="/login?next=%2Faccount" class={styles.accountSecondary}>I already have an account</A>
                </>
              }
            >
              <A href={accountHref()} class={styles.accountPrimary}>
                {currentUser()?.role === "admin" ? "Open dashboard" : "View my account"}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </A>
              <A href="/products" class={styles.accountSecondary}>Continue shopping</A>
            </Show>
          </div>
        </div>
      </div>
    </section>
  );
}
