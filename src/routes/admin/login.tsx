import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import { createEffect, createSignal, Show } from "solid-js";
import { authClient } from "~/lib/auth-client";
import styles from "./login.module.scss";

export default function AdminLogin() {
  const session = authClient.useSession();
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [showPassword, setShowPassword] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");

  createEffect(() => {
    const current = session().data?.user as { role?: string } | undefined;
    if (current?.role === "admin") window.location.replace("/admin");
  });

  const signIn = async (event: SubmitEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const result = await authClient.signIn.email({
        email: email().trim(),
        password: password(),
      });

      if (result.error) {
        setError(
          result.error.status === 429
            ? "Too many sign-in attempts. Wait a minute and try again."
            : "The owner email or password is incorrect.",
        );
        return;
      }

      if (result.data && "twoFactorRedirect" in result.data) return;

      const response = await fetch("/api/admin/dashboard", {
        credentials: "same-origin",
      });
      if (response.status === 403) {
        await authClient.signOut();
        setError("This account does not have owner access.");
        return;
      }
      if (!response.ok) {
        setError("Owner access could not be checked. Try again.");
        return;
      }

      window.location.assign("/admin");
    } catch {
      setError("The owner login is unavailable right now.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main class={styles.page}>
      <Title>Owner sign in | TCGHaven</Title>
      <A href="/" class={styles.backLink}>Return to storefront</A>

      <section class={styles.loginPanel}>
        <div class={styles.brand}>
          <img src="/images/logo-mark.png" alt="" />
          <span>TCGHaven</span>
        </div>
        <p class={styles.context}>Private shop operations</p>
        <h1>Owner sign in</h1>
        <p class={styles.intro}>
          Manage the catalogue, stock, orders, and customer activity.
        </p>

        <form onSubmit={signIn}>
          <label>
            <span>Owner email</span>
            <input
              type="email"
              autocomplete="username"
              required
              value={email()}
              onInput={event => setEmail(event.currentTarget.value)}
            />
          </label>

          <label>
            <span>Password</span>
            <div class={styles.passwordField}>
              <input
                type={showPassword() ? "text" : "password"}
                autocomplete="current-password"
                required
                value={password()}
                onInput={event => setPassword(event.currentTarget.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword(value => !value)}
                aria-label={showPassword() ? "Hide password" : "Show password"}
              >
                {showPassword() ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          <Show when={error()}>
            <p class={styles.error} role="alert">{error()}</p>
          </Show>

          <button class={styles.submit} type="submit" disabled={loading()}>
            {loading() ? "Checking access" : "Open owner dashboard"}
          </button>
        </form>

        <p class={styles.securityNote}>
          This area is restricted to administrator accounts. Sign-in attempts are rate limited.
        </p>
      </section>
    </main>
  );
}
