import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import { createSignal, For, onCleanup, Show } from "solid-js";
import { authClient } from "~/lib/auth-client";
import styles from "./index.module.scss";

type VerificationMethod = "authenticator" | "email" | "recovery";

const METHODS: Array<{
  id: VerificationMethod;
  label: string;
  description: string;
}> = [
  {
    id: "authenticator",
    label: "Authenticator app",
    description: "Use the current six-digit app code.",
  },
  {
    id: "email",
    label: "Email code",
    description: "Receive a one-time code by email.",
  },
  {
    id: "recovery",
    label: "Recovery code",
    description: "Use one of your saved backup codes.",
  },
];

export default function TwoFactorChallenge() {
  const [method, setMethod] = createSignal<VerificationMethod>("authenticator");
  const [code, setCode] = createSignal("");
  const [trustDevice, setTrustDevice] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [sendingEmail, setSendingEmail] = createSignal(false);
  const [emailSent, setEmailSent] = createSignal(false);
  const [resendLocked, setResendLocked] = createSignal(false);
  const [notice, setNotice] = createSignal("");
  const [error, setError] = createSignal("");
  let resendTimer: number | undefined;

  onCleanup(() => {
    if (resendTimer !== undefined) window.clearTimeout(resendTimer);
  });

  const lockResend = () => {
    setResendLocked(true);
    if (resendTimer !== undefined) window.clearTimeout(resendTimer);
    resendTimer = window.setTimeout(() => setResendLocked(false), 30_000);
  };

  const sendEmailCode = async (resend = false) => {
    if (sendingEmail() || (resend && resendLocked())) return;

    setSendingEmail(true);
    setError("");
    setNotice(resend ? "Sending a new code…" : "Sending a code to your verified email…");

    try {
      const result = await authClient.twoFactor.sendOtp();
      if (result.error) {
        setNotice("");
        setError(
          result.error.status === 429
            ? "Too many email-code requests. Wait a few minutes and try again."
            : resend
              ? "A new code could not be sent. Try again or use your authenticator."
              : "We could not send an email code. Use your authenticator or recovery code.",
        );
        return;
      }

      setEmailSent(true);
      lockResend();
      setNotice(
        resend
          ? "A new code was sent. Only this newest code will work."
          : "Code sent to your verified email. It expires in 5 minutes.",
      );
    } catch {
      setNotice("");
      setError(
        resend
          ? "We could not send a new code. Try again or use your authenticator."
          : "We could not reach the email service. Use your authenticator or recovery code.",
      );
    } finally {
      setSendingEmail(false);
    }
  };

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    const normalizedCode = code().replace(/\s+/g, "");

    if (!normalizedCode) {
      setError(
        method() === "authenticator"
          ? "Enter the six-digit code from your authenticator app."
          : method() === "email"
            ? "Enter the six-digit code sent to your email."
          : "Enter one of your recovery codes.",
      );
      return;
    }

    setLoading(true);
    setError("");

    const result = await (method() === "authenticator"
      ? authClient.twoFactor.verifyTotp({
          code: normalizedCode,
          trustDevice: trustDevice(),
        })
      : method() === "email"
        ? authClient.twoFactor.verifyOtp({
            code: normalizedCode,
            trustDevice: trustDevice(),
          })
        : authClient.twoFactor.verifyBackupCode({
            code: normalizedCode,
            trustDevice: trustDevice(),
          }));

    setLoading(false);

    if (result.error) {
      const isLocked =
        result.error.code === "ACCOUNT_TEMPORARILY_LOCKED" ||
        result.error.status === 429;
      setError(
        isLocked
          ? "Too many incorrect attempts. Try again in 15 minutes."
          : "That code was not accepted. Check it and try again.",
      );
      return;
    }

    window.location.assign("/account");
  };

  const selectMethod = async (nextMethod: VerificationMethod) => {
    if (nextMethod === method() || sendingEmail()) return;

    setMethod(nextMethod);
    setCode("");
    setError("");
    setNotice("");

    if (nextMethod !== "email") return;
    if (emailSent()) {
      setNotice("Use the most recent code sent to your verified email. It expires in 5 minutes.");
      return;
    }

    await sendEmailCode(false);
  };

  const resendEmailCode = async () => {
    await sendEmailCode(true);
  };

  return (
    <main class={styles.page}>
      <Title>Verify your sign in | TCGHaven</Title>

      <section class={styles.shell}>
        <div class={styles.topbar}>
          <A href="/" class={styles.logo} aria-label="TCGHaven home">
            TCG<span>Haven</span>
          </A>
          <span class={styles.secureLabel}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              <rect x="5" y="10" width="14" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            Secure sign-in
          </span>
        </div>

        <div class={styles.intro}>
          <div class={styles.securityMark} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M12 3 5.5 5.7v5.6c0 4.1 2.6 7.8 6.5 9.7 3.9-1.9 6.5-5.6 6.5-9.7V5.7L12 3Z" />
              <path d="m9.2 12.1 1.8 1.8 3.9-4" />
            </svg>
          </div>
          <div>
            <h1>Verify your sign in</h1>
            <p>
              {method() === "authenticator"
                ? "Enter the current code from your authenticator app."
                : method() === "email"
                  ? "Enter the code sent to your verified email address."
                : "Enter one unused recovery code from your saved set."}
            </p>
          </div>
        </div>

        <span class={styles.methodLabel}>Choose verification method</span>
        <div class={styles.methodPicker} aria-label="Verification method">
          <For each={METHODS}>
            {option => (
              <button
                type="button"
                class={styles.methodOption}
                classList={{ [styles.methodOptionActive]: method() === option.id }}
                aria-pressed={method() === option.id}
                aria-label={`${option.label}. ${option.description}`}
                disabled={sendingEmail() || loading()}
                onClick={() => void selectMethod(option.id)}
              >
                <strong>{option.label}</strong>
              </button>
            )}
          </For>
        </div>

        <Show when={notice()}>
          <p class={styles.notice} role="status">{notice()}</p>
        </Show>

        <form onSubmit={submit}>
          <label>
            <span class={styles.fieldHeading}>
              <span>
                {method() === "authenticator"
                  ? "Authenticator code"
                  : method() === "email"
                    ? "Email security code"
                  : "Recovery code"}
              </span>
              <small>{method() === "recovery" ? "Single use" : "6 digits"}</small>
            </span>
            <input
              type="text"
              inputmode={method() === "recovery" ? "text" : "numeric"}
              autocomplete="one-time-code"
              maxlength={method() === "recovery" ? 64 : 6}
              placeholder={
                method() === "recovery" ? "Recovery code" : "000000"
              }
              value={code()}
              autofocus
              required
              onInput={event => setCode(event.currentTarget.value)}
            />
          </label>

          <label class={styles.trustDevice}>
            <input
              type="checkbox"
              checked={trustDevice()}
              onChange={event => setTrustDevice(event.currentTarget.checked)}
            />
            <span>Trust this device for 30 days</span>
          </label>

          <Show when={error()}>
            <p class={styles.error} role="alert">
              {error()}
            </p>
          </Show>

          <button
            class={styles.primary}
            disabled={loading() || sendingEmail() || (method() === "email" && !emailSent())}
          >
            {loading() ? "Checking code" : "Verify and continue"}
          </button>
        </form>

        <Show when={method() === "email" && emailSent()}>
          <button
            type="button"
            class={styles.methodSwitch}
            disabled={sendingEmail() || resendLocked()}
            onClick={() => void resendEmailCode()}
          >
            {sendingEmail()
              ? "Sending a new code"
              : resendLocked()
                ? "Code sent — resend available shortly"
                : "Did not receive it? Send another code"}
          </button>
        </Show>

        <footer class={styles.footer}>
          <A href="/login" class={styles.cancel}>Return to sign in</A>
          <span>Protected by two-step verification</span>
        </footer>
      </section>
    </main>
  );
}
