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
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setStatus("error");
        setMessage(result.error ?? "The request could not be submitted.");
        return;
      }
      setStatus("success");
      setMessage("Your request has been recorded. The shop owner will contact you with the next step.");
    } catch {
      setStatus("error");
      setMessage("The return service is unavailable right now. Please try again later.");
    }
  };

  return (
    <main class={styles.page}>
      <Title>Cancel or return an order | TCGHaven</Title>
      <div class={styles.shell}>
        <section class={styles.intro}>
          <p class={styles.eyebrow}>Order support</p>
          <h1>Cancel or return an order</h1>
          <p class={styles.lead}>
            Send the request online. Nothing is refunded automatically and you should not send an item back until the shop owner provides instructions.
          </p>
          <dl>
            <div><dt>01</dt><dd>Enter the order number from your confirmation email.</dd></div>
            <div><dt>02</dt><dd>Explain what you want to cancel or return.</dd></div>
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
                <span>What would you like to cancel or return?</span>
                <textarea required minlength="10" maxlength="1000" rows="6" placeholder="Tell us which item and the reason for your request." value={reason()} onInput={event => setReason(event.currentTarget.value)} />
              </label>
              <label class={styles.consent}>
                <input type="checkbox" required checked={confirmed()} onChange={event => setConfirmed(event.currentTarget.checked)} />
                <span>I confirm these order details are mine and the information is correct.</span>
              </label>
              <Show when={message()}><p class={styles.error} role="alert">{message()}</p></Show>
              <button type="submit" disabled={status() === "saving"}>
                {status() === "saving" ? "Submitting request" : "Submit cancellation or return"}
              </button>
              <p class={styles.privacy}>The form only reveals whether the supplied order details match. Requests are reviewed before any refund or stock change.</p>
            </form>
          </Show>
        </section>
      </div>
    </main>
  );
}
