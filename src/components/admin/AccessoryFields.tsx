import { createUniqueId, For } from "solid-js";
import { ACCESSORY_BRANDS, ACCESSORY_CATEGORIES, type AccessoryCategory } from "~/lib/accessories";

export default function AccessoryFields(props: {
  category: AccessoryCategory; brand: string;
  onCategory: (value: AccessoryCategory) => void; onBrand: (value: string) => void;
}) {
  const brandsId = createUniqueId();
  return <>
    <label>
      <span>Accessory category</span>
      <select value={props.category} onChange={event => props.onCategory(event.currentTarget.value as AccessoryCategory)}>
        <For each={ACCESSORY_CATEGORIES}>{category => <option value={category.slug}>{category.name}</option>}</For>
      </select>
    </label>
    <label>
      <span>Brand</span>
      <input required list={brandsId} placeholder="Choose or enter a brand" value={props.brand} onInput={event => props.onBrand(event.currentTarget.value)} />
      <datalist id={brandsId}><For each={ACCESSORY_BRANDS}>{brand => <option value={brand} />}</For></datalist>
      <small>Dragon Shield, Ultra PRO, or another manufacturer.</small>
    </label>
  </>;
}
