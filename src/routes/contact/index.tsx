import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import { createSignal, For, onMount, Show } from "solid-js";
import { createStorefrontSocials } from "~/lib/storefront-socials";
import {
  DEFAULT_STORE_PROFILE,
  fetchStoreProfile,
} from "~/lib/store-profile";
import styles from "./index.module.scss";

// Icons are simple 24px stroke paths, drawn per topic.
const CONTACT_TOPICS = [
  { value: "Order question", label: "An order", icon: "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4ZM3 6h18M16 10a4 4 0 0 1-8 0" },
  { value: "Card condition or grading", label: "Card condition", icon: "M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM9 8h6M9 12h6M9 16h3" },
  { value: "Returns & refunds", label: "Return or refund", icon: "M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" },
  { value: "Selling to us", label: "Sell cards", icon: "M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8ZM7.5 7.5h.01" },
  { value: "Something else", label: "Something else", icon: "M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12Z" },
] as const;

// The questions people most often write in about, answered up front.
const FAQ = [
  {
    question: "Where is my order?",
    answer: "As soon as your parcel leaves, you get a PostNL tracking link by email. Signed in? Follow it under Deliveries in your account.",
    link: { href: "/account?section=deliveries", label: "Open deliveries" },
  },
  {
    question: "How do you describe condition?",
    answer: "Every single is checked by hand and listed with its real condition, language and finish. The photo on the product page is the card you get.",
  },
  {
    question: "Do you buy collections?",
    answer: "Yes. Pick \"Sell cards\" below and tell us what you have, its condition, and whether you have a list or photos.",
  },
  {
    question: "Can I return something?",
    answer: "Within 14 days of delivery, no reason needed. Start it online and we'll send the return details.",
    link: { href: "/returns", label: "Start a return" },
  },
];

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
  const socials = createStorefrontSocials();

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
          <h1>Talk to the shop</h1>
          <p>
            Ask about an order, a card's condition, a return, or a collection you
            want to sell. It goes straight to the person running TCGHaven.
          </p>
        </header>

        <div class={styles.layout}>
          {/* Direct channels and quick answers beside the form. */}
          <aside class={styles.counter}>
            <div class={styles.counterHead}>
              <h2>Other ways to reach us</h2>
              <p>Every message is answered within one business day, often sooner.</p>
            </div>

            <div class={styles.channels}>
              <a href={`mailto:${profile().businessEmail}`} class={styles.channel}>
                <span class={styles.channelIcon} aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m4 7 8 6 8-6" /></svg>
                </span>
                <span><small>Email</small>{profile().businessEmail}</span>
              </a>
              <a href={`tel:${profile().phone.replace(/\s+/g, "")}`} class={styles.channel}>
                <span class={styles.channelIcon} aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" /></svg>
                </span>
                <span><small>Phone</small>{profile().phone}</span>
              </a>
              <Show when={socials().instagram}>
                {href => (
                  <a href={href()} target="_blank" rel="noopener noreferrer" class={styles.channel}>
                    <span class={styles.channelIcon} aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" /></svg>
                    </span>
                    <span><small>Instagram</small>Message us there</span>
                  </a>
                )}
              </Show>
            </div>

            <div class={styles.faq}>
              <h2>Quick answers</h2>
              <For each={FAQ}>
                {item => (
                  <details>
                    <summary>
                      {item.question}
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                    </summary>
                    <p>{item.answer}</p>
                    <Show when={"link" in item && item.link}>
                      {link => <A href={link().href} class={styles.faqLink}>{link().label}</A>}
                    </Show>
                  </details>
                )}
              </For>
            </div>
          </aside>

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
                    Thanks, {name() || "friend"}. Alex will reply to {email()},
                    usually within one business day.
                  </p>
                  <A href="/products" class={styles.successLink}>Back to the shop</A>
                </div>
              }
            >
              <h2 id="contact-form-title" class={styles.formTitle}>Send a message</h2>

              <form class={styles.form} onSubmit={onSubmit}>
                <fieldset class={styles.topicField}>
                  <legend>What's it about?</legend>
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
                          <span>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={item.icon} /></svg>
                            {item.label}
                          </span>
                        </label>
                      )}
                    </For>
                  </div>
                </fieldset>

                <div class={styles.row}>
                  <div class={styles.field}>
                    <label for="name">Your name</label>
                    <input
                      id="name"
                      type="text"
                      autocomplete="name"
                      required
                      value={name()}
                      onInput={event => setName(event.currentTarget.value)}
                    />
                  </div>

                  <div class={styles.field}>
                    <label for="email">Email address</label>
                    <input
                      id="email"
                      type="email"
                      autocomplete="email"
                      required
                      value={email()}
                      onInput={event => setEmail(event.currentTarget.value)}
                    />
                  </div>
                </div>

                <div class={styles.field}>
                  <div class={styles.messageLabel}>
                    <label for="message">Message</label>
                    <span>{message().length} / 3000</span>
                  </div>
                  <textarea
                    id="message"
                    placeholder={MESSAGE_PROMPTS[topic()]}
                    required
                    minlength="10"
                    maxlength="3000"
                    value={message()}
                    onInput={event => setMessage(event.currentTarget.value)}
                  />
                </div>

                <Show when={formError()}>
                  <p class={styles.formError} role="alert">{formError()}</p>
                </Show>

                <div class={styles.formFoot}>
                  <button type="submit" class={styles.submit} disabled={loading()}>
                    <Show when={loading()}>
                      <span class={styles.spinner} />
                    </Show>
                    {loading() ? "Sending..." : "Send message"}
                  </button>
                  <p>We use your details only to answer this message.</p>
                </div>
              </form>
            </Show>
          </section>
        </div>
      </div>
    </main>
  );
}
