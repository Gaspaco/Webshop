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
          <p>
            <strong>Cards are checked and packed in Rotterdam.</strong>{" "}
            Orders ship tracked with PostNL, and payments are handled by Mollie.
          </p>
          <A href="/shipping">Shipping and returns</A>
        </div>

        <div class={styles.accountPanel}>
          <div class={styles.accountHeading}>
            <h2>Orders and saved cards</h2>
            <p>Sign in to view your orders, addresses, and wishlist.</p>
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
