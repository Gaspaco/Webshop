import { createEffect, createMemo, createSignal, createUniqueId, For, onCleanup, onMount, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { countryFlag, filterCountries, matchCountry, type AddressCountry } from "~/lib/countries";
import styles from "./CountrySelect.module.scss";

export default function CountrySelect(props: { value: string; onChange: (value: string) => void }) {
  const id = createUniqueId();
  const [open, setOpen] = createSignal(false);
  const [query, setQuery] = createSignal("");
  const [active, setActive] = createSignal(-1);
  const [position, setPosition] = createSignal({ left: "0px", top: "0px", bottom: "auto", width: "0px", "max-height": "288px" });
  const countries = createMemo(() => filterCountries(query()));
  const selected = createMemo(() => matchCountry(props.value));
  let input!: HTMLInputElement;
  let control!: HTMLDivElement;
  let list: HTMLDivElement | undefined;

  const placeList = () => {
    const rect = control.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const showBelow = below >= 180 || below >= above;
    const height = Math.max(0, Math.min(288, showBelow ? below : above));
    setPosition({
      left: `${Math.max(12, Math.min(rect.left, window.innerWidth - rect.width - 12))}px`,
      top: showBelow ? `${rect.bottom + 6}px` : "auto",
      bottom: showBelow ? "auto" : `${window.innerHeight - rect.top + 6}px`,
      width: `${Math.min(rect.width, window.innerWidth - 24)}px`,
      "max-height": `${height}px`,
    });
  };
  const showList = () => { placeList(); setOpen(true); };
  const choose = (country: AddressCountry) => {
    props.onChange(country.name);
    setQuery(""); setActive(-1); setOpen(false);
    input.setCustomValidity("");
    input.focus();
    // Focus can reopen the list when an option was tapped on a touch screen.
    setOpen(false);
  };
  const move = (direction: number) => {
    showList();
    const count = countries().length;
    if (!count) return;
    const next = active() < 0 ? (direction > 0 ? 0 : count - 1) : (active() + direction + count) % count;
    setActive(next);
    list?.querySelector<HTMLElement>(`[data-index="${next}"]`)?.scrollIntoView({ block: "nearest" });
  };
  createEffect(() => {
    input.setCustomValidity(props.value && !selected() ? "Choose a country from the list." : "");
  });
  onMount(() => {
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!control.contains(target) && !list?.contains(target)) setOpen(false);
    };
    const reposition = () => { if (open()) placeList(); };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    onCleanup(() => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    });
  });

  return <div class={styles.field}>
    <label for={`${id}-input`}>Country</label>
    <div class={styles.control} ref={control}>
      <Show when={selected()}>{country => <span class={styles.flag} aria-hidden="true">{countryFlag(country().code)}</span>}</Show>
      <input
        ref={input} id={`${id}-input`} classList={{ [styles.withFlag]: !!selected() }}
        role="combobox" aria-autocomplete="list" aria-expanded={open()}
        aria-controls={open() ? `${id}-list` : undefined}
        aria-activedescendant={open() && active() >= 0 ? `${id}-option-${active()}` : undefined}
        type="text" name="country" autocomplete="country-name" required maxlength={80}
        placeholder="Search countries" value={props.value}
        onFocus={() => { setQuery(""); setActive(-1); showList(); }}
        onClick={() => { if (!open()) showList(); }}
        onInput={event => {
          const value = event.currentTarget.value;
          props.onChange(value); setQuery(value); setActive(-1); showList();
        }}
        onBlur={event => {
          if (list?.contains(event.relatedTarget as Node | null)) return;
          setOpen(false); setActive(-1);
          const country = selected();
          if (country) props.onChange(country.name);
        }}
        onKeyDown={event => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault(); move(event.key === "ArrowDown" ? 1 : -1);
          } else if (event.key === "Enter" && open()) {
            event.preventDefault();
            const country = countries()[active()] ?? matchCountry(props.value);
            if (country) choose(country);
          } else if (event.key === "Escape" && open()) {
            event.preventDefault(); event.stopPropagation(); setOpen(false); setActive(-1);
          } else if (event.key === "Tab") {
            setOpen(false); setActive(-1);
          }
        }}
      />
      <svg class={styles.chevron} aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m6 9 6 6 6-6" /></svg>
    </div>
    <Show when={open()}>
      <Portal>
        <div ref={list} id={`${id}-list`} class={styles.list} style={position()} role="listbox" aria-label="Countries">
          <For each={countries()}>{(country, index) =>
            <button type="button" role="option" tabindex={-1}
              id={`${id}-option-${index()}`} data-index={index()}
              aria-selected={selected()?.code === country.code}
              class={styles.option} classList={{ [styles.active]: active() === index() }}
              onMouseDown={event => event.preventDefault()}
              onClick={() => choose(country)}
              onBlur={event => {
                if (!control.contains(event.relatedTarget as Node | null) && !list?.contains(event.relatedTarget as Node | null)) setOpen(false);
              }}>
              <span class={styles.optionFlag} aria-hidden="true">{countryFlag(country.code)}</span>
              <span>{country.name}</span><small>{country.code}</small>
              <Show when={selected()?.code === country.code}><span class={styles.check} aria-hidden="true">✓</span></Show>
            </button>
          }</For>
          <Show when={!countries().length}><p class={styles.empty} role="status">No matching countries. Try a country name or code.</p></Show>
        </div>
      </Portal>
    </Show>
  </div>;
}
