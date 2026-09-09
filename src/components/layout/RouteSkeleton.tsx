import { For, Show } from "solid-js";
import styles from "./RouteSkeleton.module.scss";

export type SkeletonVariant = "grid" | "detail" | "page";

// Placeholders for a route that is still resolving its data. Every variant is
// laid out in normal flow with real height: the previous behaviour rendered
// nothing at all, which let the site footer collapse up under the navbar.
export default function RouteSkeleton(props: {
  variant?: SkeletonVariant;
  rail?: boolean;
}) {
  const variant = () => props.variant ?? "grid";

  return (
    <main class={styles.route} role="status" aria-live="polite" aria-label="Loading">
      <span class={styles.srOnly}>Loading</span>
      <div class={styles.wide}>
        <div class={styles.head}>
          <span class={`${styles.shimmer} ${styles.headTitle}`} />
          <span class={`${styles.shimmer} ${styles.headMeta}`} />
        </div>

        <Show when={variant() === "detail"}>
          <div class={styles.detail}>
            <div class={styles.detailMedia}>
              <div class={styles.detailMediaHead}>
                <span class={styles.shimmer} />
                <span class={styles.shimmer} />
              </div>
              <div class={styles.detailArt}>
                <span class={styles.shimmer} />
              </div>
            </div>

            <div class={styles.detailPanel}>
              <span class={`${styles.shimmer} ${styles.dKicker}`} />
              <span class={`${styles.shimmer} ${styles.dTitle}`} />
              <span class={`${styles.shimmer} ${styles.dPrice}`} />
              <span class={`${styles.shimmer} ${styles.dLine}`} />
              <span class={`${styles.shimmer} ${styles.dLineShort}`} />
              <span class={`${styles.shimmer} ${styles.dSelect}`} />
              <div class={styles.dBuy}>
                <span class={styles.shimmer} />
                <span class={styles.shimmer} />
              </div>
              <div class={styles.dSpecs}>
                <For each={[0, 1, 2]}>{() => <span class={styles.shimmer} />}</For>
              </div>
            </div>
          </div>
        </Show>

        <Show when={variant() === "grid"}>
          <div class={styles.shell} classList={{ [styles.shellRail]: props.rail }}>
            <Show when={props.rail}>
              <aside class={styles.rail}>
                <For each={[0, 1, 2, 3, 4, 5, 6, 7]}>
                  {() => <span class={styles.shimmer} />}
                </For>
              </aside>
            </Show>

            <div class={styles.results}>
              <div class={styles.toolbar}>
                <span class={styles.shimmer} />
                <span class={styles.shimmer} />
              </div>
              <div class={styles.grid}>
                <For each={[0, 1, 2, 3, 4, 5, 6, 7]}>
                  {() => (
                    <div class={styles.card}>
                      <span class={`${styles.shimmer} ${styles.cardArt}`} />
                      <span class={`${styles.shimmer} ${styles.cardName}`} />
                      <span class={`${styles.shimmer} ${styles.cardMeta}`} />
                    </div>
                  )}
                </For>
              </div>
            </div>
          </div>
        </Show>

        <Show when={variant() === "page"}>
          <div class={styles.blocks}>
            <For each={[0, 1, 2, 3]}>{() => <span class={styles.shimmer} />}</For>
          </div>
        </Show>
      </div>
    </main>
  );
}
