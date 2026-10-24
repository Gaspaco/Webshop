import { For, Show } from "solid-js";
import { type ProductShipping, type ShippingSettings } from "~/lib/product-shipping";
import styles from "./ShippingFields.module.scss";

export default function ProductShippingFields(props: { value: ProductShipping; settings: ShippingSettings; onChange: (value: ProductShipping) => void }) {
  const patch = (key: keyof ProductShipping, value: string | number | null) => props.onChange({ ...props.value, [key]: value });
  return <fieldset class={styles.fields}>
    <legend>Shipping data</legend>
    <p>Measurements are per product, before order packaging. Presets fill the fields once; you can override every value.</p>
    <div class={styles.grid}>
      <label><span>Shipping preset</span><select value={props.value.presetId} onChange={event => {
        const preset = props.settings.presets.find(row => row.id === event.currentTarget.value);
        if (preset) { const { id, name: _name, ...values } = preset; props.onChange({ ...values, presetId: id }); }
        else patch("presetId", "");
      }}>
        <option value="">Custom measurements</option>
        <Show when={props.value.presetId && !props.settings.presets.some(preset => preset.id === props.value.presetId)}><option value={props.value.presetId}>Saved preset (no longer listed)</option></Show>
        <For each={props.settings.presets}>{preset => <option value={preset.id}>{preset.name}</option>}</For>
      </select></label>
      <label><span>Shipping class</span><select value={props.value.classId} onChange={event => patch("classId", event.currentTarget.value)}>
        <option value="auto">Automatic for product type</option>
        <Show when={props.value.classId !== "auto" && !props.settings.classes.some(row => row.id === props.value.classId)}><option value={props.value.classId}>Removed class (standard fallback)</option></Show>
        <For each={props.settings.classes}>{row => <option value={row.id}>{row.name}</option>}</For>
      </select></label>
      <For each={[
        { key: "weightGrams", label: "Weight (grams)", min: 1, step: 1, max: 100000 },
        { key: "lengthCm", label: "Length (cm)", min: 0.01, step: 0.01, max: 300 },
        { key: "widthCm", label: "Width (cm)", min: 0.01, step: 0.01, max: 300 },
        { key: "heightCm", label: "Height (cm)", min: 0.01, step: 0.01, max: 300 },
      ] as const}>{field => <label><span>{field.label}</span><input type="number" min={field.min} max={field.max} step={field.step}
        placeholder="Class default" value={props.value[field.key] ?? ""} onInput={event => patch(field.key, event.currentTarget.value === "" ? null : Number(event.currentTarget.value))} /></label>}</For>
    </div>
    <p>Singles quantity classes use the order’s combined card count instead of per-card weight. Choose a per-item class for an individual weight override. Blank fields use configurable class estimates.</p>
  </fieldset>;
}
