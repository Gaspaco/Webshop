import { A } from "@solidjs/router";
import type { ParentProps } from "solid-js";
import styles from "./AuthFlowShell.module.scss";

type AuthFlowShellProps = ParentProps<{
  title: string;
  description: string;
  note: string;
  icon: "mail" | "key";
}>;

export default function AuthFlowShell(props: AuthFlowShellProps) {
  return (
    <main class={styles.page}>
      <aside class={styles.brandPanel} aria-label="Account security">
        <div class={styles.brandMesh} />
        <A href="/" class={styles.brandLogo}>
          TCG<span>Haven</span>
        </A>

        <div class={styles.brandCopy}>
          <p class={styles.brandLabel}>Protected account access</p>
          <h2>Your collection stays yours.</h2>
          <p>
            Short-lived links, secure cookies, and server-side checks protect
            every account action.
          </p>
        </div>

        <ul class={styles.securityList}>
          <li>
            <CheckIcon /> One-time verification links
          </li>
          <li>
            <CheckIcon /> Passwords stored as secure hashes
          </li>
          <li>
            <CheckIcon /> Sessions can be revoked instantly
          </li>
        </ul>
      </aside>

      <section class={styles.content}>
        <div class={styles.inner}>
          <A href="/" class={styles.logo}>
            TCG<span>Haven</span>
          </A>

          <div class={styles.icon} aria-hidden="true">
            {props.icon === "mail" ? <MailIcon /> : <KeyIcon />}
          </div>
          <h1>{props.title}</h1>
          <p class={styles.description}>{props.description}</p>

          {props.children}

          <p class={styles.securityNote}>
            <LockIcon /> {props.note}
          </p>
        </div>
      </section>
    </main>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <circle cx="8" cy="15" r="4" />
      <path d="m11 12 8-8m-3 3 3 3m-6 0 3 3" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
