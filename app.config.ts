import { defineConfig } from "@solidjs/start/config";

const securityHeaders = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline'",
    "connect-src 'self' https://api.mollie.com",
    "upgrade-insecure-requests",
  ].join("; "),
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Origin-Agent-Cluster": "?1",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=(self), usb=(), interest-cohort=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-Permitted-Cross-Domain-Policies": "none",
  ...(process.env.NODE_ENV === "production"
    ? {
        "Strict-Transport-Security":
          "max-age=63072000; includeSubDomains; preload",
      }
    : {}),
};

const noStoreHeaders = {
  ...securityHeaders,
  "Cache-Control": "no-store, max-age=0",
};

export default defineConfig({
  serialization: {
    mode: "json",
  },
  server: {
    routeRules: {
      "/**": {
        headers: securityHeaders,
      },
      "/api/**": {
        headers: noStoreHeaders,
      },
    },
  },
});
