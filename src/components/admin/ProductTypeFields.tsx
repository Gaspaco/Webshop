import { For } from "solid-js";
import { PRODUCT_TYPES, productTypeConfig, variationFields, type ProductAttributes, type ProductType } from "~/lib/product-types";
import styles from "./ProductTypeFields.module.scss";

export function ProductTypeSelect(props: { value: string; onChange: (type: ProductType) => void }) {
  const groups = [...new Set(PRODUCT_TYPES.map(type => type.group))];
  return <label class={styles.category}><span>Product category</span><select value={props.value} onChange={event => props.onChange(event.currentTarget.value as ProductType)}>
    <For each={groups}>{group => <optgroup label={group}><For each={PRODUCT_TYPES.filter(type => type.group === group)}>{type => <option value={type.value}>{type.label}</option>}</For></optgroup>}</For>
  </select></label>;
}

export function ProductAttributeFields(props: { type: string; value: ProductAttributes; onChange: (attributes: ProductAttributes) => void; variant?: boolean }) {
  const fields = () => props.variant ? variationFields(props.type) : productTypeConfig(props.type)?.fields ?? [];
  return <For each={fields()}>{field => <label><span>{field.label}{props.variant ? " (variant)" : ""}</span>
    <input maxLength={160} value={props.value[field.key] ?? ""} onInput={event => props.onChange({ ...props.value, [field.key]: event.currentTarget.value })} />
  </label>}</For>;
}
