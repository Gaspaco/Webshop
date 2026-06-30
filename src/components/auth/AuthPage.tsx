import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { authClient } from "~/lib/auth-client";
import styles from "~/routes/auth.module.scss";

type AuthMode = "login" | "signup";

type AuthPageProps = {
  initialMode: AuthMode;
};

export default function AuthPage(props: AuthPageProps) {
  const [mode, setMode] = createSignal<AuthMode>(props.initialMode);
  const [name, setName] = createSignal("");
  const [loginEmail, setLoginEmail] = createSignal("");
  const [signupEmail, setSignupEmail] = createSignal("");
  const [loginPassword, setLoginPassword] = createSignal("");
  const [signupPassword, setSignupPassword] = createSignal("");
  const [confirmPassword, setConfirmPassword] = createSignal("");
  const [showLoginPassword, setShowLoginPassword] = createSignal(false);
  const [showSignupPassword, setShowSignupPassword] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const [loading, setLoading] = createSignal(false);

  const switchMode = (nextMode: AuthMode, event: MouseEvent) => {
    event.preventDefault();
    if (mode() === nextMode) return;

    setError(undefined);
    setLoading(false);
    setMode(nextMode);

    const nextPath = nextMode === "signup" ? "/signup" : "/login";
    window.history.pushState({ authMode: nextMode }, "", nextPath);
  };

  const submitLogin = async (event: SubmitEvent) => {
    event.preventDefault();
    setError(undefined);
    setLoading(true);

    const { error: authError } = await authClient.signIn.email({
      email: loginEmail(),
      password: loginPassword(),
    });

    setLoading(false);

    if (authError) {
      setError(
        authError.message ??
          "Couldn't sign you in. Check your details and try again.",
      );
      return;
    }

    window.location.assign("/account");
  };

  const submitSignup = async (event: SubmitEvent) => {
    event.preventDefault();
    setError(undefined);

    if (signupPassword() !== confirmPassword()) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);

    const { error: authError } = await authClient.signUp.email({
      name: name(),
      email: signupEmail(),
      password: signupPassword(),
    });

    setLoading(false);

    if (authError) {
      setError(
        authError.message ??
          "Couldn't create your account. Please try again.",
      );
      return;
    }

    window.location.assign("/account");
  };

  onMount(() => {
    const handleHistory = () => {
      setMode(window.location.pathname === "/signup" ? "signup" : "login");
      setError(undefined);
    };

    window.addEventListener("popstate", handleHistory);
    onCleanup(() => window.removeEventListener("popstate", handleHistory));
  });

  return (
    <main
      class={styles.page}
      classList={{
        [styles.loginMode]: mode() === "login",
        [styles.signupMode]: mode() === "signup",
      }}
    >
      <Title>
        {mode() === "login"
          ? "Sign in — TCGHaven"
          : "Create an account — TCGHaven"}
      </Title>

      <section
        class={`${styles.formPanel} ${styles.signupForm}`}
        aria-hidden={mode() !== "signup"}
        inert={mode() !== "signup"}
      >
        <div class={styles.formInner}>
          <A href="/" class={styles.logo}>
            TCG<span class={styles.logoAccent}>Haven</span>
          </A>

          <h1 class={styles.title}>Create your account</h1>
          <p class={styles.subtitle}>It only takes a minute.</p>

          <form class={styles.form} onSubmit={submitSignup}>
            <Show when={mode() === "signup" && error()}>
              <AuthError message={error()!} />
            </Show>

            <div class={styles.field}>
              <label class={styles.label} for="signup-name">
                Name
              </label>
              <div class={styles.inputWrap}>
                <input
                  id="signup-name"
                  type="text"
                  class={styles.input}
                  placeholder="Jamie Verhoeven"
                  autocomplete="name"
                  required
                  disabled={mode() !== "signup"}
                  value={name()}
                  onInput={event => setName(event.currentTarget.value)}
                />
              </div>
            </div>

            <div class={styles.field}>
              <label class={styles.label} for="signup-email">
                Email
              </label>
              <div class={styles.inputWrap}>
                <input
                  id="signup-email"
                  type="email"
                  class={styles.input}
                  placeholder="you@example.com"
                  autocomplete="email"
                  required
                  disabled={mode() !== "signup"}
                  value={signupEmail()}
                  onInput={event => setSignupEmail(event.currentTarget.value)}
                />
              </div>
            </div>

            <div class={styles.field}>
              <label class={styles.label} for="signup-password">
                Password
              </label>
              <div class={`${styles.inputWrap} ${styles.passwordRow}`}>
                <input
                  id="signup-password"
                  type={showSignupPassword() ? "text" : "password"}
                  class={styles.input}
                  placeholder="••••••••"
                  autocomplete="new-password"
                  required
                  minlength={8}
                  disabled={mode() !== "signup"}
                  value={signupPassword()}
                  onInput={event => setSignupPassword(event.currentTarget.value)}
                />
                <PasswordToggle
                  visible={showSignupPassword()}
                  disabled={mode() !== "signup"}
                  onToggle={() => setShowSignupPassword(value => !value)}
                />
              </div>
              <span class={styles.hint}>At least 8 characters.</span>
            </div>

            <div class={styles.field}>
              <label class={styles.label} for="confirm-password">
                Confirm password
              </label>
              <div class={styles.inputWrap}>
                <input
                  id="confirm-password"
                  type={showSignupPassword() ? "text" : "password"}
                  class={styles.input}
                  placeholder="••••••••"
                  autocomplete="new-password"
                  required
                  minlength={8}
                  disabled={mode() !== "signup"}
                  value={confirmPassword()}
                  onInput={event =>
                    setConfirmPassword(event.currentTarget.value)
                  }
                />
              </div>
            </div>

            <SubmitButton
              loading={mode() === "signup" && loading()}
              idleLabel="Create account"
              loadingLabel="Creating account…"
            />
          </form>

          <p class={styles.switchLine}>
            Already have an account?{" "}
            <a
              href="/login"
              class={styles.switchLink}
              onClick={event => switchMode("login", event)}
            >
              Sign in
            </a>
          </p>
        </div>
      </section>

      <section
        class={`${styles.formPanel} ${styles.loginForm}`}
        aria-hidden={mode() !== "login"}
        inert={mode() !== "login"}
      >
        <div class={styles.formInner}>
          <A href="/" class={styles.logo}>
            TCG<span class={styles.logoAccent}>Haven</span>
          </A>

          <h1 class={styles.title}>Sign in</h1>
          <p class={styles.subtitle}>Enter your details to access your account.</p>

          <form class={styles.form} onSubmit={submitLogin}>
            <Show when={mode() === "login" && error()}>
              <AuthError message={error()!} />
            </Show>

            <div class={styles.field}>
              <label class={styles.label} for="login-email">
                Email
              </label>
              <div class={styles.inputWrap}>
                <input
                  id="login-email"
                  type="email"
                  class={styles.input}
                  placeholder="you@example.com"
                  autocomplete="email"
                  required
                  disabled={mode() !== "login"}
                  value={loginEmail()}
                  onInput={event => setLoginEmail(event.currentTarget.value)}
                />
              </div>
            </div>

            <div class={styles.field}>
              <label class={styles.label} for="login-password">
                Password
              </label>
              <div class={`${styles.inputWrap} ${styles.passwordRow}`}>
                <input
                  id="login-password"
                  type={showLoginPassword() ? "text" : "password"}
                  class={styles.input}
                  placeholder="••••••••"
                  autocomplete="current-password"
                  required
                  minlength={8}
                  disabled={mode() !== "login"}
                  value={loginPassword()}
                  onInput={event => setLoginPassword(event.currentTarget.value)}
                />
                <PasswordToggle
                  visible={showLoginPassword()}
                  disabled={mode() !== "login"}
                  onToggle={() => setShowLoginPassword(value => !value)}
                />
              </div>
            </div>

            <SubmitButton
              loading={mode() === "login" && loading()}
              idleLabel="Sign in"
              loadingLabel="Signing in…"
            />
          </form>

          <p class={styles.switchLine}>
            New to TCGHaven?{" "}
            <a
              href="/signup"
              class={styles.switchLink}
              onClick={event => switchMode("signup", event)}
            >
              Create an account
            </a>
          </p>
        </div>
      </section>

      <section class={styles.brandPanel}>
        <div class={styles.brandMesh} />
        <div class={styles.brandMeshGlow} />

        <div>
          <h2 class={styles.brandHeadline}>Your collection has a home.</h2>
          <p class={styles.brandSub}>
            Honest grading, real stock, and every order kept together in one
            account.
          </p>
        </div>

        <svg
          class={styles.brandMotif}
          viewBox="0 0 360 230"
          fill="none"
          aria-hidden="true"
        >
          <rect
            x="183"
            y="24"
            width="118"
            height="165"
            rx="12"
            transform="rotate(12 242 106.5)"
            stroke="#F9FAFB"
            stroke-opacity="0.18"
            stroke-width="1.5"
          />
          <rect
            x="121"
            y="21"
            width="118"
            height="165"
            rx="12"
            stroke="#FBBF24"
            stroke-opacity="0.48"
            stroke-width="2"
          />
          <rect
            x="59"
            y="24"
            width="118"
            height="165"
            rx="12"
            transform="rotate(-12 118 106.5)"
            stroke="#10B981"
            stroke-opacity="0.68"
            stroke-width="2"
          />
        </svg>

        <div class={styles.benefits}>
          <span class={styles.benefitItem}>
            <CheckIcon />
            Track every order in one place
          </span>
          <span class={styles.benefitItem}>
            <CheckIcon />
            Pick up your saved wishlist
          </span>
          <span class={styles.benefitItem}>
            <CheckIcon />
            Check out faster next time
          </span>
        </div>

        <nav class={styles.socials} aria-label="Social media">
          <a
            href="https://www.tiktok.com"
            target="_blank"
            rel="noreferrer"
            aria-label="TikTok"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15.5 3c.4 2.3 1.8 3.8 4.2 4.2v3.1a10 10 0 0 1-4.2-1.1v6.2a6.4 6.4 0 1 1-5.5-6.3v3.2a3.2 3.2 0 1 0 2.3 3.1V3h3.2Z" />
            </svg>
          </a>
          <a
            href="https://www.youtube.com"
            target="_blank"
            rel="noreferrer"
            aria-label="YouTube"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M21.6 7.2a2.8 2.8 0 0 0-2-2C17.8 4.7 12 4.7 12 4.7s-5.8 0-7.6.5a2.8 2.8 0 0 0-2 2A29 29 0 0 0 2 12a29 29 0 0 0 .4 4.8 2.8 2.8 0 0 0 2 2c1.8.5 7.6.5 7.6.5s5.8 0 7.6-.5a2.8 2.8 0 0 0 2-2A29 29 0 0 0 22 12a29 29 0 0 0-.4-4.8ZM10 15.2V8.8l5.5 3.2-5.5 3.2Z" />
            </svg>
          </a>
          <a
            href="https://discord.com"
            target="_blank"
            rel="noreferrer"
            aria-label="Discord"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M19.7 5.3A16 16 0 0 0 15.8 4l-.5 1.1a14.7 14.7 0 0 0-6.6 0L8.2 4a16 16 0 0 0-3.9 1.3C1.8 9 1.1 12.6 1.4 16.2A15.8 15.8 0 0 0 6.2 19l1.2-1.6a10 10 0 0 1-1.8-.9l.4-.3a11.5 11.5 0 0 0 12 0l.5.3a12 12 0 0 1-1.9.9l1.2 1.6a15.8 15.8 0 0 0 4.8-2.8c.4-4.2-.7-7.8-2.9-10.9ZM8.6 14.5c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4Zm6.8 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4Z" />
            </svg>
          </a>
          <a
            href="https://www.instagram.com"
            target="_blank"
            rel="noreferrer"
            aria-label="Instagram"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7.4 2h9.2A5.4 5.4 0 0 1 22 7.4v9.2a5.4 5.4 0 0 1-5.4 5.4H7.4A5.4 5.4 0 0 1 2 16.6V7.4A5.4 5.4 0 0 1 7.4 2Zm-.2 2A3.2 3.2 0 0 0 4 7.2v9.6A3.2 3.2 0 0 0 7.2 20h9.6a3.2 3.2 0 0 0 3.2-3.2V7.2A3.2 3.2 0 0 0 16.8 4H7.2Zm10.3 1.5a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
            </svg>
          </a>
        </nav>
      </section>
    </main>
  );
}

function AuthError(props: { message: string }) {
  return (
    <div class={styles.error} role="alert">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4M12 16h.01" />
      </svg>
      <span>{props.message}</span>
    </div>
  );
}

function PasswordToggle(props: {
  visible: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      class={styles.passwordToggle}
      aria-label={props.visible ? "Hide password" : "Show password"}
      disabled={props.disabled}
      onClick={props.onToggle}
    >
      <Show
        when={!props.visible}
        fallback={
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M2 2l20 20" />
            <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
            <path d="M16.7 16.7A9.9 9.9 0 0 1 12 18c-5 0-9-4-10-6 .6-1.1 1.9-2.9 3.8-4.3M9.5 5.2A9.9 9.9 0 0 1 12 5c5 0 9 4 10 7-.4.7-1 1.6-1.8 2.5" />
          </svg>
        }
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </Show>
    </button>
  );
}

function SubmitButton(props: {
  loading: boolean;
  idleLabel: string;
  loadingLabel: string;
}) {
  return (
    <button type="submit" class={styles.submit} disabled={props.loading}>
      <Show when={props.loading}>
        <span class={styles.spinner} />
      </Show>
      {props.loading ? props.loadingLabel : props.idleLabel}
    </button>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
