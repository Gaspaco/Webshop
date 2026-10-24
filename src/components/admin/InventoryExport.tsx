import { createSignal, For, Show } from "solid-js";
import { INVENTORY_EXPORT_SCOPES, inventoryExportFilename, inventoryExportUrl, type InventoryExportScope } from "~/lib/inventory-export";
import styles from "./InventoryExport.module.scss";

export default function InventoryExport() {
  const [scope, setScope] = createSignal<InventoryExportScope>("all");
  const [images, setImages] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [message, setMessage] = createSignal("");
  const options = () => ({ scope: scope(), images: images() });
  const isSetScope = () => scope() === "sets" || scope() === "singles-and-sets";

  async function download(event: SubmitEvent) {
    event.preventDefault();
    if (busy()) return;
    const selected = options();
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(inventoryExportUrl(selected), { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "The CSV could not be exported. Please try again.");
      }
      if (!response.headers.get("content-type")?.startsWith("text/csv")) {
        throw new Error("The server did not return a CSV. Please sign in again and retry.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = inventoryExportFilename(selected);
      document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setMessage("Your CSV is ready. Check your browser’s downloads.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "The CSV could not be exported. Please try again.");
    } finally { setBusy(false); }
  }

  return (
    <form class={styles.panel} onSubmit={download} aria-busy={busy()}>
      <div class={styles.heading}>
        <h3>Export inventory</h3>
        <p>Export the full catalogue, with one row per variant. Drafts and archived products are included.</p>
      </div>
      <div class={styles.controls}>
        <label class={styles.scope}>
          <span>Products to include</span>
          <select value={scope()} disabled={busy()} onChange={event => { setScope(event.currentTarget.value as InventoryExportScope); setMessage(""); }}>
            <For each={INVENTORY_EXPORT_SCOPES}>{option => <option value={option.value}>{option.label}</option>}</For>
          </select>
        </label>
        <label class={styles.images}>
          <input type="checkbox" checked={images()} disabled={busy()} onChange={event => { setImages(event.currentTarget.checked); setMessage(""); }} />
          <span><strong>Export images</strong><small>Include product and variant URLs, or embedded image data. Files may be large.</small></span>
        </label>
        <button type="submit" disabled={busy()}>{busy() ? "Preparing CSV…" : "Download CSV"}</button>
      </div>
      <Show when={isSetScope()}><p class={styles.note}>Sets means complete set products, explicitly typed or categorized as sets—not cards that simply belong to an expansion. Sealed products are excluded.</p></Show>
      <p class={styles.note}>Dashboard search, page, and filters do not limit this export.</p>
      <Show when={error()}><p class={styles.error} role="alert">{error()}</p></Show>
      <p class={styles.message} role="status">{message()}</p>
    </form>
  );
}
