import { createSignal, For, Show } from "solid-js";
import styles from "./DiscountManager.module.scss";

export type AdminDiscount = {
  id: string;
  code: string;
  type: "percentage" | "fixed";
  value: number;
  minimumOrderCents: number;
  maximumUses: number | null;
  usedCount: number;
  active: boolean;
  expiresAt: string | null;
  createdAt: string;
};

type DiscountState = { label: string; tone: "live" | "off" | "ended" };

const money = new Intl.NumberFormat("en-NL", { style: "currency", currency: "EUR" });
const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const dateTime = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const formatMoney = (cents: number) => money.format(cents / 100);

function discountState(discount: AdminDiscount): DiscountState {
  if (!discount.active) return { label: "Disabled", tone: "off" };
  if (discount.expiresAt && Date.parse(discount.expiresAt) <= Date.now()) return { label: "Expired", tone: "ended" };
  if (discount.maximumUses !== null && discount.usedCount >= discount.maximumUses) return { label: "Used up", tone: "ended" };
  return { label: "Active", tone: "live" };
}

const discountLabel = (discount: Pick<AdminDiscount, "type" | "value">) =>
  discount.type === "percentage" ? `${discount.value}% off` : `${formatMoney(discount.value)} off`;

export default function DiscountManager(props: {
  discounts: AdminDiscount[];
  onUpdated: () => unknown;
}) {
  const [code, setCode] = createSignal("");
  const [type, setType] = createSignal<"percentage" | "fixed">("percentage");
  const [value, setValue] = createSignal("");
  const [minimum, setMinimum] = createSignal("0");
  const [maximumUses, setMaximumUses] = createSignal("");
  const [expiresAt, setExpiresAt] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [togglingId, setTogglingId] = createSignal("");
  const [notice, setNotice] = createSignal<{ tone: "ok" | "error"; text: string } | null>(null);

  // A plain-language read-back of the code being created.
  const preview = () => {
    const amount = Number(value());
    if (!code().trim() || !amount) return "Fill in a code and an amount to see what customers will get.";
    const off = type() === "percentage" ? `${Math.round(amount)}% off` : `${money.format(amount)} off`;
    const min = Number(minimum()) > 0 ? ` orders of ${money.format(Number(minimum()))} or more` : " any order";
    const uses = maximumUses() ? `, limited to ${Number(maximumUses())} ${Number(maximumUses()) === 1 ? "use" : "uses"}` : ", unlimited uses";
    const ends = expiresAt() ? `, until ${dateTime.format(new Date(expiresAt()))}` : ", no expiry";
    return `${code().trim()} gives ${off}${min}${uses}${ends}.`;
  };

  const createDiscount = async (event: SubmitEvent) => {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/discounts", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code(),
          type: type(),
          value: type() === "percentage" ? Math.round(Number(value())) : Math.round(Number(value()) * 100),
          minimumOrderCents: Math.round(Number(minimum()) * 100),
          maximumUses: maximumUses() ? Number(maximumUses()) : null,
          expiresAt: expiresAt() ? new Date(expiresAt()).toISOString() : null,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setNotice({ tone: "error", text: result.error ?? "The discount code could not be created." });
        return;
      }
      const created = code();
      await Promise.resolve(props.onUpdated());
      setCode("");
      setValue("");
      setMaximumUses("");
      setExpiresAt("");
      setNotice({ tone: "ok", text: `${created} is live at checkout.` });
    } catch {
      setNotice({ tone: "error", text: "The discount code could not be created. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  };

  const toggleDiscount = async (discount: AdminDiscount) => {
    setTogglingId(discount.id);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/discounts", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: discount.id, active: !discount.active }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setNotice({ tone: "error", text: result.error ?? "The discount code could not be updated." });
        return;
      }
      await Promise.resolve(props.onUpdated());
    } catch {
      setNotice({ tone: "error", text: "The discount code could not be updated. Check your connection and try again." });
    } finally {
      setTogglingId("");
    }
  };

  return (
    <div class={styles.discounts}>
      <form class={styles.composer} onSubmit={createDiscount}>
        <header class={styles.head}>
          <div>
            <h2>New discount code</h2>
            <p>Codes go live at checkout as soon as you create them.</p>
          </div>
        </header>

        <div class={styles.fields}>
          <label>
            <span>Code</span>
            <input
              required
              class={styles.codeInput}
              placeholder="HAVEN10"
              maxLength={40}
              autocomplete="off"
              spellcheck={false}
              value={code()}
              onInput={event => setCode(event.currentTarget.value.toUpperCase().replace(/\s+/g, ""))}
            />
          </label>

          <fieldset>
            <legend>Discount</legend>
            <div class={styles.amount}>
              <div class={styles.typeSwitch} role="group" aria-label="Discount type">
                <button type="button" aria-pressed={type() === "percentage"} onClick={() => setType("percentage")}>Percent</button>
                <button type="button" aria-pressed={type() === "fixed"} onClick={() => setType("fixed")}>Amount</button>
              </div>
              <div class={styles.affixed}>
                <Show when={type() === "fixed"}><b aria-hidden="true">€</b></Show>
                <input
                  required
                  type="number"
                  inputmode="decimal"
                  aria-label={type() === "percentage" ? "Percent off" : "Amount off in euros"}
                  min="1"
                  max={type() === "percentage" ? "100" : undefined}
                  step={type() === "percentage" ? "1" : "0.01"}
                  placeholder={type() === "percentage" ? "10" : "5.00"}
                  value={value()}
                  onInput={event => setValue(event.currentTarget.value)}
                />
                <Show when={type() === "percentage"}><b aria-hidden="true">%</b></Show>
              </div>
            </div>
          </fieldset>

          <label>
            <span>Minimum order</span>
            <div class={styles.affixed}>
              <b aria-hidden="true">€</b>
              <input type="number" inputmode="decimal" min="0" step="0.01" value={minimum()} onInput={event => setMinimum(event.currentTarget.value)} />
            </div>
          </label>

          <label>
            <span>Usage limit</span>
            <input type="number" inputmode="numeric" min="1" step="1" placeholder="Unlimited" value={maximumUses()} onInput={event => setMaximumUses(event.currentTarget.value)} />
          </label>

          <label>
            <span>Expires</span>
            <input type="datetime-local" value={expiresAt()} onInput={event => setExpiresAt(event.currentTarget.value)} />
            <small>Leave empty to keep the code running.</small>
          </label>
        </div>

        <footer class={styles.footer}>
          <p aria-live="polite">{preview()}</p>
          <button type="submit" class={styles.create} disabled={busy()}>
            {busy() ? "Creating…" : "Create code"}
          </button>
        </footer>
      </form>

      <Show when={notice()}>
        {current => (
          <p class={styles.notice} data-tone={current().tone} role={current().tone === "error" ? "alert" : "status"}>
            {current().text}
          </p>
        )}
      </Show>

      <section class={styles.codes} aria-labelledby="discount-codes-title">
        <header class={styles.head}>
          <div>
            <h2 id="discount-codes-title">Codes</h2>
            <p>
              {props.discounts.filter(discount => discountState(discount).tone === "live").length} active of {props.discounts.length}
            </p>
          </div>
        </header>

        <Show
          when={props.discounts.length}
          fallback={
            <div class={styles.empty}>
              <strong>No discount codes yet</strong>
              <p>Create a welcome code above, for example 10% off a first order over €20.</p>
            </div>
          }
        >
          <div class={styles.table} role="table" aria-label="Discount codes">
            <div class={styles.row} role="row" data-head="">
              <span role="columnheader">Code</span>
              <span role="columnheader">Discount</span>
              <span role="columnheader">Usage</span>
              <span role="columnheader">Expires</span>
              <span role="columnheader">Status</span>
              <span role="columnheader"><span class={styles.srOnly}>Action</span></span>
            </div>
            <For each={props.discounts}>
              {discount => {
                const state = () => discountState(discount);
                const share = () => (discount.maximumUses ? Math.min(1, discount.usedCount / discount.maximumUses) : 0);
                return (
                  <div class={styles.row} role="row" data-tone={state().tone}>
                    <span role="cell" class={styles.code}>
                      <strong>{discount.code}</strong>
                      <small>Created {date.format(new Date(discount.createdAt))}</small>
                    </span>
                    <span role="cell">
                      <strong>{discountLabel(discount)}</strong>
                      <small>{discount.minimumOrderCents ? `Orders from ${formatMoney(discount.minimumOrderCents)}` : "Any order"}</small>
                    </span>
                    <span role="cell" class={styles.usage}>
                      <strong>
                        {discount.usedCount}
                        <Show when={discount.maximumUses !== null}> / {discount.maximumUses}</Show>
                        <small> used</small>
                      </strong>
                      <Show when={discount.maximumUses !== null}>
                        <i aria-hidden="true"><b style={{ width: `${share() * 100}%` }} /></i>
                      </Show>
                    </span>
                    <span role="cell" class={styles.expiry} data-none={discount.expiresAt ? undefined : ""}>
                      {discount.expiresAt ? date.format(new Date(discount.expiresAt)) : "No expiry"}
                    </span>
                    <span role="cell">
                      <span class={styles.state} data-tone={state().tone}>{state().label}</span>
                    </span>
                    <span role="cell" class={styles.action}>
                      <button
                        type="button"
                        disabled={togglingId() === discount.id}
                        onClick={() => toggleDiscount(discount)}
                      >
                        {togglingId() === discount.id ? "Saving…" : discount.active ? "Disable" : "Enable"}
                      </button>
                    </span>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>
      </section>
    </div>
  );
}
