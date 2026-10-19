import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import { createSignal, For, onCleanup, Show } from "solid-js";

const CODE_LENGTH = 6;
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
  const [codeFocused, setCodeFocused] = createSignal(false);
  let resendTimer: number | undefined;
  let formRef: HTMLFormElement | undefined;

  // Digits only for app and email codes; submit as soon as all six are in.
  const updateDigits = (input: HTMLInputElement) => {
    const digits = input.value.replace(/\D/g, "").slice(0, CODE_LENGTH);
    // Write back to the field too: if a letter was typed the signal stays the
    // same, so the field would otherwise keep showing it.
    input.value = digits;
    setCode(digits);
    setError("");
    if (digits.length === CODE_LENGTH && !loading()) formRef?.requestSubmit();
  };

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

    const current = await authClient.getSession();
    window.location.assign(current.data?.user && (current.data.user as { role?: string }).role === "admin" ? "/admin" : "/account");
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

  const heading = () =>
    method() === "authenticator"
      ? "Enter your app code"
      : method() === "email"
        ? "Check your email"
        : "Use a recovery code";

  const description = () =>
    method() === "authenticator"
      ? "Open your authenticator app and type the six-digit code for TCGHaven."
      : method() === "email"
        ? "We sent a six-digit code to your verified email address."
        : "Type one of the backup codes you saved when you turned on two-step verification.";

  return (
    <main class={styles.page}>
      <Title>Verify your sign in | TCGHaven</Title>

      <div class={styles.column}>
        <header class={styles.topbar}>
          <A href="/" class={styles.logo} aria-label="TCGHaven home">
            <img src="/images/logo-mark.png" alt="" width="409" height="379" />
            <span>TCG<span>Haven</span></span>
          </A>
          <A href="/login" class={styles.back}>Back to sign in</A>
        </header>

        <span class={styles.lock} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
            <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
            <circle cx="12" cy="15.5" r="1.2" fill="currentColor" />
          </svg>
        </span>

        <h1>{heading()}</h1>
        <p class={styles.lead}>{description()}</p>

        <form ref={formRef} class={styles.form} onSubmit={submit}>
          <Show
            when={method() !== "recovery"}
            fallback={
              <label class={styles.recovery}>
                <span class={styles.srOnly}>Recovery code</span>
                <input
                  type="text"
                  autocomplete="one-time-code"
                  maxlength={64}
                  placeholder="xxxxx-xxxxx"
                  value={code()}
                  autofocus
                  required
                  onInput={event => setCode(event.currentTarget.value)}
                />
              </label>
            }
          >
            {/* One real input laid over six boxes: paste, SMS/email autofill
                and screen readers all treat it as a single code field. */}
            <label class={styles.otp} classList={{ [styles.otpError]: Boolean(error()) }}>
              <span class={styles.srOnly}>
                {method() === "email" ? "Email security code" : "Authenticator code"}
              </span>
              <input
                type="text"
                inputmode="numeric"
                autocomplete="one-time-code"
                pattern="[0-9]*"
                value={code()}
                autofocus
                required
                disabled={method() === "email" && !emailSent()}
                onInput={event => updateDigits(event.currentTarget)}
                onFocus={() => setCodeFocused(true)}
                onBlur={() => setCodeFocused(false)}
              />
              <For each={Array.from({ length: CODE_LENGTH }, (_, index) => index)}>
                {index => (
                  <span
                    class={styles.digit}
                    classList={{
                      [styles.digitSecondGroup]: index === CODE_LENGTH / 2,
                      [styles.digitFilled]: index < code().length,
                      [styles.digitActive]:
                        codeFocused() &&
                        (index === code().length ||
                          (code().length === CODE_LENGTH && index === CODE_LENGTH - 1)),
                    }}
                    aria-hidden="true"
                  >
                    {code()[index] ?? ""}
                  </span>
                )}
              </For>
            </label>
          </Show>

          <Show when={error()}>
            <p class={styles.error} role="alert">{error()}</p>
          </Show>
          <Show when={!error() && notice()}>
            <p class={styles.notice} role="status">{notice()}</p>
          </Show>

          <label class={styles.trust}>
            <input
              type="checkbox"
              checked={trustDevice()}
              onChange={event => setTrustDevice(event.currentTarget.checked)}
            />
            <span class={styles.switch} aria-hidden="true"><span /></span>
            <span>Remember this device for 30 days</span>
          </label>

          <button
            class={styles.primary}
            disabled={loading() || sendingEmail() || (method() === "email" && !emailSent())}
          >
            {loading() ? "Checking code…" : "Verify and continue"}
          </button>

          <Show when={method() === "email" && emailSent()}>
            <button
              type="button"
              class={styles.resend}
              disabled={sendingEmail() || resendLocked()}
              onClick={() => void resendEmailCode()}
            >
              {sendingEmail()
                ? "Sending a new code…"
                : resendLocked()
                  ? "New code sent. You can resend in a moment."
                  : "Didn't get it? Send a new code"}
            </button>
          </Show>
        </form>

        <div class={styles.other}>
          <span>Other ways to verify</span>
          <div>
            <For each={METHODS.filter(option => option.id !== method())}>
              {option => (
                <button
                  type="button"
                  class={styles.otherOption}
                  disabled={sendingEmail() || loading()}
                  onClick={() => void selectMethod(option.id)}
                >
                  {option.id === "authenticator"
                    ? "Use my authenticator app"
                    : option.id === "email"
                      ? "Email me a code"
                      : "Use a recovery code"}
                </button>
              )}
            </For>
          </div>
        </div>
      </div>
    </main>
  );
}
