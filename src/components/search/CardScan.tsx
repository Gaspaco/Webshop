import { A } from "@solidjs/router";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { formatPrice } from "~/lib/cart";
import styles from "./CardScan.module.scss";

type ScanResult = {
  id: string;
  name: string;
  href: string;
  set: string | null;
  number: string | null;
  game: string | null;
  image: string | null;
  priceCents: number | null;
  inStock: boolean;
};

type ScanState =
  | { kind: "idle" }
  | { kind: "reading" }
  | { kind: "done"; results: ScanResult[]; recognised: string | null }
  | { kind: "error"; message: string };

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const MAX_SOURCE_BYTES = 15_000_000;

async function loadEnabled() {
  try {
    const response = await fetch("/api/catalog/scan");
    return response.ok ? ((await response.json()) as { enabled: boolean }).enabled : false;
  } catch {
    return false;
  }
}

// Shrink and re-encode in the browser: smaller upload, and the canvas drops
// EXIF data (including GPS location) from phone photos.
async function prepare(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

// Scan button for a search bar: opens a small dropdown where you drop or
// paste a screenshot of a card (or pick a photo) and see which products in
// the shop match it.
export default function CardScan() {
  // Checked after mount: reading a pending resource here would suspend the
  // whole page while it hydrates.
  const [enabled, setEnabled] = createSignal(false);
  onMount(() => void loadEnabled().then(setEnabled));
  const [open, setOpen] = createSignal(false);
  const [preview, setPreview] = createSignal("");
  const [state, setState] = createSignal<ScanState>({ kind: "idle" });
  const [dragging, setDragging] = createSignal(false);
  const [position, setPosition] = createSignal({ top: 0, right: 0 });
  const [pasteKey, setPasteKey] = createSignal("Ctrl+V");
  const [touch, setTouch] = createSignal(false);
  let trigger: HTMLButtonElement | undefined;
  let panel: HTMLElement | undefined;
  let fileInput: HTMLInputElement | undefined;
  let controller: AbortController | undefined;

  const reset = () => {
    controller?.abort();
    setState({ kind: "idle" });
    setPreview("");
  };

  const close = () => {
    reset();
    setOpen(false);
  };

  // The dropdown hangs under the button, wherever the navbar has moved it.
  const place = () => {
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setPosition({ top: Math.round(rect.bottom + 10), right: Math.round(window.innerWidth - rect.right) });
  };

  const show = () => {
    place();
    setOpen(true);
  };

  const scan = async (file: File | undefined) => {
    if (!file) return;
    show();
    if (!ACCEPTED.includes(file.type) || file.size > MAX_SOURCE_BYTES) {
      setState({ kind: "error", message: "Use a photo or screenshot (JPEG, PNG or WebP) under 15 MB." });
      return;
    }
    setState({ kind: "reading" });
    try {
      const image = await prepare(file);
      setPreview(image);
      controller = new AbortController();
      const response = await fetch("/api/catalog/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image }),
        signal: controller.signal,
      });
      const data = (await response.json()) as {
        results?: ScanResult[];
        recognised?: string | null;
        error?: string;
      };
      if (!response.ok) {
        setState({ kind: "error", message: data.error ?? "That card couldn't be read. Try another photo." });
        return;
      }
      setState({ kind: "done", results: data.results ?? [], recognised: data.recognised ?? null });
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      setState({ kind: "error", message: "That photo couldn't be processed. Try another one." });
    } finally {
      if (fileInput) fileInput.value = "";
    }
  };

  onMount(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setPasteKey("⌘V");
    // Phones can't drag files in, so the drop zone becomes a tap target.
    setTouch(window.matchMedia("(pointer: coarse)").matches);

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open()) close();
    };
    // Clicking anywhere else closes the dropdown.
    const onPointerDown = (event: PointerEvent) => {
      if (!open() || state().kind === "reading") return;
      const target = event.target as Node;
      if (panel?.contains(target) || trigger?.contains(target)) return;
      close();
    };
    const onMove = () => open() && requestAnimationFrame(place);

    // Dragging a photo over the page opens the dropdown so you can see where
    // to drop it; dropping anywhere on the page works too.
    const hasImageFile = (event: DragEvent) =>
      Boolean(event.dataTransfer?.types.includes("Files")) &&
      [...(event.dataTransfer?.items ?? [])].some(item => item.kind === "file" && item.type.startsWith("image/"));
    let depth = 0;
    const onDragEnter = (event: DragEvent) => {
      if (!enabled() || !hasImageFile(event)) return;
      depth += 1;
      if (!open()) show();
      setDragging(true);
    };
    const onDragOver = (event: DragEvent) => {
      if (!enabled() || !hasImageFile(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const onDragLeave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDrop = (event: DragEvent) => {
      depth = 0;
      setDragging(false);
      if (!enabled() || !hasImageFile(event)) return;
      event.preventDefault();
      const file = [...(event.dataTransfer?.files ?? [])].find(item => item.type.startsWith("image/"));
      void scan(file);
    };
    const onPaste = (event: ClipboardEvent) => {
      if (!enabled()) return;
      // Leave pastes into text fields alone, except the search fields.
      const target = event.target as HTMLElement | null;
      const typing = target?.closest("textarea, [contenteditable='true'], input:not([type='search'])");
      if (typing) return;
      const file = [...(event.clipboardData?.files ?? [])].find(item => item.type.startsWith("image/"));
      if (!file) return;
      event.preventDefault();
      void scan(file);
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, { passive: true });
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("paste", onPaste);
    onCleanup(() => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove);
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("paste", onPaste);
    });
  });

  const results = () => {
    const current = state();
    return current.kind === "done" ? current.results : [];
  };

  return (
    <Show when={enabled()}>
      <button
        ref={trigger}
        type="button"
        class={styles.trigger}
        classList={{ [styles.triggerOpen]: open() }}
        aria-label="Search by photo of a card"
        aria-expanded={open()}
        aria-controls="card-scan-panel"
        title="Search by photo of a card"
        onClick={() => (open() ? close() : show())}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
          <rect x="8.5" y="7.5" width="7" height="9" rx="1" />
        </svg>
      </button>
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPTED.join(",")}
        class={styles.file}
        tabIndex={-1}
        onChange={event => void scan(event.currentTarget.files?.[0])}
      />

      <Show when={open()}>
        <Portal>
          <section
            ref={panel}
            id="card-scan-panel"
            class={styles.panel}
            style={{ "--top": `${position().top}px`, "--right": `${position().right}px` }}
            role="dialog"
            aria-labelledby="card-scan-title"
          >
            <Show
              when={state().kind !== "idle"}
              fallback={
                <>
                  <div class={styles.intro}>
                    <h2 id="card-scan-title">Find a card by photo</h2>
                    <button type="button" class={styles.close} aria-label="Close card scan" onClick={close}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                  </div>
                  <button
                    type="button"
                    class={styles.drop}
                    classList={{ [styles.dropActive]: dragging() }}
                    onClick={() => fileInput?.click()}
                  >
                    <span class={styles.dropIcon}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <rect x="6" y="3" width="12" height="18" rx="2" />
                        <path d="M12 8v6M9 11l3 3 3-3" />
                      </svg>
                    </span>
                    <Show
                      when={!touch()}
                      fallback={
                        <>
                          <strong>Choose a screenshot</strong>
                          <span>or take a photo of your card</span>
                        </>
                      }
                    >
                      <strong>{dragging() ? "Drop it here" : "Drop a screenshot here"}</strong>
                      <span>
                        or paste it with <kbd>{pasteKey()}</kbd>
                      </span>
                      <span class={styles.choose}>Choose a photo</span>
                    </Show>
                  </button>
                  <p class={styles.note}>Your photo is only used to find the card and isn't stored.</p>
                </>
              }
            >
              <div class={styles.head}>
                <span class={styles.photo} classList={{ [styles.photoReading]: state().kind === "reading" }}>
                  <Show when={preview()} fallback={<span class={styles.photoEmpty} />}>
                    {src => <img src={src()} alt="Your photo" />}
                  </Show>
                </span>
                <div>
                  <h2 id="card-scan-title">
                    {state().kind === "reading"
                      ? "Reading your card…"
                      : state().kind === "error"
                        ? "Couldn't read that card"
                        : results().length
                          ? "Is it one of these?"
                          : "No match in the shop"}
                  </h2>
                  <p>
                    <Show when={state().kind === "error"} fallback={
                      <Show when={state().kind === "done" && (state() as { recognised: string | null }).recognised} fallback="Use a clear photo with the card's name visible.">
                        {recognised => <>We read <strong>"{recognised()}"</strong> on your card.</>}
                      </Show>
                    }>
                      {(state() as { message: string }).message}
                    </Show>
                  </p>
                </div>
                <button type="button" class={styles.close} aria-label="Close card scan" onClick={close}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              </div>

              <Show when={results().length}>
                <ul class={styles.results}>
                  <For each={results()}>
                    {item => (
                      <li>
                        <A href={item.href} class={styles.result} onClick={close}>
                          <span class={styles.thumb}>
                            <img src={item.image ?? "/images/logo-mark.png"} alt="" loading="lazy" />
                          </span>
                          <span class={styles.text}>
                            <strong>{item.name}</strong>
                            <small>{[item.number, item.set, item.game].filter(Boolean).join(" · ")}</small>
                          </span>
                          <span class={styles.price}>
                            <Show when={item.priceCents}>{price => <b>{formatPrice(price())}</b>}</Show>
                            <Show when={!item.inStock}><em>Sold out</em></Show>
                          </span>
                        </A>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>

              <button type="button" class={styles.again} disabled={state().kind === "reading"} onClick={reset}>
                Scan another card
              </button>
            </Show>
          </section>
        </Portal>
      </Show>
    </Show>
  );
}
