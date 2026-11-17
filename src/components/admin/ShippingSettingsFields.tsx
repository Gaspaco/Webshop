import { For, Index, Show, type JSX } from "solid-js";
import { type ShippingSettings } from "~/lib/product-shipping";
import styles from "./ShippingSettingsFields.module.scss";

type Dimension = "weightGrams" | "lengthCm" | "widthCm" | "heightCm";
type StoreRates = Partial<Record<"postnlSmallParcelCents" | "postnlParcelCents" | "postnlLargeParcelCents", number>>;

const DIMENSIONS: Dimension[] = ["weightGrams", "lengthCm", "widthCm", "heightCm"];
const DIMENSION_LABELS: Record<Dimension, string> = {
  weightGrams: "Weight (g)",
  lengthCm: "Length (cm)",
  widthCm: "Width (cm)",
  heightCm: "Height (cm)",
};
const dimensionInput = (key: Dimension) => ({
  min: key === "weightGrams" ? 1 : 0.01,
  max: key === "weightGrams" ? 100000 : 300,
  step: key === "weightGrams" ? 1 : 0.01,
});

const MEASURE_COLS = "repeat(4, minmax(4.25rem, 0.75fr))";
const REMOVE_COL = "2.25rem";

function RemoveButton(props: { label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" class={styles.remove} aria-label={props.label} title={props.disabled ? "At least one is required" : props.label} disabled={props.disabled} onClick={() => props.onClick()}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
      </svg>
    </button>
  );
}

function Section(props: { title: string; description: string; children: JSX.Element }) {
  return (
    <section class={styles.section}>
      <header>
        <h2>{props.title}</h2>
        <p>{props.description}</p>
      </header>
      <div>{props.children}</div>
    </section>
  );
}

function Cell(props: { label: string; children: JSX.Element }) {
  return (
    <label>
      <span class={styles.cellLabel}>{props.label}</span>
      {props.children}
    </label>
  );
}

