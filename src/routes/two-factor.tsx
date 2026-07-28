import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import { createSignal, Show } from "solid-js";
import { authClient } from "~/lib/auth-client";
import styles from "./two-factor.module.scss";

type VerificationMethod = "authenticator" | "recovery";

export default function TwoFactorChallenge() {
  const [method, setMethod] = createSignal<VerificationMethod>("authenticator");
  const [code, setCode] = createSignal("");
  const [trustDevice, setTrustDevice] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    const normalizedCode = code().replace(/\s+/g, "");

    if (!normalizedCode) {
      setError(
        method() === "authenticator"
          ? "Enter the six-digit code from your authenticator app."
          : "Enter one of your recovery codes.",
      );
      return;
    }

    setLoading(true);
    setError("");

    const result =
      method() === "authenticator"
        ? await authClient.twoFactor.verifyTotp({
            code: normalizedCode,
            trustDevice: trustDevice(),
          })
        : await authClient.twoFactor.verifyBackupCode({
            code: normalizedCode,
            trustDevice: trustDevice(),
          });

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

  const switchMethod = () => {
    setMethod(value =>
      value === "authenticator" ? "recovery" : "authenticator",
    );
    setCode("");
    setError("");
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
            : "Use one unused recovery code from the set you saved."}
        </p>

        <form onSubmit={submit}>
          <label>
            <span>
              {method() === "authenticator"
                ? "Authenticator code"
                : "Recovery code"}
            </span>
            <input
              type="text"
              inputmode={method() === "authenticator" ? "numeric" : "text"}
              autocomplete="one-time-code"
              maxlength={method() === "authenticator" ? 6 : 64}
              placeholder={
                method() === "authenticator" ? "000000" : "Recovery code"
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

          <button class={styles.primary} disabled={loading()}>
            {loading() ? "Checking code" : "Verify sign in"}
          </button>
        </form>

        <button
          type="button"
          class={styles.methodSwitch}
          onClick={switchMethod}
        >
          {method() === "authenticator"
            ? "Use a recovery code"
            : "Use authenticator app"}
        </button>

        <A href="/login" class={styles.cancel}>
          Return to sign in
        </A>
      </section>
    </main>
  );
}
