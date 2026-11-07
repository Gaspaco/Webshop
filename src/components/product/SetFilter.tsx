import { For } from "solid-js";
import { CATEGORIES } from "~/lib/categories";
import { setFilterOptions, type ProductSetSource } from "~/lib/product-sets";

export default function SetFilter(props: { products: ProductSetSource[]; game?: string; value: string; onChange: (value: string) => void; class?: string }) {
  return <label class={props.class}><span>Set / expansion</span><select aria-label="Set / expansion" value={props.value} onChange={event => props.onChange(event.currentTarget.value)}>
    <option value="">All sets</option>
    <For each={setFilterOptions(props.products, props.game)}>{set => <option value={set.value}>{set.name}{!props.game ? ` · ${CATEGORIES[set.game]?.name ?? set.game}` : ""}</option>}</For>
  </select></label>;
}
