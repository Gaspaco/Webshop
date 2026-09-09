import { Title } from "@solidjs/meta";
import { A, useSearchParams } from "@solidjs/router";
import { createSignal, Show } from "solid-js";
import styles from "./returns.module.scss";

export default function Returns() {
  const [searchParams] = useSearchParams();
  const [orderNumber, setOrderNumber] = createSignal(
    typeof searchParams.order === "string" ? searchParams.order.toUpperCase() : "",
  );
  const [email, setEmail] = createSignal("");
  const [reason, setReason] = createSignal("");
  const [confirmed, setConfirmed] = createSignal(false);
  const [status, setStatus] = createSignal<"idle" | "saving" | "success" | "error">("idle");
  const [message, setMessage] = createSignal("");
  const [reference, setReference] = createSignal("");

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    setStatus("saving");
    setMessage("");
    try {
      const response = await fetch("/api/returns", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderNumber: orderNumber(),
          email: email() || undefined,
          reason: reason(),
          confirmation: confirmed(),
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        reference?: string;
        confirmationSent?: boolean;
      };
      if (!response.ok) {
        setStatus("error");
        setMessage(result.error ?? "The request could not be submitted.");
        return;
      }
      setReference(result.reference ?? "");
      setStatus("success");
      setMessage(
        result.confirmationSent === true
          ? "Your request has been recorded. A confirmation was sent by email."
          : result.confirmationSent === false
            ? "Your request is saved, but the confirmation email could not be delivered. Keep this reference and contact the shop if you do not hear back."
            : "Your request was already saved. Keep this reference for your records.",
      );
    } catch {
      setStatus("error");
      setMessage("The return service is unavailable right now. Please try again later.");
    }
  };

  return (
    <main class={styles.page}>
      <Title>Withdraw from an order | TCGHaven</Title>
      <div class={styles.shell}>
        <section class={styles.intro}>
          <p class={styles.eyebrow}>Statutory withdrawal and returns</p>
          <h1>Withdraw from an order</h1>
          <p class={styles.lead}>
            Notify TCGHaven within 14 days after delivery. You do not have to give a reason. After notifying us, you have another 14 days to send the products back.
          </p>
          <dl>
            <div><dt>01</dt><dd>Enter the order number from your confirmation email.</dd></div>
            <div><dt>02</dt><dd>Identify the items you want to withdraw or return.</dd></div>
            <div><dt>03</dt><dd>The owner reviews the request and sends the return details.</dd></div>
          </dl>
          <p class={styles.help}>
            Need help first? <A href="/contact">Contact the shop</A> or read the <A href="/shipping">shipping and returns information</A>.
          </p>
        </section>

        <section class={styles.formPanel}>
          <Show
            when={status() !== "success"}
            fallback={
              <div class={styles.success} role="status">
                <span>Request received</span>
                <h2>We have saved your request.</h2>
                <p>{message()}</p>
                <Show when={reference()}>
                  <p class={styles.reference}>Reference: <strong>{reference()}</strong></p>
                </Show>
                <A href="/account">Open your account</A>
              </div>
            }
          >
            <form onSubmit={submit}>
              <div class={styles.formHeading}>
                <span>Secure request form</span>
                <h2>Order details</h2>
              </div>
              <label>
                <span>Order number</span>
                <input required maxlength="40" autocomplete="off" placeholder="TCG-XXXXXXXXXX" value={orderNumber()} onInput={event => setOrderNumber(event.currentTarget.value.toUpperCase())} />
              </label>
              <label>
                <span>Order email</span>
                <input type="email" maxlength="254" autocomplete="email" placeholder="you@example.com" value={email()} onInput={event => setEmail(event.currentTarget.value)} />
                <small>Required for guest orders. Signed-in customers can leave this empty.</small>
              </label>
              <label>
                <span>Which items are included? <small>Reason optional</small></span>
                <textarea maxlength="1000" rows="6" placeholder="List the items. You may add a reason, but you do not have to." value={reason()} onInput={event => setReason(event.currentTarget.value)} />
              </label>
              <label class={styles.consent}>
                <input type="checkbox" required checked={confirmed()} onChange={event => setConfirmed(event.currentTarget.checked)} />
                <span>I confirm these order details are mine and the information is correct.</span>
              </label>
              <Show when={message()}><p class={styles.error} role="alert">{message()}</p></Show>
              <button type="submit" disabled={status() === "saving"}>
                {status() === "saving" ? "Submitting request" : "Submit withdrawal request"}
              </button>
              <p class={styles.privacy}>The form only reveals whether the supplied order details match. Requests are reviewed before any refund or stock change.</p>
            </form>
          </Show>
        </section>
      </div>
    </main>
  );
}
