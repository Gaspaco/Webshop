import { A } from "@solidjs/router";
import { createMemo, For, Show } from "solid-js";
import styles from "./SalesAnalytics.module.scss";

type SalesDay = { date: string; revenueCents: number; orders: number };

type AnalyticsOrder = {
  createdAt: string;
  status: string;
  items: Array<{ sku: string; name: string; quantity: number; totalCents: number }>;
};

const WINDOW_DAYS = 30;
const PAID_STATUSES = new Set(["paid", "processing", "shipped", "completed"]);

const money = new Intl.NumberFormat("en-NL", { style: "currency", currency: "EUR" });
const wholeMoney = new Intl.NumberFormat("en-NL", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const compactMoney = new Intl.NumberFormat("en-NL", {
  style: "currency",
  currency: "EUR",
  notation: "compact",
  maximumFractionDigits: 1,
});
const shortDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const longDate = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const formatMoney = (cents: number) => money.format(cents / 100);
const dayDate = (key: string) => new Date(`${key}T12:00:00Z`);

// A continuous run of days ending today. The API only returns days that had
// orders, so quiet days are filled in as zero instead of disappearing.
function lastDays(sales: SalesDay[], count: number) {
  const byDate = new Map(sales.map(day => [day.date, day]));
  const today = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - (count - 1 - index)));
    const key = date.toISOString().slice(0, 10);
    return byDate.get(key) ?? { date: key, revenueCents: 0, orders: 0 };
  });
}

// Round the axis to 1, 2, 2.5 or 5 times a power of ten so ticks read cleanly.
function axisTicks(maxCents: number) {
  const max = Math.max(maxCents / 100, 1);
  const rough = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map(factor => factor * magnitude).find(value => value >= rough) ?? rough;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, index) => Math.round(index * step * 100));
}

function tickLabel(cents: number, top: number) {
  return top >= 1_000_000 ? compactMoney.format(cents / 100) : wholeMoney.format(cents / 100);
}

