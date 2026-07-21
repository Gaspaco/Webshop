import { Title } from "@solidjs/meta";
import { A, useSearchParams } from "@solidjs/router";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import AuthFlowShell from "~/components/auth/AuthFlowShell";
import styles from "~/components/auth/AuthFlowShell.module.scss";
import { authClient } from "~/lib/auth-client";

const PENDING_EMAIL_KEY = "tcghaven.pending-verification-email";

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = createSignal("");
  const [status, setStatus] = createSignal<
    "idle" | "sending" | "sent" | "error"
  >("idle");
  const [message, setMessage] = createSignal("");
  const [cooldown, setCooldown] = createSignal(0);
  let timer: ReturnType<typeof setInterval> | undefined;

  const verified = () => searchParams.verified === "true";
  const verificationError = () => searchParams.error;

  onMount(() => {
    setEmail(window.sessionStorage.getItem(PENDING_EMAIL_KEY) ?? "");
    if (verified()) window.sessionStorage.removeItem(PENDING_EMAIL_KEY);
  });

  onCleanup(() => {
    if (timer) clearInterval(timer);
  });

  const resend = async () => {
    if (!email() || cooldown() > 0) return;
    setStatus("sending");
    setMessage("");

    const { error } = await authClient.sendVerificationEmail({
      email: email(),
      callbackURL: `${window.location.origin}/verify-email?verified=true`,
    });

    if (error) {
      setStatus("error");
      setMessage(
        error.status === 429
          ? "Too many requests. Wait a few minutes before trying again."
          : "We could not send another email right now. Try again shortly.",
      );
      return;
    }

    setStatus("sent");
    setMessage("If that address has an account, a new link is on its way.");
    setCooldown(30);
    timer = setInterval(() => {
      setCooldown(value => {
        if (value <= 1) {
          if (timer) clearInterval(timer);
          timer = undefined;
          return 0;
        }
        return value - 1;
      });
    }, 1000);
  };

  return (
    <AuthFlowShell
      icon="mail"
      title={verified() ? "Email verified" : "Check your inbox"}
      description={
        verified()
          ? "Your email address is confirmed. You can now sign in to your account."
          : "Open the verification link we sent to finish creating your account."
      }
      note="Verification links expire after one hour and can only be used once."
    >
      <Title>Email verification | TCGHaven</Title>

      <Show when={verified()}>
        <div class={`${styles.status} ${styles.success}`} role="status">
          Verification complete. Your account is ready.
        </div>
        <div class={styles.actions}>
          <A href="/login" class={styles.primary}>
            Sign in to your account
          </A>
        </div>
      </Show>

      <Show when={!verified()}>
        <Show when={verificationError()}>
          <div class={`${styles.status} ${styles.error}`} role="alert">
            This verification link is invalid or has expired. Request a new
            link below.
          </div>
        </Show>

        <Show
          when={email()}
          fallback={
            <div class={styles.actions}>
              <A href="/login" class={styles.primary}>
                Return to sign in
              </A>
            </div>
          }
        >
          <Show when={message()}>
            <div
              class={`${styles.status} ${
                status() === "error" ? styles.error : styles.success
              }`}
              role={status() === "error" ? "alert" : "status"}
            >
              {message()}
            </div>
          </Show>

          <div class={styles.actions}>
            <button
              type="button"
              class={styles.primary}
              disabled={status() === "sending" || cooldown() > 0}
              onClick={resend}
            >
              {status() === "sending"
                ? "Sending link…"
                : cooldown() > 0
                  ? `Send again in ${cooldown()}s`
                  : "Send another link"}
            </button>
            <A href="/login" class={styles.secondary}>
              Return to sign in
            </A>
          </div>
        </Show>
      </Show>
    </AuthFlowShell>
  );
}
