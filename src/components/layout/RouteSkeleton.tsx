import { For, Show } from "solid-js";

export type SkeletonVariant =
  | "grid"
  | "detail"
  | "games"
  | "game"
  | "subpage"
  | "account"
  | "page";

const range = (count: number) => Array.from({ length: count }, (_, index) => index);

// Placeholders shaped like the page being opened, so the layout doesn't jump
// when the data arrives. Every variant has real height: rendering nothing let
// the footer collapse up under the navbar.
export default function RouteSkeleton(props: {
  variant?: SkeletonVariant;
  // Inside a page that already renders its own <main>.
  inline?: boolean;
}) {
  const variant = () => props.variant ?? "grid";
  const block = (extra?: string) => `sk-shimmer ${extra ?? ""}`;

  const body = () => (
    <>
      <span class="sk-srOnly">Loading</span>

      {/* Shop: title + search row, game tabs, product grid. */}
      <Show when={variant() === "grid"}>
        <div class="sk-wide">
          <div class="sk-headRow">
            <span class={block("sk-title")} />
            <span class={block("sk-search")} />
          </div>
          <div class="sk-tabs">
            <For each={range(6)}>{() => <span class={block()} />}</For>
          </div>
          <ProductGridSkeleton count={10} />
        </div>
      </Show>

      {/* Product: breadcrumb, image panel with thumbnails, details column. */}
      <Show when={variant() === "detail"}>
        <div class="sk-wide">
          <span class={block("sk-crumb")} />
          <div class="sk-detail">
            <div class="sk-gallery">
              <span class={block("sk-galleryMain")} />
              <div class="sk-thumbs">
                <For each={range(4)}>{() => <span class={block()} />}</For>
              </div>
            </div>
            <div class="sk-column">
              <div class="sk-chips">
                <span class={block()} />
                <span class={block()} />
              </div>
              <span class={block("sk-dTitle")} />
              <span class={block("sk-dPrice")} />
              <span class={block("sk-dLine")} />
              <span class={block("sk-dLineShort")} />
              <span class={block("sk-dField")} />
              <div class="sk-dBuy">
                <span class={block()} />
                <span class={block()} />
              </div>
            </div>
          </div>
        </div>
      </Show>

      {/* Games index: a grid of game tiles. */}
      <Show when={variant() === "games"}>
        <div class="sk-wide">
          <div class="sk-headRow">
            <span class={block("sk-title")} />
          </div>
          <div class="sk-gameRows">
            <For each={range(7)}>{() => <span class={block("sk-gameRow")} />}</For>
          </div>
        </div>
      </Show>

      {/* Game overview: hero, then the store pages and a product row. */}
      <Show when={variant() === "game"}>
        <div class="sk-wide">
          <GameHeaderSkeleton />
          <span class={block("sk-hero")} />
          <div class="sk-tiles">
            <For each={range(3)}>{() => <span class={block()} />}</For>
          </div>
          <ProductGridSkeleton count={4} />
        </div>
      </Show>

      {/* Game shop / sets / releases: header, tabs, grid. */}
      <Show when={variant() === "subpage"}>
        <div class="sk-wide">
          <GameHeaderSkeleton />
          <ProductGridSkeleton count={10} />
        </div>
      </Show>

      {/* Account dashboard: sidebar and panels. */}
      <Show when={variant() === "account"}>
        <div class="sk-account">
          <div class="sk-sidebar">
            <span class={block("sk-identity")} />
            <For each={range(8)}>{() => <span class={block("sk-navItem")} />}</For>
          </div>
          <div class="sk-workspace">
            <span class={block("sk-title")} />
            <span class={block("sk-dLineShort")} />
            <span class={block("sk-panelWide")} />
            <span class={block("sk-panelWide")} />
            <div class="sk-panels">
              <span class={block()} />
              <span class={block()} />
            </div>
          </div>
        </div>
      </Show>

      <Show when={variant() === "page"}>
        <div class="sk-wide">
          <div class="sk-headRow">
            <span class={block("sk-title")} />
          </div>
          <div class="sk-blocks">
            <For each={range(4)}>{() => <span class={block()} />}</For>
          </div>
        </div>
      </Show>
    </>
  );

  // Two explicit branches: a Dynamic element here rendered without a
  // hydration key and broke hydration of streamed pages.
  return (
    <Show
      when={props.inline}
      fallback={
        <main class="sk-route" role="status" aria-live="polite" aria-label="Loading">
          {body()}
        </main>
      }
    >
      <div
        class="sk-route"
        classList={{ "sk-routeAccount": variant() === "account" }}
        role="status"
        aria-live="polite"
        aria-label="Loading"
      >
        {body()}
      </div>
    </Show>
  );
}

function GameHeaderSkeleton() {
  return (
    <div class="sk-gameHeader">
      <div class="sk-gameHeaderTitle">
        <span class={"sk-shimmer sk-backLine"} />
        <span class={"sk-shimmer sk-title"} />
      </div>
      <span class={"sk-shimmer sk-tabPill"} />
    </div>
  );
}

function ProductGridSkeleton(props: { count: number }) {
  return (
    <div class="sk-grid">
      <For each={range(props.count)}>
        {() => (
          <div class="sk-card">
            <span class={"sk-shimmer sk-cardArt"} />
            <span class={"sk-shimmer sk-cardName"} />
            <span class={"sk-shimmer sk-cardMeta"} />
          </div>
        )}
      </For>
    </div>
  );
}
