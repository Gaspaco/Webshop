/** Static/API responses deny inline scripts. SSR supplies a fresh nonce per response. */
export function contentSecurityPolicy(production: boolean, nonce?: string) {
  if (nonce && !/^[A-Za-z0-9+/]{24,64}={0,2}$/.test(nonce)) throw new Error("Invalid script nonce.");
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    `script-src 'self'${nonce ? ` 'nonce-${nonce}'` : production ? "" : " 'unsafe-inline'"}`,
    "script-src-attr 'none'",
    "frame-src 'self' https://www.youtube-nocookie.com",
    `connect-src 'self' https://api.mollie.com${production ? "" : " ws://localhost:* ws://127.0.0.1:*"}`,
    ...(production ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}
