import { Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import { createEffect, Show } from "solid-js";
import { authClient } from "~/lib/auth-client";
import styles from "./account.module.scss";

export default function Account() {
  const navigate = useNavigate();
  const session = authClient.useSession();

  createEffect(() => {
    if (!session().isPending && !session().data) {
      navigate("/login");
    }
  });

  const initials = () => {
    const name = session().data?.user.name ?? "";
    return name
      .split(" ")
      .map(part => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  };

  return (
    <main class={styles.page}>
      <div class="container">
        <Title>Your account — TCGHaven</Title>

        <Show when={!session().isPending && session().data} fallback={<div class={styles.loading}>Loading…</div>}>
          {data => (
            <>
              <header class={styles.header}>
                <span class={styles.avatar}>{initials() || "?"}</span>
                <div>
                  <h1 class={styles.name}>{data().user.name}</h1>
                  <p class={styles.email}>{data().user.email}</p>
                </div>
              </header>

              <div class={styles.grid}>
                <article class={styles.card}>
                  <span class={styles.cardIcon}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
                      <path d="M3 6h18" />
                      <path d="M16 10a4 4 0 0 1-8 0" />
                    </svg>
                  </span>
                  <div>
                    <p class={styles.cardTitle}>Orders</p>
                    <p class={styles.cardText}>Track and review your past purchases.</p>
                  </div>
                </article>

                <article class={styles.card}>
                  <span class={styles.cardIcon}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M12 20s-7.5-4.6-10-9.3C.4 7.1 2 3.5 5.6 3a5 5 0 0 1 6.4 2.2A5 5 0 0 1 18.4 3c3.6.5 5.2 4.1 3.6 7.7C19.5 15.4 12 20 12 20Z" />
                    </svg>
                  </span>
                  <div>
                    <p class={styles.cardTitle}>Wishlist</p>
                    <p class={styles.cardText}>Cards and sets you're keeping an eye on.</p>
                  </div>
                </article>

                <article class={styles.card}>
                  <span class={styles.cardIcon}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="8" r="4" />
                      <path d="M5 20a7 7 0 0 1 14 0" />
                    </svg>
                  </span>
                  <div>
                    <p class={styles.cardTitle}>Account details</p>
                    <p class={styles.cardText}>Update your name, email, and password.</p>
                  </div>
                </article>
              </div>

              <button
                type="button"
                class={styles.signOut}
                onClick={() => authClient.signOut().then(() => navigate("/"))}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <path d="M16 17l5-5-5-5" />
                  <path d="M21 12H9" />
                </svg>
                Sign out
              </button>
            </>
          )}
        </Show>
      </div>
    </main>
  );
}
