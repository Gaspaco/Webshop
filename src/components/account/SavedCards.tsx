import { A } from "@solidjs/router";
import { createResource, createSignal, For, onMount, Show } from "solid-js";
import type { SavedCardsResponse } from "~/lib/saved-cards";
import styles from "./SavedCards.module.scss";

export default function SavedCards(props: {
  checkout?: boolean; selected?: string; onSelect?: (id: string) => void;
  remember?: boolean; onRemember?: (remember: boolean) => void;
}) {
  const [message, setMessage] = createSignal("");
  const [removing, setRemoving] = createSignal("");
  const [ready, setReady] = createSignal(false);
  const [loadError, setLoadError] = createSignal("");
  onMount(() => setReady(true));
  const [cards, { refetch }] = createResource(ready, async () => {
    setLoadError("");
    try {
    const response = await fetch("/api/account/payment-methods", { credentials: "same-origin", cache: "no-store" });
    if (props.checkout && [401, 403].includes(response.status)) return { available: false, cards: [] } as SavedCardsResponse;
    const result = await response.json() as SavedCardsResponse;
    if (!response.ok) throw new Error(result.error || "Saved cards could not be loaded. Please try again.");
    return result;
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Saved cards could not be loaded. Please try again.");
      return null;
    }
  });
  async function remove(id: string, last4: string) {
    if (removing() || !window.confirm(`Remove the card ending in ${last4}?`)) return;
    setRemoving(id); setMessage("");
    try {
      const response = await fetch("/api/account/payment-methods", { method: "DELETE", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const result = await response.json();
      if (!response.ok) { setMessage(result.error || "The card could not be removed."); return; }
      await refetch(); setMessage(`Card ending in ${last4} removed.`);
    } catch { setMessage("The result could not be confirmed. Refresh saved cards before trying again."); }
    finally { setRemoving(""); }
  }
  return <section class={styles.panel} aria-label="Saved payment cards" aria-busy={cards.loading}>
    <Show when={!props.checkout}><h3>Saved cards</h3><p>Card details are held by Mollie. You choose when to use a card; we never charge it automatically.</p></Show>
    <Show when={!ready() || cards.loading}><p role="status">Loading saved cards…</p></Show>
    <Show when={loadError()}><p role="alert">{loadError()}</p><button type="button" onClick={() => refetch()}>Reload saved cards</button></Show>
    <Show when={cards()?.available}>
      <Show when={props.checkout && cards()!.cards.length}>
        <label class={styles.choice}><input type="radio" name="payment-card" checked={!props.selected} onChange={() => props.onSelect?.("")} /><span>Choose a payment method at Mollie</span></label>
      </Show>
      <For each={cards()?.cards}>{card => <div class={styles.row}>
        <Show when={props.checkout} fallback={<span><strong>{card.label} ···· {card.last4}</strong><small>{card.expires ? `Expires ${card.expires.slice(0, 7)}` : "Saved with Mollie"}</small></span>}>
          <label class={styles.choice}><input type="radio" name="payment-card" value={card.id} checked={props.selected === card.id} onChange={() => { props.onSelect?.(card.id); props.onRemember?.(false); }} /><span><strong>{card.label} ···· {card.last4}</strong><small>{card.expires ? `Expires ${card.expires.slice(0, 7)}` : "Saved with Mollie"}</small></span></label>
        </Show>
        <Show when={!props.checkout}><button type="button" disabled={Boolean(removing())} aria-label={`Remove ${card.label} ending in ${card.last4}`} onClick={() => remove(card.id, card.last4)}>{removing() === card.id ? "Removing…" : "Remove card"}</button></Show>
      </div>}</For>
      <Show when={props.checkout && !props.selected}>
        <label class={styles.choice}><input type="checkbox" checked={props.remember ?? false} onChange={event => props.onRemember?.(event.currentTarget.checked)} /><span>Save my card for faster checkout</span></label>
        <p class={styles.note}>If you choose to save a card at Mollie, it will be linked to your account for future purchases. You can remove it here at any time. <A href="/privacy">Privacy policy</A></p>
      </Show>
      <Show when={!props.checkout}><p>{cards()?.cards.length ? "To add another card, choose to save it with Mollie during your next order." : "No saved cards yet. Choose to save your card at checkout with your next order."}</p><A href="/products">Browse the shop</A></Show>
    </Show>
    <Show when={ready() && !cards.loading && !loadError() && !cards()?.available && !props.checkout}><p>Saved cards are not available right now. You can still pay securely through Mollie.</p></Show>
    <p role="status" aria-live="polite">{message()}</p>
  </section>;
}
