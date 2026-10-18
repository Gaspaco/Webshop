const AUTH_ENTRY_PATHS = new Set([
  "/", "/login", "/signup", "/verify-email", "/reset-password", "/two-factor", "/admin/login",
]);

export function safeAccountReturnPath(candidate: string | null) {
  if (!candidate?.startsWith("/") || candidate.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(candidate)) {
    return "/account";
  }
  const base = "https://return-path.invalid";
  const target = new URL(candidate, base);
  if (target.origin !== base) return "/account";
  const pathname = target.pathname.replace(/\/+$/, "") || "/";
  if (AUTH_ENTRY_PATHS.has(pathname)) return "/account";
  return `${target.pathname}${target.search}${target.hash}`;
}
