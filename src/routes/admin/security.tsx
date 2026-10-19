import { Navigate } from "@solidjs/router";

// Preserve old bookmarks without showing an obsolete authenticator screen.
export default function OwnerSecurity() {
  return <Navigate href="/admin" />;
}