export default function SalesAnalytics(props: {
  salesByDay: SalesDay[];
  averageOrderCents: number;
  returningCustomers: number;
  orders: AnalyticsOrder[];
}) {
  const days = createMemo(() => lastDays(props.salesByDay, WINDOW_DAYS));
  const revenue = () => days().reduce((sum, day) => sum + day.revenueCents, 0);
  const orderCount = () => days().reduce((sum, day) => sum + day.orders, 0);
  const activeDays = () => days().filter(day => day.orders > 0).length;
  const ticks = createMemo(() => axisTicks(Math.max(...days().map(day => day.revenueCents))));
  const top = () => ticks().at(-1) ?? 1;
  const bestDay = createMemo(() =>
    days().reduce<SalesDay | null>((best, day) => (day.revenueCents > (best?.revenueCents ?? 0) ? day : best), null),
  );

  const bestSellers = createMemo(() => {
    const start = dayDate(days()[0]!.date).getTime() - 12 * 36e5;
    const totals = new Map<string, { name: string; sku: string; units: number; revenueCents: number }>();
    for (const order of props.orders) {
      if (!PAID_STATUSES.has(order.status) || Date.parse(order.createdAt) < start) continue;
      for (const item of order.items) {
        const current = totals.get(item.sku) ?? { name: item.name, sku: item.sku, units: 0, revenueCents: 0 };
        current.units += item.quantity;
        current.revenueCents += item.totalCents;
        totals.set(item.sku, current);
      }
    }
    return [...totals.values()].sort((a, b) => b.revenueCents - a.revenueCents).slice(0, 6);
  });
  const bestSellerTop = () => bestSellers()[0]?.revenueCents ?? 1;

  // Label every fifth day, counted back from today so the last column is named.
  const showDateLabel = (index: number) => (WINDOW_DAYS - 1 - index) % 5 === 0;

  return (
    <div class={styles.analytics}>
      <section class={styles.toolbar}>
        <p>
          {shortDate.format(dayDate(days()[0]!.date))} to {shortDate.format(dayDate(days().at(-1)!.date))}
        </p>
        <A href="/api/admin/export?type=orders" target="_blank">Export source data</A>
      </section>

      <section class={styles.kpis} aria-label="Totals for the last 30 days">
        <article>
          <span>Revenue</span>
          <strong>{formatMoney(revenue())}</strong>
          <small>Paid orders in the last 30 days</small>
        </article>
        <article>
          <span>Orders placed</span>
          <strong>{orderCount()}</strong>
          <small>{activeDays()} of 30 days had an order</small>
        </article>
        <article>
          <span>Average order</span>
          <strong>{formatMoney(props.averageOrderCents)}</strong>
          <small>Across recent orders</small>
        </article>
        <article>
          <span>Returning customers</span>
          <strong>{props.returningCustomers}</strong>
          <small>Placed more than one order</small>
        </article>
      </section>

      <section class={styles.panel}>
        <header class={styles.panelHead}>
          <div>
            <h2>Revenue per day</h2>
            <p>Paid, processing, shipped and completed orders. Hover or tap a day for details.</p>
          </div>
          <Show when={bestDay()}>
            {day => (
              <p class={styles.bestDay}>
                Best day <strong>{formatMoney(day().revenueCents)}</strong>
                <span>{longDate.format(dayDate(day().date))}</span>
              </p>
            )}
          </Show>
        </header>

        <Show
          when={revenue() > 0 || orderCount() > 0}
          fallback={
            <div class={styles.empty}>
              <strong>No sales in the last 30 days</strong>
              <p>The chart fills in as soon as the first order is paid.</p>
            </div>
          }
        >
          <div class={styles.chart}>
            <div class={styles.yAxis} aria-hidden="true">
              <For each={ticks()}>
                {tick => <span style={{ bottom: `${(tick / top()) * 100}%` }}>{tickLabel(tick, top())}</span>}
              </For>
            </div>
            <div class={styles.plot}>
              <For each={ticks()}>
                {tick => <i class={styles.gridline} style={{ bottom: `${(tick / top()) * 100}%` }} aria-hidden="true" />}
              </For>
              <ol class={styles.columns} aria-label="Revenue per day, last 30 days">
                <For each={days()}>
                  {(day, index) => (
                    <li
                      tabindex="0"
                      classList={{
                        [styles.tipStart]: index() < 4,
                        [styles.tipEnd]: index() > WINDOW_DAYS - 5,
                      }}
                      aria-label={`${longDate.format(dayDate(day.date))}: ${formatMoney(day.revenueCents)} from ${day.orders} ${day.orders === 1 ? "order" : "orders"}`}
                    >
                      <span
                        class={styles.bar}
                        style={{ height: `${(day.revenueCents / top()) * 100}%` }}
                        data-zero={day.revenueCents === 0 ? "" : undefined}
                      />
                      <span class={styles.tip} aria-hidden="true">
                        <b>{longDate.format(dayDate(day.date))}</b>
                        <strong>{formatMoney(day.revenueCents)}</strong>
                        <small>{day.orders} {day.orders === 1 ? "order" : "orders"}</small>
                      </span>
                    </li>
                  )}
                </For>
              </ol>
            </div>
            <ol class={styles.xAxis} aria-hidden="true">
              <For each={days()}>
                {(day, index) => <li>{showDateLabel(index()) ? shortDate.format(dayDate(day.date)) : ""}</li>}
              </For>
            </ol>
          </div>

          <details class={styles.tableView}>
            <summary>Show as table</summary>
            <table>
              <thead>
                <tr><th scope="col">Day</th><th scope="col">Orders</th><th scope="col">Revenue</th></tr>
              </thead>
              <tbody>
                <For each={[...days()].reverse()}>
                  {day => (
                    <tr>
                      <th scope="row">{longDate.format(dayDate(day.date))}</th>
                      <td>{day.orders}</td>
                      <td>{formatMoney(day.revenueCents)}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </details>
        </Show>
      </section>

      <section class={styles.panel}>
        <header class={styles.panelHead}>
          <div>
            <h2>Best sellers</h2>
            <p>Ranked by revenue from paid orders in the last 30 days.</p>
          </div>
        </header>
        <Show
          when={bestSellers().length}
          fallback={
            <div class={styles.empty}>
              <strong>Nothing sold yet this month</strong>
              <p>Products appear here once their orders are paid.</p>
            </div>
          }
        >
          <table class={styles.sellers}>
            <thead>
              <tr><th scope="col">Product</th><th scope="col" class={styles.shareCol}><span class={styles.srOnly}>Share of top seller</span></th><th scope="col">Units</th><th scope="col">Revenue</th></tr>
            </thead>
            <tbody>
              <For each={bestSellers()}>
                {item => (
                  <tr>
                    <th scope="row">
                      <strong>{item.name}</strong>
                      <span>{item.sku}</span>
                    </th>
                    <td class={styles.shareCol} aria-hidden="true">
                      <i><b style={{ width: `${(item.revenueCents / bestSellerTop()) * 100}%` }} /></i>
                    </td>
                    <td>{item.units}</td>
                    <td>{formatMoney(item.revenueCents)}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </Show>
      </section>
    </div>
  );
}
