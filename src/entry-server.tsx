// @refresh reload
import { createHandler, StartServer } from "@solidjs/start/server";
import { randomBytes } from "node:crypto";
import { contentSecurityPolicy } from "~/lib/content-security-policy";

export default createHandler(() => (
  <StartServer
    document={({ assets, children, scripts }) => (
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=2" />
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
          <link
            href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=Rubik:wght@600;700;800;900&display=swap"
            rel="stylesheet"
          />
          {assets}
        </head>
        <body>
          <div id="app">{children}</div>
          {scripts}
        </body>
      </html>
    )}
  />
), event => {
  const nonce = randomBytes(18).toString("base64");
  event.response.headers.set("Content-Security-Policy", contentSecurityPolicy(process.env.NODE_ENV === "production", nonce));
  // A nonce-bearing document must never be shared between requests by a CDN.
  event.response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return {
    nonce,
    onCompleteAll: ({ write }) => {
      // SolidStart's late streaming redirect currently lacks a nonce. Supply
      // an authorized equivalent; its unnonced fallback remains blocked.
      const location = event.response.headers.get("Location");
      if (location) write(`<script nonce="${nonce}">window.location.replace(${JSON.stringify(location).replace(/</g, "\\u003c")})</script>`);
    },
  };
}, async event => {
  // API/HTML downloads run before the render options callback. They use a
  // policy with no inline script permission; rendered pages add their nonce.
  event.response.headers.set("Content-Security-Policy", contentSecurityPolicy(process.env.NODE_ENV === "production"));
});
