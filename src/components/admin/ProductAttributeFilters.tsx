import { For } from "solid-js";
import SearchSelect from "~/components/forms/SearchSelect";
import { productTypeConfig, type ProductAttributes, type AttributeFilterProduct } from "~/lib/product-types";
export { matchesAttributeFilters } from "~/lib/product-types";
export default function ProductAttributeFilters(props: { type: string; products: AttributeFilterProduct[]; value: ProductAttributes; onChange: (value: ProductAttributes) => void; class?: string }) {
  const values = (key: string) => [...new Set(props.products.flatMap(product => [product.attributes?.[key], ...(product.variants ?? []).map(variant => variant.attributes?.[key])]).filter((text): text is string => !!text))].sort();
  return <For each={productTypeConfig(props.type)?.fields ?? []}>{field => <SearchSelect class={props.class} label={field.label}
    value={props.value[field.key] ?? ""} onChange={value => props.onChange({ ...props.value, [field.key]: value })}
    options={[{ value: "", label: "All" }, ...values(field.key).map(value => ({ value, label: value }))]} />}</For>;
}
