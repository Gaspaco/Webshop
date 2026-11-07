import { createSignal, For, Show } from "solid-js";
import RemoteCardLibrary from "./RemoteCardLibrary";
import { MERCHANDISE_KINDS } from "~/lib/reference-products";
import { CATEGORIES } from "~/lib/categories";
import styles from "./RemoteCardLibrary.module.scss";

export default function ReferenceLibraries(props: { provider: "onepiece" | "grandarchive" | "vanguard" | "channel3"; onImported: () => unknown; onBusyChange?: (busy: boolean) => void }) {
  const [family, setFamily] = createSignal("sets");
  const [kind, setKind] = createSignal("funko");
  const [game, setGame] = createSignal("other");
  const [rights, setRights] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const config = () => ({
    onepiece: { name: "One Piece", source: "OPTCG API", card: "Luffy, Roronoa Zoro, OP01-001", set: "Romance Dawn, OP-01", note: "USD market references are not converted into EUR prices. Review the selling price before publishing." },
    grandarchive: { name: "Grand Archive", source: "Grand Archive API", card: "Lorraine, Rai", set: "Dawn of Ashes First Edition, DOA 1st", note: "Each edition keeps its own artwork and foil variants. No market prices are supplied." },
    vanguard: { name: "Cardfight!! Vanguard", source: "PokéWallet", card: "Blaster Blade, DZ-BT15/001EN", set: "Strike of Illusionary Shadows, DZ-BT15", note: "Requires POKEWALLET_API_KEY. Images are downloaded only when importing, to conserve the shared request quota." },
    channel3: { name: "Collectibles and merchandise", source: "Channel3", card: MERCHANDISE_KINDS.find(row => row.value === kind())?.query ?? "Funko Pop", set: "", note: "Requires CHANNEL3_API_KEY. These are retailer references, not your own inventory. Imports start at €0 and zero stock. Check the exact item and media permissions." },
  }[props.provider]);
  const endpoint = () => `/api/admin/reference/${props.provider}?${new URLSearchParams({ family: family(), kind: kind(), game: game() })}`;
  return <div>
    <Show when={props.provider === "onepiece"}><label class={styles.libraryChoice}><span>One Piece collection</span><select value={family()} disabled={busy()} onChange={event => setFamily(event.currentTarget.value)}>
      <option value="sets">Booster sets</option><option value="decks">Starter decks</option><option value="promos">Promotional cards</option>
    </select></label></Show>
    <Show when={props.provider === "channel3"}>
      <div class={styles.sourceOptions}>
        <label class={styles.libraryChoice}><span>Product category</span><select value={kind()} disabled={busy()} onChange={event => { setKind(event.currentTarget.value); setRights(false); }}>
          <For each={MERCHANDISE_KINDS}>{kind => <option value={kind.value}>{kind.label}</option>}</For>
        </select></label>
        <Show when={kind() === "tcg"}><label class={styles.libraryChoice}><span>Game to assign</span><select value={game()} disabled={busy()} onChange={event => setGame(event.currentTarget.value)}>
          <option value="other">Other / review in editor</option><For each={Object.values(CATEGORIES)}>{game => <option value={game.slug}>{game.name}</option>}</For>
        </select></label></Show>
        <label class={styles.permissions}><input type="checkbox" checked={rights()} disabled={busy()} onChange={event => setRights(event.currentTarget.checked)} /><span>I sell these items and have permission to reuse the supplied product data and images.</span></label>
      </div>
    </Show>
    <RemoteCardLibrary title={`${config().name} library`} description="Search first, then select the items to add as private, zero-stock drafts. Existing imports are not overwritten."
      badge={config().source} endpoint={endpoint()} gameName={config().name} cardPlaceholder={config().card} setPlaceholder={config().set}
      artworkNote={config().note} productMode={props.provider === "channel3"} canImport={props.provider !== "channel3" || rights()} rightsConfirmed={rights()}
      onBusyChange={value => { setBusy(value); props.onBusyChange?.(value); }} onImported={props.onImported} />
  </div>;
}
