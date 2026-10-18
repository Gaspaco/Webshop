import { A } from "@solidjs/router";
import { createMemo, createResource, For, Show } from "solid-js";
import { formatPrice } from "~/lib/cart";
import styles from "./ShopByBudget.module.scss";

// The same bands the shop's price filter uses, so each tile lands on a
// pre-filtered shop page.
const BUDGETS = [
  { key: "under25", label: "Under €25", hint: "Singles, packs and small gifts" },
  { key: "25to100", label: "€25 to €100", hint: "Decks, bundles and chase cards" },
  { key: "over100", label: "€100 and up", hint: "Booster boxes and collector pieces" },
] as const;

type BudgetSummary = { band: string; count: number; fromCents: number | null; previews: string[] };

async function loadBudgets() {
  const response = await fetch("/api/catalog/budgets", { headers: { Accept: "application/json" } });
  if (!response.ok) return [] as BudgetSummary[];
  return ((await response.json()) as { budgets: BudgetSummary[] }).budgets;
}

// Counted on the server across the whole catalogue: the homepage itself only
// carries its newest few products.
export default function ShopByBudget() {
  const [summaries] = createResource(() => typeof window !== "undefined", loadBudgets);
  const ready = () => summaries.state === "ready";

  const bands = createMemo(() => {
    const byBand = new Map((ready() ? summaries() ?? [] : []).map(row => [row.band, row]));
    return BUDGETS.map(band => {
      const summary = byBand.get(band.key);
      return {
        ...band,
        count: summary?.count ?? 0,
        // A starting price says nothing useful for the cheapest band.
        from: band.key === "under25" ? null : summary?.fromCents ?? null,
        previews: summary?.previews ?? [],
      };
    });
  });

  return (
    <section class={styles.section} aria-labelledby="budget-title">
      <div class={styles.wide}>
        <header class={styles.header}>
          <h2 id="budget-title">Shop by budget</h2>
          <p>Pick what you'd like to spend and we'll show you everything in stock.</p>
        </header>

        <div class={styles.bands}>
          <For each={bands()}>
            {(band, index) => (
              <A
                href={`/products?price=${band.key}&stock=1`}
                class={styles.band}
                data-tier={index()}
              >
                <span class={styles.copy}>
                  <strong>{band.label}</strong>
                  <span>{band.hint}</span>
                </span>

                <span class={styles.stack} aria-hidden="true">
                  <For each={band.previews}>
                    {(src, i) => (
                      <img src={src} alt="" loading="lazy" draggable={false} style={{ "--i": `${i()}` }} />
                    )}
                  </For>
                </span>

                <span class={styles.foot}>
                  <Show when={ready()} fallback={<span class={styles.pending} />}>
                  <Show when={band.count} fallback={<span>New stock coming soon</span>}>
                    <span>{band.count} in stock</span>
                    <Show when={band.from}>{from => <span>from {formatPrice(from())}</span>}</Show>
                  </Show>
                  </Show>
                </span>
              </A>
            )}
          </For>
        </div>
      </div>
    </section>
  );
}
