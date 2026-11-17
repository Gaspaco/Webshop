import { defineConfig } from "@solidjs/start/config";

const isProduction =
  process.env.NODE_ENV === "production" || process.argv.includes("build");

const securityHeaders = {
  // CSP is set by entry-server for each response, not by a static edge rule.
  // Otherwise a platform header could overwrite the per-request SSR nonce.
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
      "/two-factor": {
        headers: privateAuthHeaders,
      },
      "/checkout": {
        headers: privateAuthHeaders,
      },
      "/returns": {
        headers: privateAuthHeaders,
      },
      "/admin/**": {
        headers: privateAuthHeaders,
      },
    },
  },
});
