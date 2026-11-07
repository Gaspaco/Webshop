import { For } from "solid-js";
import { productTypeConfig, type ProductAttributes, type AttributeFilterProduct } from "~/lib/product-types";
export { matchesAttributeFilters } from "~/lib/product-types";
export default function ProductAttributeFilters(props: { type: string; products: AttributeFilterProduct[]; value: ProductAttributes; onChange: (value: ProductAttributes) => void; class?: string }) {
  const values = (key: string) => [...new Set(props.products.flatMap(product => [product.attributes?.[key], ...(product.variants ?? []).map(variant => variant.attributes?.[key])]).filter((text): text is string => !!text))].sort();
  return <For each={productTypeConfig(props.type)?.fields ?? []}>{field => <label class={props.class}>
    <span>{field.label}</span><select value={props.value[field.key] ?? ""} onChange={event => props.onChange({ ...props.value, [field.key]: event.currentTarget.value })}>
      <option value="">All</option><For each={values(field.key)}>{value => <option value={value}>{value}</option>}</For>
    </select>
  </label>}</For>;
}
