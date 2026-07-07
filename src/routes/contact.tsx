import { Title } from "@solidjs/meta";
import { createSignal, Show } from "solid-js";
import styles from "./contact.module.scss";

export default function Contact() {
  const [name, setName] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [topic, setTopic] = createSignal("Order question");
  const [message, setMessage] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [sent, setSent] = createSignal(false);

  const onSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    if (!name().trim() || !email().trim() || !message().trim()) return;

    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSent(true);
    }, 700);
  };

  return (
    <main class={styles.page}>
      <div class={styles.wide}>
        <Title>Contact | TCGHaven</Title>

        <header class={styles.header}>
          <h1 class={styles.heading}>Get in touch</h1>
          <p class={styles.sub}>
            Question about an order, a card's condition, or something else?
            We're a small shop with real people behind it. Reach out and
            we'll get back to you.
          </p>
        </header>

        <div class={styles.layout}>
          <div class={styles.formCard}>
            <Show
              when={!sent()}
              fallback={
                <div class={styles.success} role="status">
                  <span class={styles.successIcon}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </span>
                  <p class={styles.successTitle}>Message sent</p>
                  <p class={styles.successText}>
                    Thanks, {name() || "friend"}. We've got your message and
                    will reply to {email()} as soon as we can, usually within
                    one business day.
                  </p>
                </div>
              }
            >
              <form class={styles.form} onSubmit={onSubmit}>
                <div class={styles.row}>
                  <div class={styles.field}>
                    <label class={styles.label} for="name">Name</label>
                    <input
                      id="name"
                      type="text"
                      class={styles.input}
                      placeholder="Jamie Verhoeven"
                      autocomplete="name"
                      required
                      value={name()}
                      onInput={e => setName(e.currentTarget.value)}
                    />
                  </div>

                  <div class={styles.field}>
                    <label class={styles.label} for="email">Email</label>
                    <input
                      id="email"
                      type="email"
                      class={styles.input}
                      placeholder="you@example.com"
                      autocomplete="email"
                      required
                      value={email()}
                      onInput={e => setEmail(e.currentTarget.value)}
                    />
                  </div>
                </div>

                <div class={styles.field}>
                  <label class={styles.label} for="topic">Topic</label>
                  <select
                    id="topic"
                    class={styles.select}
                    value={topic()}
                    onChange={e => setTopic(e.currentTarget.value)}
                  >
                    <option>Order question</option>
                    <option>Card condition or grading</option>
                    <option>Returns & refunds</option>
                    <option>Selling to us</option>
                    <option>Something else</option>
                  </select>
                </div>

                <div class={styles.field}>
                  <label class={styles.label} for="message">Message</label>
                  <textarea
                    id="message"
                    class={styles.textarea}
                    placeholder="Tell us what's up..."
                    required
                    value={message()}
                    onInput={e => setMessage(e.currentTarget.value)}
                  />
                </div>

                <button type="submit" class={styles.submit} disabled={loading()}>
                  <Show when={loading()}>
                    <span class={styles.spinner} />
                  </Show>
                  {loading() ? "Sending…" : "Send message"}
                </button>
              </form>
            </Show>
          </div>

          <aside class={styles.sidebar}>
            <div class={styles.infoCard}>
              <div class={styles.infoItem}>
                <span class={styles.infoIcon}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path d="m3 7 9 6 9-6" />
                  </svg>
                </span>
                <div>
                  <p class={styles.infoTitle}>Email</p>
                  <p class={styles.infoText}>
                    <a href="mailto:hello@mylittletcghaven.nl" class={styles.infoLink}>
                      hello@mylittletcghaven.nl
                    </a>
                  </p>
                </div>
              </div>

              <div class={styles.infoItem}>
                <span class={styles.infoIcon}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 3" />
                  </svg>
                </span>
                <div>
                  <p class={styles.infoTitle}>Response time</p>
                  <p class={styles.infoText}>Usually within one business day.</p>
                </div>
              </div>

              <div class={styles.infoItem}>
                <span class={styles.infoIcon}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 21s-7-4.5-9.5-9C.5 8 2 4 6 3.5A5 5 0 0 1 12 6a5 5 0 0 1 6-2.5c4 .5 5.5 4.5 3.5 8.5-2.5 4.5-9.5 9-9.5 9Z" />
                  </svg>
                </span>
                <div>
                  <p class={styles.infoTitle}>Based in</p>
                  <p class={styles.infoText}>The Netherlands, shipping across the EU.</p>
                </div>
              </div>
            </div>

            <div class={styles.socialCard}>
              <p class={styles.socialTitle}>Follow along</p>
              <nav class={styles.socials} aria-label="Social media">
                <a href="https://www.tiktok.com" target="_blank" rel="noreferrer" aria-label="TikTok">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M15.5 3c.4 2.3 1.8 3.8 4.2 4.2v3.1a10 10 0 0 1-4.2-1.1v6.2a6.4 6.4 0 1 1-5.5-6.3v3.2a3.2 3.2 0 1 0 2.3 3.1V3h3.2Z" />
                  </svg>
                </a>
                <a href="https://www.youtube.com" target="_blank" rel="noreferrer" aria-label="YouTube">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M21.6 7.2a2.8 2.8 0 0 0-2-2C17.8 4.7 12 4.7 12 4.7s-5.8 0-7.6.5a2.8 2.8 0 0 0-2 2A29 29 0 0 0 2 12a29 29 0 0 0 .4 4.8 2.8 2.8 0 0 0 2 2c1.8.5 7.6.5 7.6.5s5.8 0 7.6-.5a2.8 2.8 0 0 0 2-2A29 29 0 0 0 22 12a29 29 0 0 0-.4-4.8ZM10 15.2V8.8l5.5 3.2-5.5 3.2Z" />
                  </svg>
                </a>
                <a href="https://discord.com" target="_blank" rel="noreferrer" aria-label="Discord">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M19.7 5.3A16 16 0 0 0 15.8 4l-.5 1.1a14.7 14.7 0 0 0-6.6 0L8.2 4a16 16 0 0 0-3.9 1.3C1.8 9 1.1 12.6 1.4 16.2A15.8 15.8 0 0 0 6.2 19l1.2-1.6a10 10 0 0 1-1.8-.9l.4-.3a11.5 11.5 0 0 0 12 0l.5.3a12 12 0 0 1-1.9.9l1.2 1.6a15.8 15.8 0 0 0 4.8-2.8c.4-4.2-.7-7.8-2.9-10.9ZM8.6 14.5c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4Zm6.8 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4Z" />
                  </svg>
                </a>
                <a href="https://www.instagram.com" target="_blank" rel="noreferrer" aria-label="Instagram">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M7.4 2h9.2A5.4 5.4 0 0 1 22 7.4v9.2a5.4 5.4 0 0 1-5.4 5.4H7.4A5.4 5.4 0 0 1 2 16.6V7.4A5.4 5.4 0 0 1 7.4 2Zm-.2 2A3.2 3.2 0 0 0 4 7.2v9.6A3.2 3.2 0 0 0 7.2 20h9.6a3.2 3.2 0 0 0 3.2-3.2V7.2A3.2 3.2 0 0 0 16.8 4H7.2Zm10.3 1.5a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
                  </svg>
                </a>
              </nav>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
