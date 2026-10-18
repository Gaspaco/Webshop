// @refresh reload
import { mount, StartClient } from "@solidjs/start/client";
import { sharedConfig } from "solid-js";
import { render } from "solid-js/web";
import PatchNotes, { showsPatchNotes } from "~/components/layout/PatchNotes";

export default mount(() => <StartClient />, document.getElementById("app")!);

// Release notes live outside the server-rendered app (any extra component in
// the app shell shifted hydration keys). They mount only once hydration has
// finished: rendering while it runs makes Solid try to hydrate them too.
function mountPatchNotes() {
  if (sharedConfig.context) {
    setTimeout(mountPatchNotes, 250);
    return;
  }
  if (!showsPatchNotes(window.location.pathname)) return;
  const host = document.createElement("div");
  document.body.appendChild(host);
  render(() => <PatchNotes />, host);
}

if (document.readyState === "complete") setTimeout(mountPatchNotes, 0);
else window.addEventListener("load", () => setTimeout(mountPatchNotes, 0), { once: true });
