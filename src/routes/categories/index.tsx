import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import { createMemo, createResource, For, Show } from "solid-js";
import { formatPrice } from "~/lib/cart";
import { CATEGORY_LIST } from "~/lib/categories";
import styles from "./index.module.scss";

type GameSummary = { game: string; count: number; fromCents: number | null; previews: string[] };

async function loadSummaries() {
  const response = await fetch("/api/catalog/games", { headers: { Accept: "application/json" } });
  if (!response.ok) return [] as GameSummary[];
  return ((await response.json()) as { games: GameSummary[] }).games;
}

export default function Categories() {
  // Fetched on the client only, so the rows render straight away and the
  // counts and artwork fill in.
  const [summaries] = createResource(() => typeof window !== "undefined", loadSummaries);
  const ready = () => summaries.state === "ready";

  const games = createMemo(() => {
    const byGame = new Map((ready() ? summaries() ?? [] : []).map(row => [row.game, row]));
    return CATEGORY_LIST.map(game => ({ ...game, summary: byGame.get(game.slug) }))
      .sort((a, b) => (b.summary?.count ?? 0) - (a.summary?.count ?? 0));
  });

  return (
    <main class={styles.page}>
      <Title>Browse by game | TCGHaven</Title>

      <div class={styles.wide}>
        <h1 class={styles.title}>Games</h1>

        <ul class={styles.list}>
          <For each={games()}>
            {game => (
              <li>
                <A
                  href={`/categories/${game.slug}`}
                  class={styles.row}
                  classList={{ [styles.rowEmpty]: ready() && !game.summary?.count }}
                  data-game={game.slug}
                >
                  <span class={styles.copy}>
                    <span class={styles.name}>{game.name}</span>
                    <span class={styles.tagline}>{game.tagline}</span>
                  </span>

                  <span class={styles.meta}>
                    <Show when={ready()} fallback={<span class={styles.pending} />}>
                      <Show when={game.summary?.count} fallback={<span>Coming soon</span>}>
                        <span>
                          <span class={styles.dot} aria-hidden="true" />
                          {game.summary!.count} {game.summary!.count === 1 ? "product" : "products"}
                        </span>
                        <Show when={game.summary!.fromCents && game.summary!.fromCents >= 100}>
                          <span>from {formatPrice(game.summary!.fromCents!)}</span>
                        </Show>
                      </Show>
                    </Show>
                  </span>

                  <span class={styles.art} aria-hidden="true">
                    <For each={game.summary?.previews ?? []}>
                      {(src, index) => (
                        <img src={src} alt="" decoding="async" draggable={false} style={{ "--i": `${index()}` }} />
                      )}
                    </For>
                  </span>
                </A>
              </li>
            )}
          </For>
        </ul>
      </div>
    </main>
  );
}
