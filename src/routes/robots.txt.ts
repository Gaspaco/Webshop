import type { APIEvent } from "@solidjs/start/server";

export function GET(event: APIEvent) {
  const origin = new URL(event.request.url).origin;
  return new Response(
    `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /account\nDisallow: /checkout\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`,
    {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=86400",
      },
    },
  );
}
