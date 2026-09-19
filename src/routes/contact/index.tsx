import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import { createSignal, For, onMount, Show } from "solid-js";
import {
  DEFAULT_STORE_PROFILE,
  fetchStoreProfile,
} from "~/lib/store-profile";
import styles from "./index.module.scss";

const CONTACT_TOPICS = [
  { value: "Order question", label: "An order" },
  { value: "Card condition or grading", label: "Card condition" },
  { value: "Returns & refunds", label: "Return or refund" },
  { value: "Selling to us", label: "Sell cards" },
  { value: "Something else", label: "Something else" },
] as const;

const MESSAGE_PROMPTS: Record<(typeof CONTACT_TOPICS)[number]["value"], string> = {
  "Order question": "Include your order number and tell us what you need help with.",
  "Card condition or grading": "Tell us the card, set, printing, and what you would like checked.",
  "Returns & refunds": "Include your order number, the item, and the reason for the return.",
  "Selling to us": "Tell us which cards you have, their condition, and whether you have a list or photos.",
  "Something else": "Tell us what is on your mind.",
};

export default function Contact() {
  const [name, setName] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [topic, setTopic] = createSignal<(typeof CONTACT_TOPICS)[number]["value"]>("Order question");
  const [message, setMessage] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [sent, setSent] = createSignal(false);
  const [formError, setFormError] = createSignal("");
  const [profile, setProfile] = createSignal(DEFAULT_STORE_PROFILE);

  onMount(async () => setProfile(await fetchStoreProfile()));

  const onSubmit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (!name().trim() || !email().trim() || !message().trim()) return;

    setLoading(true);
    setFormError("");
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name(),
          email: email(),
          topic: topic(),
          message: message(),
          website: "",
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setFormError(result.error ?? "Your message could not be sent.");
        return;
      }
      setSent(true);
    } catch {
      setFormError("Your message could not be sent. Please email the shop directly.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main class={styles.page}>
      <Title>Contact | TCGHaven</Title>

      <div class={styles.wide}>
        <header class={styles.header}>
          <h1 class={styles.heading}>Talk to the shop.</h1>
          <div class={styles.headerCopy}>
            <p>
              Ask about an order, a card's condition, a return, or a collection
              you want to sell. Your message goes straight to the person running
              TCGHaven.
            </p>
            <span class={styles.replyTime}>
              <span aria-hidden="true" />
              Replies within one business day
            </span>
          </div>
        </header>

        <div class={styles.contactLayout}>
          <section class={styles.formSide} aria-labelledby="contact-form-title">
            <Show
              when={!sent()}
              fallback={
                <div class={styles.success} role="status">
                  <span class={styles.successIcon}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </span>
                  <p class={styles.successTitle}>Message received</p>
                  <p class={styles.successText}>
                    Thanks, {name() || "friend"}. We will reply to {email()} as
                    soon as we can, usually within one business day.
                  </p>
                  <A href="/products" class={styles.successLink}>Return to the shop</A>
                </div>
              }
            >
              <div class={styles.formHeading}>
                <h2 id="contact-form-title">Send a message</h2>
                <p>Give us the useful bits and we will take it from there.</p>
              </div>

              <form class={styles.form} onSubmit={onSubmit}>
                <fieldset class={styles.topicField}>
                  <legend>What can we help with?</legend>
                  <div class={styles.topicGrid}>
                    <For each={CONTACT_TOPICS}>
                      {item => (
                        <label class={styles.topicOption}>
                          <input
                            type="radio"
                            name="topic"
                            value={item.value}
                            checked={topic() === item.value}
                            onChange={() => setTopic(item.value)}
                          />
                          <span>{item.label}</span>
                        </label>
                      )}
                    </For>
                  </div>
                </fieldset>

                <div class={styles.row}>
                  <div class={styles.field}>
                    <label class={styles.label} for="name">Your name</label>
                    <input
                      id="name"
                      type="text"
                      class={styles.input}
                      autocomplete="name"
                      required
                      value={name()}
                      onInput={event => setName(event.currentTarget.value)}
                    />
                  </div>

                  <div class={styles.field}>
                    <label class={styles.label} for="email">Email address</label>
                    <input
                      id="email"
                      type="email"
                      class={styles.input}
                      autocomplete="email"
                      required
                      value={email()}
                      onInput={event => setEmail(event.currentTarget.value)}
                    />
                  </div>
                </div>

                <div class={styles.field}>
                  <div class={styles.messageLabel}>
                    <label class={styles.label} for="message">Message</label>
                    <span>{message().length} / 3000</span>
                  </div>
                  <textarea
                    id="message"
                    class={styles.textarea}
                    placeholder={MESSAGE_PROMPTS[topic()]}
                    required
                    minlength="10"
                    maxlength="3000"
                    value={message()}
                    onInput={event => setMessage(event.currentTarget.value)}
                  />
                </div>

                <div class={styles.formFoot}>
                  <button type="submit" class={styles.submit} disabled={loading()}>
                    <Show when={loading()}>
                      <span class={styles.spinner} />
                    </Show>
                    <span>{loading() ? "Sending..." : "Send message"}</span>
                    <Show when={!loading()}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </Show>
                  </button>
                  <p>We use your details only to answer this message.</p>
                </div>

                <Show when={formError()}>
                  <p class={styles.formError} role="alert">{formError()}</p>
                </Show>
              </form>
            </Show>
          </section>

          <aside class={styles.info}>
            <div class={styles.directContact}>
              <h2>Prefer direct contact?</h2>
              <a href={`mailto:${profile().businessEmail}`}>{profile().businessEmail}</a>
              <a href={`tel:${profile().phone.replace(/\s+/g, "")}`}>{profile().phone}</a>
            </div>

            <div class={styles.includeBlock}>
              <h2>Helpful details</h2>
              <dl>
                <div>
                  <dt>Orders</dt>
                  <dd>Your order number</dd>
                </div>
                <div>
                  <dt>Singles</dt>
                  <dd>Card, set, and printing</dd>
                </div>
                <div>
                  <dt>Returns</dt>
                  <dd>Item and delivery date</dd>
                </div>
              </dl>
            </div>

            <div class={styles.location}>
              <span>Based in the Netherlands</span>
              <p>Shipping cards and sealed product across the EU.</p>
            </div>

            <nav class={styles.helpLinks} aria-label="Customer service links">
              <A href="/shipping">Shipping information</A>
              <A href="/returns">Returns and withdrawal</A>
            </nav>
          </aside>
        </div>
      </div>
    </main>
  );
}
