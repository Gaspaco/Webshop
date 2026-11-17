import { Title } from "@solidjs/meta";
import { A, Navigate } from "@solidjs/router";
import { createSignal, For, Show } from "solid-js";
import QRCode from "qrcode";
import { authClient } from "~/lib/auth-client";
import styles from "./security.module.scss";

export default function OwnerSecurity() {
  const session = authClient.useSession();
  const [password, setPassword] = createSignal("");
  const [code, setCode] = createSignal("");
  const [qr, setQr] = createSignal("");
  const [backupCodes, setBackupCodes] = createSignal<string[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const [failed, setFailed] = createSignal(false);
  const [enabled, setEnabled] = createSignal(false);
  const active = () => enabled() || Boolean((session().data?.user as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled);

  async function setup(event: SubmitEvent) {
    event.preventDefault(); if (busy()) return;
    setBusy(true); setMessage(""); setFailed(false);
    try {
      const result = await authClient.twoFactor.enable({ password: password(), issuer: "TCGHaven", method: "totp" });
      if (result.error || !result.data || result.data.method !== "totp") throw new Error("Check your current password and try again.");
      setQr(await QRCode.toDataURL(result.data.totpURI, { width: 220, margin: 2 }));
      setBackupCodes(result.data.backupCodes); setPassword("");
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : "Setup could not be started. Please try again."); }
    finally { setBusy(false); }
  }
  async function verify(event: SubmitEvent) {
    event.preventDefault(); if (busy() || !/^\d{6}$/.test(code())) return;
    setBusy(true); setMessage(""); setFailed(false);
    try {
      const result = await authClient.twoFactor.verifyTotp({ code: code() });
      if (result.error) throw new Error("That code was not accepted. Use the latest code from your authenticator app.");
      setEnabled(true); setQr(""); setCode("");
      setMessage("Two-factor authentication is active. Keep your recovery codes somewhere safe.");
      await authClient.getSession({ query: { disableCookieCache: true } });
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : "Verification could not be completed. Try again."); }
    finally { setBusy(false); }
  }
  async function manage(action: "codes" | "disable") {
    if (busy() || !password()) return;
    if (action === "disable" && !window.confirm("Turn off the second check at sign-in for this admin account?")) return;
    setBusy(true); setMessage(""); setFailed(false);
    try {
      if (action === "codes") {
        const result = await authClient.twoFactor.generateBackupCodes({ password: password() });
        if (result.error || !result.data) throw new Error("Recovery codes could not be generated. Check your password and try again.");
        setBackupCodes(result.data.backupCodes);
        setMessage("New recovery codes generated. Previous recovery codes no longer work.");
      } else {
        const result = await authClient.twoFactor.disable({ password: password() });
        if (result.error) throw new Error("Two-factor authentication could not be disabled. Check your password and try again.");
        setEnabled(false); setBackupCodes([]);
        // Refresh the session store before showing enrollment again.
        await authClient.$store.notify("$sessionSignal");
        setMessage("Two-factor authentication is off. You can set it up again below.");
      }
      setPassword("");
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : "The change could not be completed. Please try again."); }
    finally { setBusy(false); }
  }
  return <main class={styles.page}>
    <Title>Account security | TCGHaven</Title>
    <Show when={!session().isPending} fallback={<p role="status">Loading account security…</p>}>
      <Show when={!session().error} fallback={<p role="alert">Account security could not be loaded. Reload this page to try again.</p>}>
        <Show when={session().data?.user} fallback={<Navigate href="/admin/login" />}>
          <Show when={(session().data?.user as { role?: string })?.role === "admin"} fallback={<Navigate href="/account?section=security" />}>
            <A href="/admin">Back to dashboard</A>
            <h1>Protect your admin account</h1>
            <p>An authenticator app adds a second check at sign-in. Setup is optional and does not interrupt access until you confirm a code.</p>
            <Show when={!active()} fallback={<>
              <p>Two-factor authentication is active on this account.</p>
              <form onSubmit={event => { event.preventDefault(); void manage("codes"); }}>
                <label>Current password<input type="password" required autocomplete="current-password" value={password()} onInput={event => setPassword(event.currentTarget.value)} /></label>
                <button type="submit" disabled={busy()}>{busy() ? "Updating…" : "Generate new recovery codes"}</button>
                <button type="button" disabled={busy() || !password()} onClick={() => manage("disable")}>Turn off two-factor authentication</button>
              </form>
            </>}>
              <Show when={qr()} fallback={<form onSubmit={setup}>
                <label>Current password<input type="password" required autocomplete="current-password" value={password()} onInput={event => setPassword(event.currentTarget.value)} /></label>
                <button type="submit" disabled={busy()}>{busy() ? "Preparing…" : "Set up authenticator"}</button>
              </form>}>
                <p>Scan this code in your authenticator app, then enter the six-digit code to finish.</p>
                <img class={styles.qr} src={qr()} alt="Authenticator setup QR code" />
                <form onSubmit={verify}>
                  <label>Authenticator code<input required inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" value={code()} onInput={event => setCode(event.currentTarget.value.replace(/\D/g, ""))} /></label>
                  <button type="submit" disabled={busy() || code().length !== 6}>{busy() ? "Verifying…" : "Activate two-factor authentication"}</button>
                </form>
              </Show>
            </Show>
            <Show when={backupCodes().length}><section class={styles.codes} aria-label="Recovery codes"><strong>Save your recovery codes</strong><p>Each code works once if you lose your authenticator. They are only shown during setup. Do not share them.</p><ul><For each={backupCodes()}>{value => <li>{value}</li>}</For></ul><button type="button" onClick={() => setBackupCodes([])}>Hide recovery codes</button></section></Show>
            <Show when={message()}><p role={failed() ? "alert" : "status"}>{message()}</p></Show>
          </Show>
        </Show>
      </Show>
    </Show>
  </main>;
}
