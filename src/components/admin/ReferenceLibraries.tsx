import { createSignal, For, Show } from "solid-js";
import RemoteCardLibrary from "./RemoteCardLibrary";
import Channel3Filters from "./Channel3Filters";
import type { Channel3Filters as Channel3FilterValues } from "~/lib/channel3";
import { MERCHANDISE_KINDS } from "~/lib/reference-products";
import { CATEGORIES } from "~/lib/categories";
import styles from "./RemoteCardLibrary.module.scss";

export default function ReferenceLibraries(props: { provider: "onepiece" | "grandarchive" | "vanguard" | "channel3"; onImported: () => unknown; onBusyChange?: (busy: boolean) => void }) {
  const [family, setFamily] = createSignal("sets");
  const [kind, setKind] = createSignal("funko");
  const [game, setGame] = createSignal("other");
  const [rights, setRights] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [filtersBusy, setFiltersBusy] = createSignal(false);
  const [filters, setFilters] = createSignal<Channel3FilterValues>({ mode: "keyword", country: "all" });
  const config = () => ({
    onepiece: { name: "One Piece", source: "OPTCG API", card: "Luffy, Roronoa Zoro, OP01-001", set: "Romance Dawn, OP-01", note: "USD market references are not converted into EUR prices. Review the selling price before publishing." },
    grandarchive: { name: "Grand Archive", source: "Grand Archive API", card: "Lorraine, Rai", set: "Dawn of Ashes First Edition, DOA 1st", note: "Each edition keeps its own artwork and foil variants. No market prices are supplied." },
    vanguard: { name: "Cardfight!! Vanguard", source: "PokéWallet", card: "Blaster Blade, DZ-BT15/001EN", set: "Strike of Illusionary Shadows, DZ-BT15", note: "Requires POKEWALLET_API_KEY. Images are downloaded only when importing, to conserve the shared request quota." },
    channel3: { name: "Collectibles and merchandise", source: "Channel3", card: MERCHANDISE_KINDS.find(row => row.value === kind())?.query ?? "Funko Pop", set: "", note: "Retailer references, not your own inventory. Imports start at €0 and zero stock. Check the exact item and media permissions. Search coverage varies; a product link can help when search finds nothing." },
  }[props.provider]);
  const endpoint = () => `/api/admin/reference/${props.provider}?${new URLSearchParams({ family: family(), kind: kind(), game: game(), ...(props.provider === "channel3" ? filters() : {}) })}`;
  return <div>
    <Show when={props.provider === "onepiece"}><label class={styles.libraryChoice}><span>One Piece collection</span><select value={family()} disabled={busy()} onChange={event => setFamily(event.currentTarget.value)}>
      <option value="sets">Booster sets</option><option value="decks">Starter decks</option><option value="promos">Promotional cards</option>
    </select></label></Show>
    <Show when={props.provider === "channel3"}>
      <div class={styles.sourceOptions}>
        <label class={styles.libraryChoice}><span>Product type to import</span><select value={kind()} disabled={busy() || filtersBusy()} onChange={event => { setKind(event.currentTarget.value); setRights(false); }}>
          <For each={MERCHANDISE_KINDS}>{kind => <option value={kind.value}>{kind.label}</option>}</For>
        </select></label>
        <Show when={kind() === "tcg"}><label class={styles.libraryChoice}><span>Game to assign</span><select value={game()} disabled={busy()} onChange={event => setGame(event.currentTarget.value)}>
          <option value="other">Other / review in editor</option><For each={Object.values(CATEGORIES)}>{game => <option value={game.slug}>{game.name}</option>}</For>
        </select></label></Show>
        <label class={styles.permissions}><input type="checkbox" checked={rights()} disabled={busy()} onChange={event => setRights(event.currentTarget.checked)} /><span>I sell these items and have permission to reuse the supplied product data and images.</span></label>
      </div>
      <Channel3Filters kind={kind()} disabled={busy()} onChange={setFilters} onBusy={value => { setFiltersBusy(value); props.onBusyChange?.(busy() || value); }} />
    </Show>
    <RemoteCardLibrary title={`${config().name} library`} description="Search first, then select the items to add as private, zero-stock drafts. Existing imports are not overwritten."
      badge={config().source} endpoint={endpoint()} gameName={config().name} cardPlaceholder={config().card} setPlaceholder={config().set}
      artworkNote={config().note} productMode={props.provider === "channel3"} canImport={props.provider !== "channel3" || rights()} rightsConfirmed={rights()}
      disabled={props.provider === "channel3" && filtersBusy()}
      onBusyChange={value => { setBusy(value); props.onBusyChange?.(value || filtersBusy()); }} onImported={props.onImported} />
  </div>;
}