export default function ShippingSettingsFields(props: {
  value: ShippingSettings;
  storeRates?: StoreRates;
  onChange: (value: ShippingSettings) => void;
}) {
  const change = <K extends keyof ShippingSettings>(key: K, value: ShippingSettings[K]) => props.onChange({ ...props.value, [key]: value });
  const uid = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  const updateAt = <K extends "classes" | "presets" | "parcelBands" | "singlesTiers" | "internationalBands">(
    key: K,
    index: number,
    patch: Partial<ShippingSettings[K][number]>,
  ) => change(key, props.value[key].map((entry, i) => (i === index ? { ...entry, ...patch } : entry)) as ShippingSettings[K]);
  const removeAt = <K extends "classes" | "presets" | "parcelBands" | "singlesTiers" | "internationalBands">(key: K, index: number) =>
    change(key, props.value[key].filter((_, i) => i !== index) as ShippingSettings[K]);
  const numberOrNull = (value: string) => (value === "" ? null : Number(value));
  const euros = (cents: number | null | undefined) => (typeof cents === "number" ? (cents / 100).toFixed(2) : "");

  return (
    <>
      <Section
        title="Packing"
        description="Added to every order before the parcel size is chosen. Measure your own boxes and mailers; these aren't carrier-verified figures."
      >
        <div class={styles.pair}>
          <label class={styles.field}>
            <span>Packaging weight</span>
            <div class={styles.unit}>
              <input required type="number" min="0" max="10000" step="1" value={props.value.packagingWeightGrams} onInput={event => change("packagingWeightGrams", Number(event.currentTarget.value))} />
              <b>g per order</b>
            </div>
          </label>
          <label class={styles.field}>
            <span>Padding on each side</span>
            <div class={styles.unit}>
              <input required type="number" min="0" max="30" step="0.1" value={props.value.paddingCm} onInput={event => change("paddingCm", Number(event.currentTarget.value))} />
              <b>cm</b>
            </div>
          </label>
        </div>
      </Section>

      <Section
        title="Singles weight"
        description="Singles are weighed by how many are in the order, pooled across every variant. Packaging is added on top."
      >
        <div class={styles.rows} style={{ "--cols": `minmax(0, 1fr) minmax(0, 1fr) ${REMOVE_COL}` }}>
          <div class={styles.rowHead} aria-hidden="true">
            <span>Up to this many cards</span>
            <span>Total weight (g)</span>
            <span />
          </div>
          <Index each={props.value.singlesTiers}>
            {(tier, index) => (
              <div class={styles.row}>
                <Cell label="Up to this many cards">
                  <input type="number" min="1" max="10000" step="1" placeholder="Any number" aria-label={`Tier ${index + 1}: up to this many cards`} value={tier().maxQuantity ?? ""} onInput={event => updateAt("singlesTiers", index, { maxQuantity: numberOrNull(event.currentTarget.value) })} />
                </Cell>
                <Cell label="Total weight (g)">
                  <input required type="number" min="1" max="100000" aria-label={`Tier ${index + 1}: total weight in grams`} value={tier().weightGrams} onInput={event => updateAt("singlesTiers", index, { weightGrams: Number(event.currentTarget.value) })} />
                </Cell>
                <RemoveButton label={`Remove tier ${index + 1}`} disabled={props.value.singlesTiers.length === 1} onClick={() => removeAt("singlesTiers", index)} />
              </div>
            )}
          </Index>
          <p class={styles.note}>Leave the last tier's card count empty so it covers any larger order.</p>
          <button
            type="button"
            class={styles.add}
            onClick={() => {
              const tiers = props.value.singlesTiers.map(row => ({ ...row }));
              const last = tiers.at(-1)!;
              if (last.maxQuantity === null) last.maxQuantity = (tiers.at(-2)?.maxQuantity ?? 10) + 10;
              change("singlesTiers", [...tiers, { maxQuantity: null, weightGrams: last.weightGrams }]);
            }}
          >
            + Add tier
          </button>
        </div>
      </Section>

      <Section
        title="Shipping classes"
        description="Fallback measurements for products that haven't been measured yet. The standard class covers older products and can't be removed."
      >
        <div class={styles.scroller}>
          <div class={styles.rows} style={{ "--cols": `minmax(13rem, 2fr) minmax(9.5rem, 1.15fr) ${MEASURE_COLS} ${REMOVE_COL}` }}>
            <div class={styles.rowHead} aria-hidden="true">
              <span>Class</span>
              <span>Weight is</span>
              <For each={DIMENSIONS}>{key => <span>{DIMENSION_LABELS[key]}</span>}</For>
              <span />
            </div>
            <Index each={props.value.classes}>
              {(row, index) => (
                <div class={styles.row}>
                  <Cell label="Class">
                    <input required maxlength="100" aria-label="Class name" value={row().name} onInput={event => updateAt("classes", index, { name: event.currentTarget.value })} />
                  </Cell>
                  <Cell label="Weight is">
                    <select aria-label={`How ${row().name} is weighed`} value={row().mode} onChange={event => updateAt("classes", index, { mode: event.currentTarget.value as "singles" | "per_item" })}>
                      <option value="per_item">Per item × quantity</option>
                      <option value="singles">From singles tiers</option>
                    </select>
                  </Cell>
                  <For each={DIMENSIONS}>
                    {key => (
                      <Cell label={DIMENSION_LABELS[key]}>
                        <input required type="number" {...dimensionInput(key)} aria-label={`${row().name}: ${DIMENSION_LABELS[key]}`} value={row()[key]} onInput={event => updateAt("classes", index, { [key]: Number(event.currentTarget.value) })} />
                      </Cell>
                    )}
                  </For>
                  <RemoveButton label={`Remove ${row().name}`} disabled={row().id === "standard"} onClick={() => removeAt("classes", index)} />
                </div>
              )}
            </Index>
          </div>
        </div>
        <button type="button" class={styles.add} onClick={() => change("classes", [...props.value.classes, { id: uid("class"), name: "New shipping class", mode: "per_item", weightGrams: 1000, lengthCm: 20, widthCm: 20, heightCm: 12 }])}>
          + Add class
        </button>
      </Section>

      <Section
        title="Product presets"
        description="One-click measurements for products you stock often. Leave a size empty until you have measured it. Editing a preset doesn't change products already measured; pick it again on the product to apply new values."
      >
        <div class={styles.scroller}>
          <div class={styles.rows} style={{ "--cols": `minmax(13rem, 2fr) minmax(9.5rem, 1.15fr) ${MEASURE_COLS} ${REMOVE_COL}` }}>
            <div class={styles.rowHead} aria-hidden="true">
              <span>Preset</span>
              <span>Class</span>
              <For each={DIMENSIONS}>{key => <span>{DIMENSION_LABELS[key]}</span>}</For>
              <span />
            </div>
            <Index each={props.value.presets}>
              {(row, index) => (
                <div class={styles.row}>
                  <Cell label="Preset">
                    <input required maxlength="100" aria-label="Preset name" value={row().name} onInput={event => updateAt("presets", index, { name: event.currentTarget.value })} />
                  </Cell>
                  <Cell label="Class">
                    <select aria-label={`${row().name}: shipping class`} value={row().classId} onChange={event => updateAt("presets", index, { classId: event.currentTarget.value })}>
                      <option value="auto">Automatic</option>
                      <For each={props.value.classes}>{cls => <option value={cls.id}>{cls.name}</option>}</For>
                    </select>
                  </Cell>
                  <For each={DIMENSIONS}>
                    {key => (
                      <Cell label={DIMENSION_LABELS[key]}>
                        <input type="number" {...dimensionInput(key)} aria-label={`${row().name}: ${DIMENSION_LABELS[key]}`} value={row()[key] ?? ""} onInput={event => updateAt("presets", index, { [key]: numberOrNull(event.currentTarget.value) })} />
                      </Cell>
                    )}
                  </For>
                  <RemoveButton label={`Remove ${row().name}`} onClick={() => removeAt("presets", index)} />
                </div>
              )}
            </Index>
          </div>
        </div>
        <button type="button" class={styles.add} onClick={() => { const id = uid("preset"); change("presets", [...props.value.presets, { id, name: "New preset", classId: "standard", presetId: id, weightGrams: null, lengthCm: null, widthCm: null, heightCm: null }]); }}>
          + Add preset
        </button>
      </Section>

      <Section
        title="Dutch parcel sizes"
        description="Checkout uses the first size the order fits into. Leave the price empty to use the matching PostNL rate above."
      >
        <div class={styles.scroller}>
          <div class={styles.rows} style={{ "--cols": `minmax(10rem, 1.5fr) minmax(7rem, 1fr) ${MEASURE_COLS} ${REMOVE_COL}` }}>
            <div class={styles.rowHead} aria-hidden="true">
              <span>Size</span>
              <span>Price (€)</span>
              <span>Max weight (g)</span>
              <span>Max length</span>
              <span>Max width</span>
              <span>Max height</span>
              <span />
            </div>
            <Index each={props.value.parcelBands}>
              {(row, index) => (
                <div class={styles.row}>
                  <Cell label="Size">
                    <input required aria-label="Parcel size name" value={row().name} onInput={event => updateAt("parcelBands", index, { name: event.currentTarget.value })} />
                  </Cell>
                  <Cell label="Price (€)">
                    <input
                      type="number"
                      min="0"
                      max="1000"
                      step="0.01"
                      aria-label={`${row().name}: custom price in euros`}
                      placeholder={euros(props.storeRates?.[row().priceKey as keyof StoreRates]) || "Store rate"}
                      value={row().priceCents === null ? "" : row().priceCents! / 100}
                      onInput={event => updateAt("parcelBands", index, { priceCents: event.currentTarget.value === "" ? null : Math.round(Number(event.currentTarget.value) * 100) })}
                    />
                  </Cell>
                  <For each={DIMENSIONS}>
                    {key => (
                      <Cell label={`Max ${DIMENSION_LABELS[key].toLowerCase()}`}>
                        <input required type="number" {...dimensionInput(key)} aria-label={`${row().name}: maximum ${DIMENSION_LABELS[key].toLowerCase()}`} value={row()[key]} onInput={event => updateAt("parcelBands", index, { [key]: Number(event.currentTarget.value) })} />
                      </Cell>
                    )}
                  </For>
                  <RemoveButton label={`Remove ${row().name}`} disabled={props.value.parcelBands.length === 1} onClick={() => removeAt("parcelBands", index)} />
                </div>
              )}
            </Index>
          </div>
        </div>
        <button type="button" class={styles.add} onClick={() => change("parcelBands", [...props.value.parcelBands, { id: uid("band"), name: "New size", weightGrams: 23000, lengthCm: 100, widthCm: 50, heightCm: 50, priceKey: "postnlParcelCents", priceCents: null }])}>
          + Add parcel size
        </button>
      </Section>

      <Section
        title="Carrier limits"
        description="The largest letterbox parcel and international parcel PostNL accepts. Orders over these limits move up a size or can't ship abroad."
      >
        <div class={styles.scroller}>
          <div class={styles.rows} style={{ "--cols": `minmax(10rem, 1.5fr) ${MEASURE_COLS}` }}>
            <div class={styles.rowHead} aria-hidden="true">
              <span>Limit</span>
              <For each={DIMENSIONS}>{key => <span>Max {DIMENSION_LABELS[key].toLowerCase()}</span>}</For>
            </div>
            <For each={["letterbox", "international"] as const}>
              {key => (
                <div class={styles.row}>
                  <span class={styles.rowName}>{key === "letterbox" ? "Letterbox parcel" : "International parcel"}</span>
                  <For each={DIMENSIONS}>
                    {dimension => (
                      <Cell label={`Max ${DIMENSION_LABELS[dimension].toLowerCase()}`}>
                        <input required type="number" {...dimensionInput(dimension)} aria-label={`${key === "letterbox" ? "Letterbox" : "International"}: maximum ${DIMENSION_LABELS[dimension].toLowerCase()}`} value={props.value[key][dimension]} onInput={event => change(key, { ...props.value[key], [dimension]: Number(event.currentTarget.value) })} />
                      </Cell>
                    )}
                  </For>
                </div>
              )}
            </For>
          </div>
        </div>
      </Section>

      <Section
        title="International surcharges"
        description="Optional extra charge by parcel weight, added to the country price. Once you add one, parcels heavier than the last weight can't ship abroad. These are your own rates, not live PostNL quotes."
      >
        <div class={styles.rows} style={{ "--cols": `minmax(0, 1fr) minmax(0, 1fr) ${REMOVE_COL}` }}>
          <Show when={props.value.internationalBands.length}>
            <div class={styles.rowHead} aria-hidden="true">
              <span>Up to weight (g)</span>
              <span>Surcharge (€)</span>
              <span />
            </div>
          </Show>
          <Index
            each={props.value.internationalBands}
            fallback={<p class={styles.emptyRows}>No surcharges. Every country pays its fixed price.</p>}
          >
            {(row, index) => (
              <div class={styles.row}>
                <Cell label="Up to weight (g)">
                  <input required type="number" min="1" max="100000" aria-label={`Surcharge ${index + 1}: up to weight in grams`} value={row().weightGrams} onInput={event => updateAt("internationalBands", index, { weightGrams: Number(event.currentTarget.value) })} />
                </Cell>
                <Cell label="Surcharge (€)">
                  <input required type="number" min="0" max="1000" step="0.01" aria-label={`Surcharge ${index + 1}: amount in euros`} value={row().surchargeCents / 100} onInput={event => updateAt("internationalBands", index, { surchargeCents: Math.round(Number(event.currentTarget.value) * 100) })} />
                </Cell>
                <RemoveButton label={`Remove surcharge ${index + 1}`} onClick={() => removeAt("internationalBands", index)} />
              </div>
            )}
          </Index>
          <button type="button" class={styles.add} onClick={() => change("internationalBands", [...props.value.internationalBands, { weightGrams: 23000, surchargeCents: 0 }])}>
            + Add surcharge
          </button>
        </div>
      </Section>
    </>
  );
}
