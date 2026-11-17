import { createMemo, createSignal, For, Show } from "solid-js";
import styles from "./ContactInbox.module.scss";

export type AdminContactMessage = {
  id: string;
  name: string;
  email: string;
  topic: string;
  message: string;
  status: "unread" | "read" | "resolved";
  notificationSent: boolean;
  createdAt: string;
  updatedAt: string;
};

type View = "open" | "unread" | "resolved" | "all";

const VIEWS: Array<{ id: View; label: string; matches: (item: AdminContactMessage) => boolean }> = [
  { id: "open", label: "Needs reply", matches: item => item.status !== "resolved" },
  { id: "unread", label: "Unread", matches: item => item.status === "unread" },
  { id: "resolved", label: "Resolved", matches: item => item.status === "resolved" },
  { id: "all", label: "All", matches: () => true },
];

const dateTime = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const fullStamp = new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeStyle: "short" });
const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function received(value: string) {
  const minutes = Math.round((Date.now() - Date.parse(value)) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return relative.format(-minutes, "minute");
  if (minutes < 60 * 24) return relative.format(-Math.round(minutes / 60), "hour");
  if (minutes < 60 * 24 * 7) return relative.format(-Math.round(minutes / 1440), "day");
  return dateTime.format(new Date(value));
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]!.toUpperCase()).join("") || "?";
}

