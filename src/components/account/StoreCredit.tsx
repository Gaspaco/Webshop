import { createResource, createSignal, For, onMount, Show } from "solid-js";
import styles from "./StoreCredit.module.scss";

type Wallet = { balanceCents: number; currency: string; entries: Array<{ id: string; kind: string; amountCents: number; balanceCents: number; reason: string; createdAt: string; orderNumber: string | null }> };
const money = (cents: number) => new Intl.NumberFormat("en-NL", { style: "currency", currency: "EUR" }).format(cents / 100);

export default function StoreCredit(props: { userId?: string }) {
  const [ready, setReady] = createSignal(false);
  onMount(() => setReady(true));
  const [wallet, { refetch }] = createResource(ready, async () => {
    try {
    const response = await fetch(props.userId ? `/api/admin/wallet?userId=${encodeURIComponent(props.userId)}` : "/api/account/wallet", { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) return null;
    return await response.json() as Wallet;
    } catch { return null; }
  });
  const [amount, setAmount] = createSignal(""); const [reason, setReason] = createSignal("");
  const [direction, setDirection] = createSignal("add"); const [busy, setBusy] = createSignal(false); const [message, setMessage] = createSignal("");
  let signature = "", requestId = "";
  async function adjust(event: SubmitEvent) {
    event.preventDefault(); if (busy()) return;
    const cents = Math.round(Number(amount()) * 100) * (direction() === "deduct" ? -1 : 1);
    if (!Number.isSafeInteger(cents) || cents === 0 || Math.abs(cents) > 1_000_000 || reason().trim().length < 3) { setMessage("Enter a valid amount and a reason of at least 3 characters."); return; }
    if (!window.confirm(`${cents > 0 ? "Add" : "Deduct"} ${money(Math.abs(cents))} ${cents > 0 ? "to" : "from"} this customer's store credit?`)) return;
    const body = { userId: props.userId, amountCents: cents, reason: reason().trim() };
    const current = JSON.stringify(body); if (current !== signature) { signature = current; requestId = crypto.randomUUID(); }
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/wallet", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, requestId }) });
      const result = await response.json();
      if (!response.ok) { setMessage(result.error || "Credit could not be updated."); return; }
      await refetch(); setMessage(result.repeated ? "This adjustment was already saved. No duplicate credit was added." : "Store credit updated.");
      setAmount(""); setReason(""); signature = "";
    } catch { setMessage("The result could not be confirmed. Refresh the balance before retrying; the same adjustment reference is retained."); }
    finally { setBusy(false); }
  }
  return <section class={styles.panel} aria-label="Store credit">
    <header><div><h3>Store credit</h3><p>Spend your available credit at checkout. No cash top-ups or withdrawals.</p></div>
      <strong>{wallet() ? money(wallet()!.balanceCents) : wallet.loading ? "Loading…" : "Unavailable"}</strong></header>
    <Show when={props.userId}><form onSubmit={adjust} class={styles.form}>
      <label><span>Action</span><select disabled={busy()} value={direction()} onChange={event => setDirection(event.currentTarget.value)}><option value="add">Add credit</option><option value="deduct">Deduct credit</option></select></label>
      <label><span>Amount (EUR)</span><input required disabled={busy()} type="number" min="0.01" max="10000" step="0.01" value={amount()} onInput={event => setAmount(event.currentTarget.value)} /></label>
      <label><span>Reason (visible to the customer)</span><input required disabled={busy()} minlength="3" maxlength="300" value={reason()} onInput={event => setReason(event.currentTarget.value)} /></label>
      <button type="submit" disabled={busy() || !wallet()}>{busy() ? "Saving…" : "Apply credit adjustment"}</button>
    </form></Show>
    <p role="status">{message()}</p>
    <Show when={!wallet.loading && !wallet()}><p>Credit could not be loaded. <button type="button" onClick={() => refetch()}>Try again</button></p></Show>
    <Show when={wallet()}>{current => <>
      <p>Recent activity (up to 100 transactions). Pending order credit is held until payment completes; failed payments return it automatically.</p>
      <Show when={current().entries.length} fallback={<p>No store credit activity yet.</p>}>
        <div class={styles.history}><For each={current().entries}>{entry => <article>
          <div><strong>{entry.reason}</strong><small>{entry.orderNumber ? `${entry.orderNumber} · ` : ""}{new Date(entry.createdAt).toLocaleDateString("en-NL")}</small></div>
          <span>{entry.amountCents > 0 ? "+" : "−"}{money(Math.abs(entry.amountCents))}</span>
          <small>Balance {money(entry.balanceCents)}</small>
        </article>}</For></div>
      </Show>
    </>}</Show>
  </section>;
}
