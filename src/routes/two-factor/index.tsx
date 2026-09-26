import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import { createSignal, For, Show } from "solid-js";
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
  const [notice, setNotice] = createSignal("");
  const [error, setError] = createSignal("");

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

    if (nextMethod !== "email" || emailSent()) return;

    setSendingEmail(true);
    try {
      const result = await authClient.twoFactor.sendOtp();
      if (result.error) {
        setError(
          result.error.status === 429
            ? "Too many email-code requests. Wait a few minutes and try again."
            : "We could not send an email code. Use your authenticator or recovery code.",
        );
        return;
      }

      setEmailSent(true);
      setNotice("A six-digit code was sent to your verified email. It expires in 5 minutes.");
    } catch {
      setError(
        "We could not reach the email service. Use your authenticator or recovery code.",
      );
    } finally {
      setSendingEmail(false);
    }
  };

  const resendEmailCode = async () => {
    if (sendingEmail()) return;
    setSendingEmail(true);
    setError("");
    setNotice("");

    try {
      const result = await authClient.twoFactor.sendOtp();
      if (result.error) {
        setError(
          result.error.status === 429
            ? "Too many email-code requests. Wait a few minutes and try again."
            : "A new code could not be sent. Try again or use your authenticator.",
        );
        return;
      }

      setNotice("A new six-digit code was sent. Only the newest code will work.");
    } catch {
      setError(
        "We could not reach the email service. Try again or use your authenticator.",
      );
    } finally {
      setSendingEmail(false);
    }
  };

  return (
    <main class={styles.page}>
      <Title>Verify your sign in | TCGHaven</Title>

      <section class={styles.shell}>
        <A href="/" class={styles.logo} aria-label="TCGHaven home">
          TCG<span>Haven</span>
        </A>

        <div class={styles.securityMark} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M12 3 5.5 5.7v5.6c0 4.1 2.6 7.8 6.5 9.7 3.9-1.9 6.5-5.6 6.5-9.7V5.7L12 3Z" />
            <path d="m9.2 12.1 1.8 1.8 3.9-4" />
          </svg>
        </div>

        <h1>Confirm it is you</h1>
        <p>
          {method() === "authenticator"
            ? "Open your authenticator app and enter the current code."
            : method() === "email"
              ? "Enter the one-time code sent to your verified email address."
            : "Use one unused recovery code from the set you saved."}
        </p>

        <div class={styles.methodPicker} aria-label="Verification method">
          <For each={METHODS}>
            {option => (
              <button
                type="button"
                class={styles.methodOption}
                classList={{ [styles.methodOptionActive]: method() === option.id }}
                aria-pressed={method() === option.id}
                disabled={sendingEmail() || loading()}
                onClick={() => void selectMethod(option.id)}
              >
                <strong>{option.label}</strong>
                <span>{option.description}</span>
              </button>
            )}
          </For>
        </div>

        <Show when={notice()}>
          <p class={styles.notice} role="status">{notice()}</p>
        </Show>

        <form onSubmit={submit}>
          <label>
            <span>
              {method() === "authenticator"
                ? "Authenticator code"
                : method() === "email"
                  ? "Email security code"
                : "Recovery code"}
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
            {loading() ? "Checking code" : "Verify sign in"}
          </button>
        </form>

        <Show when={method() === "email" && emailSent()}>
          <button
            type="button"
            class={styles.methodSwitch}
            disabled={sendingEmail()}
            onClick={() => void resendEmailCode()}
          >
            {sendingEmail() ? "Sending a new code" : "Send a new email code"}
          </button>
        </Show>

        <A href="/login" class={styles.cancel}>
          Return to sign in
        </A>
      </section>
    </main>
  );
}