async function send(method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>) {
  const response = await fetch("/api/admin/contacts", {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as { error?: string };
  return { ok: response.ok, error: result.error };
}

export default function ContactInbox(props: {
  messages: AdminContactMessage[];
  onUpdated: () => unknown;
}) {
  const [view, setView] = createSignal<View>("open");
  const [busyId, setBusyId] = createSignal("");
  const [notice, setNotice] = createSignal<{ tone: "ok" | "error"; text: string } | null>(null);
  const [replyingTo, setReplyingTo] = createSignal("");
  const [reply, setReply] = createSignal("");

  const counts = createMemo(() =>
    Object.fromEntries(VIEWS.map(entry => [entry.id, props.messages.filter(entry.matches).length])) as Record<View, number>,
  );
  const visible = createMemo(() => props.messages.filter(VIEWS.find(entry => entry.id === view())!.matches));

  const openReply = (item: AdminContactMessage) => {
    setNotice(null);
    setReply("");
    setReplyingTo(current => (current === item.id ? "" : item.id));
  };

  const run = async (id: string, action: () => Promise<{ ok: boolean; error?: string }>, fallback: string, success?: string) => {
    setBusyId(id);
    setNotice(null);
    try {
      const result = await action();
      if (!result.ok) {
        setNotice({ tone: "error", text: result.error ?? fallback });
        return false;
      }
      if (success) setNotice({ tone: "ok", text: success });
      await Promise.resolve(props.onUpdated());
      return true;
    } catch {
      setNotice({ tone: "error", text: `${fallback} Check your connection and try again.` });
      return false;
    } finally {
      setBusyId("");
    }
  };

  const sendReply = async (event: SubmitEvent, item: AdminContactMessage) => {
    event.preventDefault();
    const text = reply().trim();
    if (text.length < 2) {
      setNotice({ tone: "error", text: "Write a reply before sending it." });
      return;
    }
    const sent = await run(item.id, () => send("POST", { id: item.id, reply: text }), "The reply could not be sent.", `Reply sent to ${item.email}. The message is now resolved.`);
    if (sent) {
      setReply("");
      setReplyingTo("");
    }
  };

  const setStatus = (item: AdminContactMessage, status: AdminContactMessage["status"]) =>
    run(item.id, () => send("PATCH", { id: item.id, status }), "The message could not be updated.");

  const remove = (item: AdminContactMessage) => {
    if (!window.confirm(`Permanently delete the message from ${item.name}? This cannot be undone.`)) return;
    void run(item.id, () => send("DELETE", { id: item.id, confirmation: "DELETE" }), "The message could not be deleted.");
  };

  return (
    <div class={styles.inbox}>
      <div class={styles.toolbar}>
        <div class={styles.views} role="group" aria-label="Filter messages">
          <For each={VIEWS}>
            {entry => (
              <button type="button" aria-pressed={view() === entry.id} onClick={() => setView(entry.id)}>
                {entry.label} <span>{counts()[entry.id]}</span>
              </button>
            )}
          </For>
        </div>
      </div>

      <Show when={notice()}>
        {current => (
          <p class={styles.notice} data-tone={current().tone} role={current().tone === "error" ? "alert" : "status"}>
            {current().text}
          </p>
        )}
      </Show>

      <Show
        when={visible().length}
        fallback={
          <div class={styles.empty}>
            <strong>
              {props.messages.length === 0
                ? "No messages yet"
                : view() === "resolved"
                  ? "Nothing resolved yet"
                  : "You're all caught up"}
            </strong>
            <p>
              {props.messages.length === 0
                ? "Questions sent through the contact page land here, with a copy to your notification email."
                : view() === "resolved"
                  ? "Messages you reply to or resolve move here."
                  : "Every message has been answered or resolved."}
            </p>
          </div>
        }
      >
        <ol class={styles.list}>
          <For each={visible()}>
            {item => (
              <li class={styles.message} data-status={item.status} aria-busy={busyId() === item.id}>
                <span class={styles.avatar} aria-hidden="true">{initials(item.name)}</span>

                <div class={styles.main}>
                  <header>
                    <div class={styles.sender}>
                      <strong>
                        <Show when={item.status === "unread"}>
                          <i class={styles.unreadDot} aria-hidden="true" />
                          <span class={styles.srOnly}>Unread: </span>
                        </Show>
                        {item.name}
                      </strong>
                      <span>{item.email}</span>
                    </div>
                    <div class={styles.meta}>
                      <span class={styles.topic}>{item.topic}</span>
                      <time datetime={item.createdAt} title={fullStamp.format(new Date(item.createdAt))}>
                        {received(item.createdAt)}
                      </time>
                    </div>
                  </header>

                  <p class={styles.body}>{item.message}</p>

                  <Show when={!item.notificationSent}>
                    <p class={styles.warning}>The email notification for this message failed, so it only exists here.</p>
                  </Show>

                  <div class={styles.actions}>
                    <button
                      type="button"
                      class={styles.replyButton}
                      aria-expanded={replyingTo() === item.id}
                      aria-controls={`contact-reply-${item.id}`}
                      onClick={() => openReply(item)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5M4 9h11a5 5 0 0 1 5 5v6" /></svg>
                      {replyingTo() === item.id ? "Close reply" : "Reply"}
                    </button>
                    <Show
                      when={item.status !== "resolved"}
                      fallback={
                        <button type="button" class={styles.quiet} disabled={busyId() === item.id} onClick={() => setStatus(item, "read")}>
                          Reopen
                        </button>
                      }
                    >
                      <button type="button" class={styles.quiet} disabled={busyId() === item.id} onClick={() => setStatus(item, "resolved")}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5 10 17l9-10" /></svg>
                        Mark resolved
                      </button>
                    </Show>
                    <span class={styles.spacer} />
                    <Show when={item.status === "unread"}>
                      <button type="button" class={styles.text} disabled={busyId() === item.id} onClick={() => setStatus(item, "read")}>
                        Mark as read
                      </button>
                    </Show>
                    <a
                      class={styles.text}
                      href={`mailto:${item.email}?subject=${encodeURIComponent(`Re: ${item.topic}`)}`}
                      title={`Open your mail app and email ${item.email}`}
                    >
                      Open in mail app
                    </a>
                    <button type="button" class={styles.danger} disabled={busyId() === item.id} onClick={() => remove(item)}>
                      Delete
                    </button>
                  </div>

                  <Show when={replyingTo() === item.id}>
                    <form id={`contact-reply-${item.id}`} class={styles.replyForm} onSubmit={event => sendReply(event, item)}>
                      <div class={styles.replyHeading}>
                        <label for={`contact-reply-message-${item.id}`}>Reply to {item.name}</label>
                        <span>Re: {item.topic}</span>
                      </div>
                      <textarea
                        id={`contact-reply-message-${item.id}`}
                        value={reply()}
                        maxLength={5_000}
                        rows={6}
                        placeholder={`Hi ${item.name.split(" ")[0]},`}
                        disabled={busyId() === item.id}
                        onInput={event => setReply(event.currentTarget.value)}
                        required
                      />
                      <div class={styles.replyActions}>
                        <span>{reply().length.toLocaleString()} / 5,000</span>
                        <button type="button" class={styles.text} disabled={busyId() === item.id} onClick={() => setReplyingTo("")}>
                          Cancel
                        </button>
                        <button type="submit" class={styles.send} disabled={busyId() === item.id || reply().trim().length < 2}>
                          {busyId() === item.id ? "Sending…" : "Send reply"}
                        </button>
                      </div>
                    </form>
                  </Show>
                </div>
              </li>
            )}
          </For>
        </ol>
      </Show>
    </div>
  );
}
