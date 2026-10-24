import { For, Index } from "solid-js";
import { type ShippingSettings } from "~/lib/product-shipping";
import styles from "./ShippingFields.module.scss";

export default function ShippingSettingsFields(props: { value: ShippingSettings; onChange: (value: ShippingSettings) => void }) {
  const change = <K extends keyof ShippingSettings>(key: K, value: ShippingSettings[K]) => props.onChange({ ...props.value, [key]: value });
  const uid = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  return <section class={styles.settings}>
    <h3>Product shipping presets and rules</h3>
    <p>Save using “Save store setup” below. Preset figures are estimates, not verified carrier measurements. Measure your own stock and packaging. Dimensions are stacked conservatively; this is not a box-packing optimiser.</p>
    <div class={styles.grid}>
      <label><span>Packaging weight (grams per order)</span><input required type="number" min="0" max="10000" step="1" value={props.value.packagingWeightGrams} onInput={event => change("packagingWeightGrams", Number(event.currentTarget.value))} /></label>
      <label><span>Total padding added to each dimension (cm)</span><input required type="number" min="0" max="30" step="0.1" value={props.value.paddingCm} onInput={event => change("paddingCm", Number(event.currentTarget.value))} /></label>
    </div>
    <h4>Singles: total quantity → product weight</h4>
    <p>Counts are pooled across all variants in the same singles class. Packaging weight is added afterwards.</p>
    <Index each={props.value.singlesTiers}>{(tier, index) => <div class={styles.rule}>
      <label><span>Up to this many cards (blank = no limit)</span><input type="number" min="1" max="10000" step="1" value={tier().maxQuantity ?? ""} placeholder="No limit" onInput={event => change("singlesTiers", props.value.singlesTiers.map((row, i) => i === index ? { ...row, maxQuantity: event.currentTarget.value === "" ? null : Number(event.currentTarget.value) } : row))} /></label>
      <label><span>Total weight (grams)</span><input required type="number" min="1" max="100000" value={tier().weightGrams} onInput={event => change("singlesTiers", props.value.singlesTiers.map((row, i) => i === index ? { ...row, weightGrams: Number(event.currentTarget.value) } : row))} /></label>
      <button type="button" disabled={props.value.singlesTiers.length === 1} onClick={() => change("singlesTiers", props.value.singlesTiers.filter((_, i) => i !== index))}>Remove rule</button>
    </div>}</Index>
    <button type="button" onClick={() => { const tiers = props.value.singlesTiers.map(row => ({ ...row })); const last = tiers.at(-1)!; if (last.maxQuantity === null) last.maxQuantity = (tiers.at(-2)?.maxQuantity ?? 10) + 10; change("singlesTiers", [...tiers, { maxQuantity: null, weightGrams: last.weightGrams }]); }}>Add singles tier</button>
    <h4>Shipping classes</h4>
    <p>Fallback measurements apply to products without their own values. Keep the standard class for older products.</p>
    <Index each={props.value.classes}>{(row, index) => <div class={styles.record}>
      <div class={styles.grid}>
        <label><span>Class name</span><input required maxlength="100" value={row().name} onInput={event => change("classes", props.value.classes.map((entry, i) => i === index ? { ...entry, name: event.currentTarget.value } : entry))} /></label>
        <label><span>Weight calculation</span><select value={row().mode} onChange={event => change("classes", props.value.classes.map((entry, i) => i === index ? { ...entry, mode: event.currentTarget.value as "singles" | "per_item" } : entry))}><option value="per_item">Weight × quantity</option><option value="singles">Combined singles quantity</option></select></label>
        <For each={["weightGrams", "lengthCm", "widthCm", "heightCm"] as const}>{key => <label><span>{measurementLabel(key)}</span><input required type="number" min={key === "weightGrams" ? 1 : 0.01} max={key === "weightGrams" ? 100000 : 300} step={key === "weightGrams" ? 1 : 0.01} value={row()[key]} onInput={event => change("classes", props.value.classes.map((entry, i) => i === index ? { ...entry, [key]: Number(event.currentTarget.value) } : entry))} /></label>}</For>
      </div>
      <button type="button" disabled={row().id === "standard"} onClick={() => change("classes", props.value.classes.filter((_, i) => i !== index))}>Remove class</button>
    </div>}</Index>
    <button type="button" onClick={() => change("classes", [...props.value.classes, { id: uid("class"), name: "New shipping class", mode: "per_item", weightGrams: 1000, lengthCm: 20, widthCm: 20, heightCm: 12 }])}>Add shipping class</button>
    <h4>Product presets</h4>
    <p>Editing a preset does not silently change products already measured. Select it again on a product to apply updated values.</p>
    <Index each={props.value.presets}>{(row, index) => <div class={styles.record}>
      <div class={styles.grid}>
        <label><span>Preset name</span><input required maxlength="100" value={row().name} onInput={event => change("presets", props.value.presets.map((entry, i) => i === index ? { ...entry, name: event.currentTarget.value } : entry))} /></label>
        <label><span>Shipping class</span><select value={row().classId} onChange={event => change("presets", props.value.presets.map((entry, i) => i === index ? { ...entry, classId: event.currentTarget.value } : entry))}><option value="auto">Automatic</option><For each={props.value.classes}>{cls => <option value={cls.id}>{cls.name}</option>}</For></select></label>
        <For each={["weightGrams", "lengthCm", "widthCm", "heightCm"] as const}>{key => <label><span>{measurementLabel(key)}</span><input type="number" min={key === "weightGrams" ? 1 : 0.01} max={key === "weightGrams" ? 100000 : 300} step={key === "weightGrams" ? 1 : 0.01} placeholder="Measure first" value={row()[key] ?? ""} onInput={event => change("presets", props.value.presets.map((entry, i) => i === index ? { ...entry, [key]: event.currentTarget.value === "" ? null : Number(event.currentTarget.value) } : entry))} /></label>}</For>
      </div>
      <button type="button" onClick={() => change("presets", props.value.presets.filter((_, i) => i !== index))}>Remove preset</button>
    </div>}</Index>
    <button type="button" onClick={() => { const id = uid("preset"); change("presets", [...props.value.presets, { id, name: "New preset", classId: "standard", presetId: id, weightGrams: null, lengthCm: null, widthCm: null, heightCm: null }]); }}>Add preset</button>
    <h4>Parcel pricing bands</h4>
    <p>The first band that fits supplies the Dutch parcel price. Blank custom prices use the corresponding store rate above.</p>
    <Index each={props.value.parcelBands}>{(row, index) => <div class={styles.record}><div class={styles.grid}>
      <label><span>Band name</span><input required value={row().name} onInput={event => change("parcelBands", props.value.parcelBands.map((entry, i) => i === index ? { ...entry, name: event.currentTarget.value } : entry))} /></label>
      <label><span>Custom price (EUR, optional)</span><input type="number" min="0" max="1000" step="0.01" value={row().priceCents === null ? "" : row().priceCents! / 100} onInput={event => change("parcelBands", props.value.parcelBands.map((entry, i) => i === index ? { ...entry, priceCents: event.currentTarget.value === "" ? null : Math.round(Number(event.currentTarget.value) * 100) } : entry))} /></label>
      <For each={["weightGrams", "lengthCm", "widthCm", "heightCm"] as const}>{key => <label><span>Maximum {measurementLabel(key).toLowerCase()}</span><input required type="number" min={key === "weightGrams" ? 1 : 0.01} max={key === "weightGrams" ? 100000 : 300} step={key === "weightGrams" ? 1 : 0.01} value={row()[key]} onInput={event => change("parcelBands", props.value.parcelBands.map((entry, i) => i === index ? { ...entry, [key]: Number(event.currentTarget.value) } : entry))} /></label>}</For>
    </div><button type="button" disabled={props.value.parcelBands.length === 1} onClick={() => change("parcelBands", props.value.parcelBands.filter((_, i) => i !== index))}>Remove band</button></div>}</Index>
    <button type="button" onClick={() => change("parcelBands", [...props.value.parcelBands, { id: uid("band"), name: "New band", weightGrams: 23000, lengthCm: 100, widthCm: 50, heightCm: 50, priceKey: "postnlParcelCents", priceCents: null }])}>Add parcel band</button>
    <For each={["letterbox", "international"] as const}>{key => <div class={styles.record}><h4>{key === "letterbox" ? "Letterbox limits" : "International parcel limits"}</h4><div class={styles.grid}>
      <For each={["weightGrams", "lengthCm", "widthCm", "heightCm"] as const}>{dimension => <label><span>Maximum {measurementLabel(dimension).toLowerCase()}</span><input required type="number" min={dimension === "weightGrams" ? 1 : 0.01} max={dimension === "weightGrams" ? 100000 : 300} step={dimension === "weightGrams" ? 1 : 0.01} value={props.value[key][dimension]} onInput={event => change(key, { ...props.value[key], [dimension]: Number(event.currentTarget.value) })} /></label>}</For>
    </div></div>}</For>
    <h4>International weight surcharges (optional)</h4><p>Added to the country price above. With no bands, international prices remain fixed. These are merchant-configured rates, not live PostNL quotes.</p>
    <Index each={props.value.internationalBands}>{(row, index) => <div class={styles.rule}>
      <label><span>Maximum weight (g)</span><input required type="number" min="1" max="100000" value={row().weightGrams} onInput={event => change("internationalBands", props.value.internationalBands.map((entry, i) => i === index ? { ...entry, weightGrams: Number(event.currentTarget.value) } : entry))} /></label>
      <label><span>Surcharge (EUR)</span><input required type="number" min="0" max="1000" step="0.01" value={row().surchargeCents / 100} onInput={event => change("internationalBands", props.value.internationalBands.map((entry, i) => i === index ? { ...entry, surchargeCents: Math.round(Number(event.currentTarget.value) * 100) } : entry))} /></label>
      <button type="button" onClick={() => change("internationalBands", props.value.internationalBands.filter((_, i) => i !== index))}>Remove</button>
    </div>}</Index>
    <button type="button" onClick={() => change("internationalBands", [...props.value.internationalBands, { weightGrams: 23000, surchargeCents: 0 }])}>Add international band</button>
  </section>;
}
function measurementLabel(key: string) { return ({ weightGrams: "Weight (grams)", lengthCm: "Length (cm)", widthCm: "Width (cm)", heightCm: "Height (cm)" })[key] ?? key; }
