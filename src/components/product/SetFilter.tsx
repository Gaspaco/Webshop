import SearchSelect from "~/components/forms/SearchSelect";
import { CATEGORIES } from "~/lib/categories";
import { setFilterOptions, type ProductSetSource } from "~/lib/product-sets";

export default function SetFilter(props: { products: ProductSetSource[]; game?: string; value: string; onChange: (value: string) => void; class?: string }) {
  return <SearchSelect label="Set / expansion" class={props.class} value={props.value} onChange={props.onChange}
    options={[{ value: "", label: "All sets" }, ...setFilterOptions(props.products, props.game).map(set => ({
      value: set.value, label: set.name,
      detail: [set.code, !props.game ? CATEGORIES[set.game]?.name ?? set.game : "", `${set.count} ${set.count === 1 ? "product" : "products"}`].filter(Boolean).join(" · "),
    }))]} />;
}
