import { Title } from "@solidjs/meta";
import { A, useSearchParams } from "@solidjs/router";
import { createSignal, onMount, Show } from "solid-js";
import styles from "./index.module.scss";

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
  const [confirmationToken, setConfirmationToken] = createSignal("");
  const [verificationRequired, setVerificationRequired] = createSignal(false);

  onMount(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("confirm");
    if (!token) return;
    // Keep one-time secrets out of server requests, subsequent history entries
    // and copied page URLs. Merely opening the email never submits a return.
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    if (/^[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/i.test(token)) setConfirmationToken(token);
    else { setStatus("error"); setMessage("This confirmation link is invalid. Submit the form to request a new one."); }
  });

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (status() === "saving") return;
    setStatus("saving");
    setMessage("");
    try {
      const response = await fetch("/api/returns", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(confirmationToken() ? { action: "confirm", token: confirmationToken() } : {
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
        verificationRequired?: boolean;
        message?: string;
      };
      if (!response.ok) {
        setStatus("error");
        setMessage(result.error ?? "The request could not be submitted.");
        return;
      }
      setReference(result.reference ?? "");
      setVerificationRequired(result.verificationRequired === true);
      setConfirmationToken("");
      setStatus("success");
      setMessage(
        result.verificationRequired
          ? result.message ?? "Check your order email for a link to confirm this request. No return has been created yet."
          : result.confirmationSent === true
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
          <h1>Withdraw from an order</h1>
          <p class={styles.lead}>
            Let us know within 14 days after delivery. You don't have to give a reason. After that you have another 14 days to send the products back.
          </p>
          <ol class={styles.steps}>
            <li><span>1</span>Enter the order number from your confirmation email.</li>
            <li><span>2</span>List the items you want to withdraw or return.</li>
            <li><span>3</span>For guest orders, confirm the one-time link sent to your order email.</li>
            <li><span>4</span>We review your confirmed request and email you the return details.</li>
          </ol>
          <p class={styles.help}>
            Need help first? <A href="/contact">Contact the shop</A> or read the <A href="/shipping">shipping and returns information</A>.
          </p>
        </section>

        <section class={styles.formPanel}>
          <Show
            when={status() !== "success"}
            fallback={
              <div class={styles.success} role="status">
                <span class={styles.successIcon} aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                </span>
                <h2>{verificationRequired() ? "Check your email" : "Request received"}</h2>
                <p>{message()}</p>
                <Show when={reference()}>
                  <p class={styles.reference}>Reference: <strong>{reference()}</strong></p>
                </Show>
                <Show when={verificationRequired()} fallback={<A href="/account">Open your account</A>}>
                  <A href="/contact">Get help with your request</A>
                </Show>
              </div>
            }
          >
            <form onSubmit={submit}>
              <Show when={confirmationToken()} fallback={<>
              <div class={styles.formHeading}>
                <h2>Order details</h2>
              </div>
              <label>
                <span>Order number</span>
                <input required maxlength="40" autocomplete="off" placeholder="TCG-XXXXXXXXXX" value={orderNumber()} onInput={event => setOrderNumber(event.currentTarget.value.toUpperCase())} />
              </label>
              <label>
                <span>Order email</span>
                <input type="email" maxlength="254" autocomplete="email" placeholder="you@example.com" value={email()} onInput={event => setEmail(event.currentTarget.value)} />
                <small>Guest orders need email confirmation. Signed-in customers can leave this empty for their own orders.</small>
              </label>
              <label>
                <span>Which items are included? <small>Reason optional</small></span>
                <textarea maxlength="1000" rows="6" placeholder="List the items. You may add a reason, but you do not have to." value={reason()} onInput={event => setReason(event.currentTarget.value)} />
              </label>
              <label class={styles.consent}>
                <input type="checkbox" required checked={confirmed()} onChange={event => setConfirmed(event.currentTarget.checked)} />
                <span>I confirm these order details are mine and the information is correct.</span>
              </label>
              </>}>
                <div class={styles.formHeading}><h2>Confirm your return request</h2></div>
                <p>Only confirm if you started the request described in the email. This sends it to the shop for review. It does not issue a refund.</p>
              </Show>
              <Show when={message()}><p class={styles.error} role="alert">{message()}</p></Show>
              <button type="submit" disabled={status() === "saving"}>
                {status() === "saving" ? "Submitting request" : confirmationToken() ? "Confirm return request" : "Submit withdrawal request"}
              </button>
              <Show when={confirmationToken()}>
                <button type="button" class={styles.resetButton} disabled={status() === "saving"} onClick={() => { setConfirmationToken(""); setStatus("idle"); setMessage(""); }}>Request a new confirmation link</button>
              </Show>
              <p class={styles.privacy}>We verify order ownership before saving a return. Requests are reviewed before any refund or stock change.</p>
            </form>
          </Show>
        </section>
      </div>
    </main>
  );
}
