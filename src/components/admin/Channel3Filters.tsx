import { createEffect, createSignal, on, onCleanup, Show } from "solid-js";
import SearchSelect from "~/components/forms/SearchSelect";
import { CHANNEL3_CATEGORIES, type Channel3Filters, type Channel3Option } from "~/lib/channel3";
import styles from "./RemoteCardLibrary.module.scss";

export default function Channel3Filters(props: { kind: string; disabled: boolean; onChange: (value: Channel3Filters) => void; onBusy: (value: boolean) => void }) {
  const [brandQuery, setBrandQuery] = createSignal("");
  const [categoryQuery, setCategoryQuery] = createSignal("");
  const [brands, setBrands] = createSignal<Channel3Option[]>([]);
  const [categories, setCategories] = createSignal<Channel3Option[]>([]);
  const [brandId, setBrandId] = createSignal("");
  const [categoryId, setCategoryId] = createSignal("");
  const [mode, setMode] = createSignal<"keyword" | "default">("keyword");
  const [country, setCountry] = createSignal<"all" | "NL">("all");
  const [busy, setBusy] = createSignal(false);
  const [message, setMessage] = createSignal("");
  let controller: AbortController | undefined;
  onCleanup(() => { controller?.abort(); props.onBusy(false); });
  createEffect(on(() => props.kind, () => {
    controller?.abort();
    setBrandId(""); setCategoryId(""); setBrands([]); setCategories([]); setMessage("");
    setBrandQuery(props.kind === "funko" ? "Funko" : "");
    setCategoryQuery(CHANNEL3_CATEGORIES[props.kind]?.query ?? "");
  }));
  createEffect(() => props.onChange({ ...(brandId() ? { brandId: brandId() } : {}), ...(categoryId() ? { categoryId: categoryId() } : {}), mode: mode(), country: country() }));
  createEffect(() => props.onBusy(busy()));
  const findOptions = async (event: Event, type: "brand" | "category") => {
    event.preventDefault();
    if (props.disabled || busy()) return;
    const q = (type === "brand" ? brandQuery() : categoryQuery()).trim();
    if (q.length < 2) { setMessage(`Enter a ${type} name first.`); return; }
    const request = new AbortController(); controller = request;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/reference/channel3?${new URLSearchParams({ action: "options", type, q })}`, { credentials: "same-origin", signal: request.signal });
      const result = await response.json() as { options?: Channel3Option[]; error?: string };
      if (request.signal.aborted || controller !== request) return;
      if (!response.ok) { setMessage(result.error ?? "Channel3 filters could not be loaded."); return; }
      const values = result.options ?? [];
      if (type === "brand") { setBrands(values); setBrandId(""); }
      else { setCategories(values); setCategoryId(""); }
      setMessage(values.length ? `Choose a ${type} from the matching options.` : `No ${type} matches. Try a different name, or use a product link.`);
    } catch {
      if (!request.signal.aborted) setMessage("Channel3 filters could not be loaded. Try again shortly.");
    } finally { if (controller === request) setBusy(false); }
  };
  return <fieldset class={styles.channelFilters} disabled={props.disabled || busy()}>
    <legend>Catalogue filters</legend>
    <p>Search uses a toy/card category automatically. Funko products also use the Funko brand. Find a specific brand or category to narrow it further.</p>
    <div class={styles.channelFilterGrid}>
      <div>
        <form class={styles.filterSearch} onSubmit={event => void findOptions(event, "brand")}>
          <label><span>Find a brand</span><input type="search" value={brandQuery()} onInput={event => setBrandQuery(event.currentTarget.value)} placeholder="Funko, Bandai, Takara Tomy" maxlength={100} /></label>
          <button type="submit">Find brands</button>
        </form>
        <Show when={brands().length}><SearchSelect label="Brand" value={brandId()} options={[{ value: "", label: "Automatic brand filter" }, ...brands().map(row => ({ value: row.id, label: row.label }))]} onChange={value => { if (!props.disabled && !busy()) setBrandId(value); }} /></Show>
      </div>
      <div>
        <form class={styles.filterSearch} onSubmit={event => void findOptions(event, "category")}>
          <label><span>Find a catalogue category</span><input type="search" value={categoryQuery()} onInput={event => setCategoryQuery(event.currentTarget.value)} placeholder="Action toy figures" maxlength={100} /></label>
          <button type="submit">Find categories</button>
        </form>
        <Show when={categories().length}><SearchSelect label="Catalogue category" value={categoryId()} options={[{ value: "", label: "Automatic toy/card category" }, ...categories().map(row => ({ value: row.id, label: row.label, detail: row.detail }))]} onChange={value => { if (!props.disabled && !busy()) setCategoryId(value); }} /></Show>
      </div>
      <label class={styles.libraryChoice}><span>Search matching</span><select value={mode()} onChange={event => setMode(event.currentTarget.value as "keyword" | "default")}><option value="keyword">Exact words</option><option value="default">Related matches</option></select></label>
      <label class={styles.libraryChoice}><span>Retailer coverage</span><select value={country()} onChange={event => setCountry(event.currentTarget.value as "all" | "NL")}><option value="all">All available markets (EUR)</option><option value="NL">Netherlands offers only</option></select></label>
    </div>
    <Show when={message()}><p role="status">{message()}</p></Show>
  </fieldset>;
}
