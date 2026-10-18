import { createSignal } from "solid-js";
import { render } from "solid-js/web";

/** Keep the dashboard and unsaved edits in place while verifying a money action. */
export async function verifyOwner() {
  const response = await fetch("/api/admin/security", { credentials: "same-origin" });
  if (!response.ok) return false;
  const state = await response.json() as { enabled: boolean; fresh: boolean };
  if (!state.enabled) { window.location.assign("/admin/security"); return false; }
  if (state.fresh) return true;
  return new Promise<boolean>(resolve => {
    const dialog = document.createElement("dialog");
    dialog.style.cssText = "width:min(420px,calc(100vw - 32px));padding:28px;background:#111713;color:#fff;border:1px solid #34483d;border-radius:12px";
    dialog.setAttribute("aria-label", "Verify owner action");
    document.body.append(dialog);
    let dispose: () => void;
    const finish = (result: boolean) => { dialog.close(); dispose(); dialog.remove(); resolve(result); };
    dialog.addEventListener("cancel", event => { event.preventDefault(); finish(false); });
    dispose = render(() => {
      const [password, setPassword] = createSignal("");
      const [code, setCode] = createSignal("");
      const [error, setError] = createSignal("");
      const [busy, setBusy] = createSignal(false);
      const inputStyle = "display:block;width:100%;box-sizing:border-box;margin:8px 0 18px;padding:12px;background:#080d0a;color:white;border:1px solid #43554a;border-radius:6px";
      return <form onSubmit={async event => {
        event.preventDefault(); if (busy()) return;
        setBusy(true); setError("");
        try {
          const result = await fetch("/api/admin/security", { method: "POST", credentials: "same-origin",
            headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: password(), code: code() }), signal: AbortSignal.timeout(20_000) });
          if (result.ok) { setPassword(""); setCode(""); finish(true); return; }
          setError("Verification failed. Check your password and current authenticator code.");
        } catch { setError("Verification is unavailable. Please try again."); }
        finally { setBusy(false); }
      }}>
        <h2>Verify owner action</h2><p>Confirm your password and authenticator code. Approval lasts five minutes on this session only.</p>
        <label>Password<input style={inputStyle} type="password" autocomplete="current-password" required maxlength={128} value={password()} onInput={e => setPassword(e.currentTarget.value)} /></label>
        <label>Authenticator code<input style={inputStyle} inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" required maxlength={6} value={code()} onInput={e => setCode(e.currentTarget.value.replace(/\D/g, ""))} /></label>
        <p role="alert">{error()}</p>
        <button type="submit" disabled={busy()}>{busy() ? "Verifying…" : "Verify"}</button>{" "}
        <button type="button" disabled={busy()} onClick={() => finish(false)}>Cancel</button>
      </form>;
    }, dialog);
    dialog.showModal();
  });
}
