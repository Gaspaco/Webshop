import { defineConfig } from "@solidjs/start/config";

const isProduction =
  process.env.NODE_ENV === "production" || process.argv.includes("build");

const securityHeaders = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "script-src 'self' 'unsafe-inline'",
    `connect-src 'self' https://api.mollie.com${
      isProduction ? "" : " ws://localhost:* ws://127.0.0.1:*"
    }`,
    ...(isProduction ? ["upgrade-insecure-requests"] : []),
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
  ...(isProduction
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

const privateAuthHeaders = {
  ...noStoreHeaders,
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
};

export default defineConfig({
  serialization: {
    mode: "json",
  },
  vite: {
    // esbuild can't down-transpile Solid's destructuring to Vite's default
    // legacy browser target; keep the target modern so it doesn't try.
    build: { target: "esnext" },
    optimizeDeps: { esbuildOptions: { target: "esnext" } },
  },
  server: {
    preset: process.env.VERCEL ? "vercel" : undefined,
    vercel: {
      functions: {
        maxDuration: 60,
        regions: ["sfo1"],
      },
    },
    routeRules: {
      "/**": {
        headers: securityHeaders,
      },
      "/api/**": {
        headers: noStoreHeaders,
      },
      "/api/auth/**": {
        headers: privateAuthHeaders,
      },
      "/login": {
        headers: privateAuthHeaders,
      },
      "/signup": {
        headers: privateAuthHeaders,
      },
      "/verify-email": {
        headers: privateAuthHeaders,
      },
      "/reset-password": {
        headers: privateAuthHeaders,
      },
      "/account": {
        headers: privateAuthHeaders,
      },
    },
  },
});
