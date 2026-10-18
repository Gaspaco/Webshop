import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { LATEST_PATCH } from "~/lib/patch-notes";
import styles from "./PatchNotes.module.scss";

const SEEN_KEY = "tcghaven-patch-seen";
// Keys that only exist for someone who has used the shop before.
const RETURNING_KEYS = ["tcghaven_cart", "tcg-haven-loader-seen"];

function readStorage(storage: Storage, key: string) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(storage: Storage, key: string, value: string) {
  try {
    storage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: the in-memory flag still hides it.
  }
}

// Not on focused flows: checkout, sign-in pages and the dashboards.
const HIDDEN_PREFIXES = ["/cart", "/checkout", "/login", "/signup", "/verify-email", "/reset-password", "/two-factor", "/account", "/admin"];

export function showsPatchNotes(pathname: string) {
  return !HIDDEN_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

// A small, dismissible card in the corner; never blocks the page.
export default function PatchNotes() {
  const [open, setOpen] = createSignal(false);
  const [closing, setClosing] = createSignal(false);
  let showTimer: ReturnType<typeof setTimeout> | undefined;

  const dismiss = () => {
    writeStorage(localStorage, SEEN_KEY, LATEST_PATCH.version);
    writeStorage(sessionStorage, SEEN_KEY, LATEST_PATCH.version);
    setClosing(true);
    setTimeout(() => setOpen(false), 260);
  };

  onMount(() => {
    const seen =
      readStorage(localStorage, SEEN_KEY) ?? readStorage(sessionStorage, SEEN_KEY);
    if (seen === LATEST_PATCH.version) return;

    const returning =
      seen !== null || RETURNING_KEYS.some(key => readStorage(localStorage, key) !== null);
    // First-time visitors get the shop, not release notes.
    if (!returning) {
      writeStorage(localStorage, SEEN_KEY, LATEST_PATCH.version);
      return;
    }

    showTimer = setTimeout(() => setOpen(true), 1500);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open()) dismiss();
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  onCleanup(() => clearTimeout(showTimer));

  return (
    <Show when={open()}>
      <aside
        class={styles.card}
        classList={{ [styles.closing]: closing() }}
        role="dialog"
        aria-modal="false"
        aria-labelledby="patch-notes-title"
      >
        <button type="button" class={styles.close} aria-label="Close update notes" onClick={dismiss}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>

        <span class={styles.tag}>New · {LATEST_PATCH.date}</span>
        <h2 id="patch-notes-title">{LATEST_PATCH.title}</h2>
        <ul>
          <For each={LATEST_PATCH.items}>
            {item => (
              <li>
                <span aria-hidden="true" />
                {item}
              </li>
            )}
          </For>
        </ul>

        <div class={styles.actions}>
          <button type="button" class={styles.primary} onClick={dismiss}>Got it</button>
          <Show when={LATEST_PATCH.link}>
            {link => (
              <a href={link().href} class={styles.secondary} onClick={dismiss}>
                {link().label}
              </a>
            )}
          </Show>
        </div>
      </aside>
    </Show>
  );
}
