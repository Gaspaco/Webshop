import { createMemo, createSignal, createUniqueId, For, onCleanup, onMount, Show } from "solid-js";
import { Portal } from "solid-js/web";
import styles from "./SearchSelect.module.scss";
import { filterSelectOptions, nextSelectOption, type SearchOption } from "~/lib/select-options";

/** Searchable single-choice menu, independent of OS native popup colours. */
export default function SearchSelect(props: {
  label: string;
  value: string;
  options: SearchOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  class?: string;
}) {
  const id = createUniqueId();
  const [open, setOpen] = createSignal(false);
  const [query, setQuery] = createSignal("");
  const [active, setActive] = createSignal(-1);
  const [position, setPosition] = createSignal({ left: "0px", top: "0px", bottom: "auto", width: "0px", "max-height": "360px" });
  const selected = createMemo(() => props.options.find(option => option.value === props.value));
  const options = createMemo(() => filterSelectOptions(props.options, query()));
  let trigger!: HTMLButtonElement;
  let search: HTMLInputElement | undefined;
  let panel: HTMLDivElement | undefined;

  const place = () => {
    const rect = trigger.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const down = below >= 200 || below >= above;
    const width = Math.min(Math.max(rect.width, 280), window.innerWidth - 24);
    setPosition({ left: `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`,
      top: down ? `${rect.bottom + 6}px` : "auto", bottom: down ? "auto" : `${window.innerHeight - rect.top + 6}px`,
      width: `${width}px`, "max-height": `${Math.max(0, Math.min(360, down ? below : above))}px` });
  };
  const close = (restore = false) => { setOpen(false); if (restore) trigger.focus(); };
  const reveal = () => {
    setQuery(""); setActive(-1); place(); setOpen(true);
    queueMicrotask(() => { if (open()) search?.focus(); });
  };
  const choose = (option: SearchOption) => { props.onChange(option.value); close(true); };
  const move = (direction: number) => {
    const next = nextSelectOption(active(), options().length, direction);
    setActive(next);
    if (next >= 0) panel?.querySelector<HTMLElement>(`[data-index="${next}"]`)?.scrollIntoView({ block: "nearest" });
  };
  onMount(() => {
    const outside = (event: PointerEvent) => {
      if (!trigger.contains(event.target as Node) && !panel?.contains(event.target as Node)) close();
    };
    const reposition = (event: Event) => { if (open() && !panel?.contains(event.target as Node)) place(); };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    onCleanup(() => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    });
  });

  return <div class={`${styles.field} ${props.class ?? ""}`}>
    <span id={`${id}-label`} class={styles.label}>{props.label}</span>
    <button ref={trigger} type="button" class={styles.trigger} aria-labelledby={`${id}-label ${id}-value`}
      aria-haspopup="listbox" aria-expanded={open()} aria-controls={open() ? `${id}-list` : undefined}
      onClick={() => open() ? close() : reveal()}
      onKeyDown={event => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); reveal(); move(event.key === "ArrowDown" ? 1 : -1); } }}>
      <span id={`${id}-value`}>{selected()?.label ?? props.placeholder ?? "Choose an option"}</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    <Show when={open()}><Portal>
      <div ref={panel} class={styles.panel} style={position()} onFocusOut={event => {
        const target = event.relatedTarget as Node | null;
        if (target && !panel?.contains(target) && !trigger.contains(target)) close();
      }}>
        <input ref={search} class={styles.search} type="search" autocomplete="off" role="combobox" aria-label={`Search ${props.label.toLowerCase()}`}
          aria-expanded="true" aria-autocomplete="list" aria-controls={`${id}-list`}
          aria-activedescendant={active() >= 0 ? `${id}-option-${active()}` : undefined}
          placeholder={`Search ${props.label.toLowerCase()}…`} value={query()}
          onInput={event => { setQuery(event.currentTarget.value); setActive(-1); }}
          onKeyDown={event => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); move(event.key === "ArrowDown" ? 1 : -1); }
            else if (event.key === "Enter") { event.preventDefault(); const option = options()[active()] ?? (options().length === 1 ? options()[0] : undefined); if (option) choose(option); }
            else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); }
            else if (event.key === "Tab") close(true);
          }} />
        <div id={`${id}-list`} class={styles.list} role="listbox" aria-labelledby={`${id}-label`}>
          <For each={options()}>{(option, index) => <button type="button" role="option" tabindex={-1}
            id={`${id}-option-${index()}`} data-index={index()} aria-selected={option.value === props.value}
            class={styles.option} classList={{ [styles.active]: active() === index(), [styles.available]: option.available === true, [styles.unavailable]: option.available === false }}
            onPointerMove={() => setActive(index())} onMouseDown={event => event.preventDefault()} onClick={() => choose(option)}>
            <span><span>{option.label}</span><Show when={option.detail}><small>{option.detail}</small></Show></span>
            <Show when={option.value === props.value}><span class={styles.check} aria-hidden="true">✓</span></Show>
          </button>}</For>
        </div>
        <Show when={!options().length}><p class={styles.empty} role="status">No matching options. Try another name or code.</p></Show>
      </div>
    </Portal></Show>
  </div>;
}
