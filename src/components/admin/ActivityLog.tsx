import { createMemo, createSignal, For, Show } from "solid-js";
import styles from "./ActivityLog.module.scss";

export type AuditEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  ipAddress: string | null;
  createdAt: string;
  actorName: string | null;
  actorEmail: string | null;
};

// Same stroke icons as the sidebar, so a catalogue change wears the catalogue icon.
const AREAS: Record<string, { label: string; icon: string }> = {
  product: { label: "Catalogue", icon: "M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM9 8h6M9 12h6M9 16h3" },
  order: { label: "Orders", icon: "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4ZM3 6h18M16 10a4 4 0 0 1-8 0" },
  customer: { label: "Customers", icon: "M16 20a4 4 0 0 0-8 0M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM20 19a3 3 0 0 0-3-3M17 6a3 3 0 0 1 0 6" },
  contact_message: { label: "Messages", icon: "M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12Z" },
  discount: { label: "Discounts", icon: "M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8ZM7.5 7.5h.01" },
  content: { label: "Storefront", icon: "M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9h18M9 20v-6h6v6" },
  readiness: { label: "Launch readiness", icon: "M12 3 5.5 5.7v5.6c0 4.1 2.6 7.8 6.5 9.7 3.9-1.9 6.5-5.6 6.5-9.7V5.7ZM9.2 12.1l1.8 1.8 3.9-4" },
  import: { label: "Imports", icon: "M12 3v12M7 10l5 5 5-5M5 21h14" },
};
const FALLBACK_AREA = { label: "Settings", icon: "M12 8v4l2.5 2.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" };

const area = (entityType: string) =>
  AREAS[entityType] ?? { ...FALLBACK_AREA, label: entityType ? entityType.replace(/[_-]+/g, " ").replace(/^\w/, letter => letter.toUpperCase()) : FALLBACK_AREA.label };

const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const day = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });
const dayWithYear = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const fullStamp = new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeStyle: "medium" });

const localDayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

function dayLabel(date: Date) {
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (localDayKey(date) === localDayKey(today)) return "Today";
  if (localDayKey(date) === localDayKey(yesterday)) return "Yesterday";
  return date.getFullYear() === today.getFullYear() ? day.format(date) : dayWithYear.format(date);
}

export default function ActivityLog(props: { entries: AuditEntry[] }) {
  const [filter, setFilter] = createSignal("all");

  const areas = createMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of props.entries) counts.set(entry.entityType, (counts.get(entry.entityType) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  });

  const groups = createMemo(() => {
    const visible = props.entries.filter(entry => filter() === "all" || entry.entityType === filter());
    const byDay: Array<{ key: string; label: string; entries: AuditEntry[] }> = [];
    for (const entry of visible) {
      const date = new Date(entry.createdAt);
      const key = localDayKey(date);
      const last = byDay.at(-1);
      if (last?.key === key) last.entries.push(entry);
      else byDay.push({ key, label: dayLabel(date), entries: [entry] });
    }
    return byDay;
  });

  return (
    <div class={styles.activity}>
      <Show when={areas().length > 1}>
        <div class={styles.filters} role="group" aria-label="Filter activity by area">
          <button type="button" aria-pressed={filter() === "all"} onClick={() => setFilter("all")}>
            All <span>{props.entries.length}</span>
          </button>
          <For each={areas()}>
            {([type, count]) => (
              <button type="button" aria-pressed={filter() === type} onClick={() => setFilter(type)}>
                {area(type).label} <span>{count}</span>
              </button>
            )}
          </For>
        </div>
      </Show>

      <Show
        when={groups().length}
        fallback={
          <div class={styles.empty}>
            <strong>No activity yet</strong>
            <p>Price changes, shipped orders, refunds and settings updates are recorded here as they happen.</p>
          </div>
        }
      >
        <For each={groups()}>
          {group => (
            <section class={styles.day} aria-label={group.label}>
              <h2>
                {group.label}
                <span>{group.entries.length} {group.entries.length === 1 ? "change" : "changes"}</span>
              </h2>
              <ol>
                <For each={group.entries}>
                  {entry => (
                    <li>
                      <span class={styles.icon} data-area={entry.entityType} aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                          <path d={area(entry.entityType).icon} />
                        </svg>
                      </span>
                      <div>
                        <strong>{entry.summary}</strong>
                        <p>
                          <span>{entry.actorName ?? entry.actorEmail ?? "System"}</span>
                          <span>{area(entry.entityType).label}</span>
                          <Show when={entry.ipAddress}>{ip => <span title="IP address the change came from">{ip()}</span>}</Show>
                        </p>
                      </div>
                      <time datetime={entry.createdAt} title={fullStamp.format(new Date(entry.createdAt))}>
                        {time.format(new Date(entry.createdAt))}
                      </time>
                    </li>
                  )}
                </For>
              </ol>
            </section>
          )}
        </For>
      </Show>
    </div>
  );
}
