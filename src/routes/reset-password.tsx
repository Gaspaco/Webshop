import { Title } from "@solidjs/meta";
import { A, useSearchParams } from "@solidjs/router";
import { createSignal, Show } from "solid-js";
import AuthFlowShell from "~/components/auth/AuthFlowShell";
import styles from "~/components/auth/AuthFlowShell.module.scss";
import { authClient } from "~/lib/auth-client";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const [password, setPassword] = createSignal("");
  const [confirmation, setConfirmation] = createSignal("");
  const [showPassword, setShowPassword] = createSignal(false);
  const [status, setStatus] = createSignal<
    "idle" | "saving" | "success" | "error"
  >("idle");
  const [message, setMessage] = createSignal("");

  const token = () =>
    typeof searchParams.token === "string" ? searchParams.token : undefined;
  const invalidLink = () => !token() || searchParams.error === "INVALID_TOKEN";

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    setMessage("");

    if (password() !== confirmation()) {
      setStatus("error");
      setMessage("Passwords do not match.");
      return;
    }

    if (!token()) return;
    setStatus("saving");

    const { error } = await authClient.resetPassword({
      newPassword: password(),
      token: token()!,
    });

    if (error) {
      setStatus("error");
      setMessage(
        error.status === 429
          ? "Too many attempts. Wait a few minutes before trying again."
          : "This link is invalid or expired. Request a new reset email.",
      );
      return;
    }

    setPassword("");
    setConfirmation("");
    setStatus("success");
    setMessage("Your password has been changed. Sign in with the new password.");
  };

  return (
    <AuthFlowShell
      icon="key"
      title={status() === "success" ? "Password updated" : "Choose a new password"}
      description="Use a unique password that you do not use for another account."
      note="Reset links are short-lived. Completing a reset revokes every existing session."
    >
      <Title>Reset password | TCGHaven</Title>

      <Show
        when={!invalidLink()}
        fallback={
          <>
            <div class={`${styles.status} ${styles.error}`} role="alert">
              This reset link is invalid or has expired.
            </div>
            <div class={styles.actions}>
              <A href="/login" class={styles.primary}>
                Request a new link
              </A>
            </div>
          </>
        }
      >
        <Show
          when={status() !== "success"}
          fallback={
            <>
              <div class={`${styles.status} ${styles.success}`} role="status">
                {message()}
              </div>
              <div class={styles.actions}>
                <A href="/login" class={styles.primary}>
                  Sign in with new password
                </A>
              </div>
            </>
          }
        >
          <form class={styles.form} onSubmit={submit}>
            <label class={styles.label} for="new-password">
              New password
              <span class={styles.inputWrap}>
                <input
                  id="new-password"
                  class={styles.input}
                  type={showPassword() ? "text" : "password"}
                  autocomplete="new-password"
                  required
                  minlength={12}
                  maxlength={128}
                  value={password()}
                  onInput={event => setPassword(event.currentTarget.value)}
                />
                <button
                  type="button"
                  class={styles.passwordToggle}
                  aria-label={showPassword() ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword(value => !value)}
                >
                  {showPassword() ? "Hide" : "Show"}
                </button>
              </span>
              <span class={styles.hint}>Use at least 12 characters.</span>
            </label>

            <label class={styles.label} for="confirm-new-password">
              Confirm new password
              <span class={styles.inputWrap}>
                <input
                  id="confirm-new-password"
                  class={styles.input}
                  type={showPassword() ? "text" : "password"}
                  autocomplete="new-password"
                  required
                  minlength={12}
                  maxlength={128}
                  value={confirmation()}
                  onInput={event => setConfirmation(event.currentTarget.value)}
                />
              </span>
            </label>

            <Show when={status() === "error"}>
              <div class={`${styles.status} ${styles.error}`} role="alert">
                {message()}
              </div>
            </Show>

            <button
              type="submit"
              class={styles.primary}
              disabled={status() === "saving"}
            >
              {status() === "saving" ? "Updating password…" : "Update password"}
            </button>
          </form>
        </Show>
      </Show>
    </AuthFlowShell>
  );
}
