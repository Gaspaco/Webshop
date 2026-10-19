import { Title } from "@solidjs/meta";
import { createSignal, For, onMount, Show } from "solid-js";
import QRCode from "qrcode";
import AuthFlowShell from "~/components/auth/AuthFlowShell";
import styles from "~/components/auth/AuthFlowShell.module.scss";
import { authClient } from "~/lib/auth-client";
import { verifyOwner } from "~/components/admin/OwnerVerification";

export default function OwnerSecurity() {
  const [ready, setReady] = createSignal(false);
  const [enabled, setEnabled] = createSignal(false);
  const [password, setPassword] = createSignal("");
  const [code, setCode] = createSignal("");
  const [qr, setQr] = createSignal("");
  const [backups, setBackups] = createSignal<string[]>([]);
  const [saved, setSaved] = createSignal(false);
  const [restoring, setRestoring] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  onMount(async () => {
    try {
      const response = await fetch("/api/admin/security");
      if (!response.ok) { window.location.replace("/admin/login"); return; }
      const result = await response.json(); setEnabled(result.enabled); setReady(true);
    } catch { setError("Owner security could not be loaded. Reload to try again."); }
  });
  const enroll = async (event: SubmitEvent) => {
    event.preventDefault(); if (busy()) return; setBusy(true); setError("");
    try {
      const result = await authClient.twoFactor.enable({ password: password(), issuer: "TCGHaven" });
      setPassword("");
      if (result.error || !result.data) throw new Error();
      setQr(await QRCode.toDataURL(result.data.totpURI, { width: 220, margin: 1 }));
      setBackups(result.data.backupCodes);
    } catch { setError("Setup failed. Check your current password and try again."); }
    finally { setBusy(false); }
  };
  const confirm = async (event: SubmitEvent) => {
    event.preventDefault(); if (busy() || !saved()) return; setBusy(true); setError("");
    try {
      const result = await authClient.twoFactor.verifyTotp({ code: code() });
      if (result.error) throw new Error();
      setCode(""); setQr(""); setBackups([]); window.location.assign("/admin");
    } catch { setError("That authenticator code was not accepted. Try the current code."); }
    finally { setBusy(false); }
  };
  return <AuthFlowShell icon="key" title="Secure your owner account" description="Two-factor authentication is required before opening the owner dashboard." note="Keep recovery codes private. Once signed in, dashboard actions do not require repeated verification.">
    <Title>Owner security | TCGHaven</Title>
    <p role="alert">{error()}</p>
    <Show when={ready()} fallback={<p>Checking owner access…</p>}>
      <Show when={!enabled()} fallback={<>
        <button class={styles.primary} onClick={async () => {
          if (await verifyOwner()) window.location.assign("/admin");
        }}>Verify and open dashboard</button>
        <button type="button" class={styles.secondary} onClick={() => setRestoring(value => !value)}>Restore authenticator on another device</button>
        <Show when={restoring()}>
          <p>If you lost your device, sign in using a recovery code first. Re-enter your password to restore the existing authenticator key.</p>
          <form class={styles.form} onSubmit={async event => {
            event.preventDefault(); if (busy()) return; setBusy(true); setError("");
            try {
              const result = await authClient.twoFactor.getTotpUri({ password: password() });
              setPassword("");
              if (result.error || !result.data) throw new Error();
              setQr(await QRCode.toDataURL(result.data.totpURI, { width: 220, margin: 1 }));
            } catch { setError("Restoration needs a recent sign-in with your app or a recovery code, plus your current password."); }
            finally { setBusy(false); }
          }}>
            <label class={styles.label}>Current password<input class={styles.input} type="password" autocomplete="current-password" required maxlength={128} value={password()} onInput={e => setPassword(e.currentTarget.value)} /></label>
            <button class={styles.primary} disabled={busy()}>Show authenticator setup</button>
          </form>
          <Show when={qr()}><img src={qr()} alt="Restore your authenticator app" width="220" height="220" /></Show>
        </Show>
      </>}>
        <Show when={qr()} fallback={<form class={styles.form} onSubmit={enroll}>
          <label class={styles.label}>Current password<input class={styles.input} type="password" autocomplete="current-password" required maxlength={128} value={password()} onInput={e => setPassword(e.currentTarget.value)} /></label>
          <button class={styles.primary} disabled={busy()}>Set up authenticator</button>
        </form>}>
          <img src={qr()} alt="Scan in your authenticator app" width="220" height="220" />
          <p>Save these recovery codes somewhere private. They are shown only during setup.</p>
          <pre><For each={backups()}>{backup => <>{backup}{"\n"}</>}</For></pre>
          <form class={styles.form} onSubmit={confirm}>
            <label><input type="checkbox" checked={saved()} onChange={e => setSaved(e.currentTarget.checked)} /> I saved my recovery codes</label>
            <label class={styles.label}>Authenticator code<input class={styles.input} inputmode="numeric" autocomplete="one-time-code" required pattern="[0-9]{6}" maxlength={6} value={code()} onInput={e => setCode(e.currentTarget.value.replace(/\D/g, ""))} /></label>
            <button class={styles.primary} disabled={busy() || !saved()}>Enable owner protection</button>
          </form>
        </Show>
      </Show>
    </Show>
  </AuthFlowShell>;
}
