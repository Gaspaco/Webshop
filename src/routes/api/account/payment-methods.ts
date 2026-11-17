import type { APIEvent } from "@solidjs/start/server";
import { z } from "zod";
import { auth } from "~/lib/auth";
import { apiJson } from "~/lib/admin.server";
import { checkRateLimit } from "~/lib/rate-limit.server";
import { safeApiResponse, validateJsonRequest } from "~/lib/request-security.server";
import { listSavedCards, removeSavedCard, SavedCardError } from "~/lib/saved-cards.server";

async function handle(event: APIEvent, remove: boolean) {
  return safeApiResponse(async () => {
    if (remove) {
      const invalid = await validateJsonRequest(event, { maxBytes: 2_000 });
      if (invalid) return invalid;
    }
    const session = await auth.api.getSession({ headers: event.request.headers });
    if (!session) return apiJson({ error: "Sign in to manage saved cards." }, { status: 401 });
    if (!session.user.emailVerified) return apiJson({ error: "Verify your email before using saved cards." }, { status: 403 });
    if (await checkRateLimit({ event, namespace: "saved-cards", identity: session.user.id, limit: 20, windowMs: 60_000 })) return apiJson({ error: "Please wait a minute before trying again." }, { status: 429, headers: { "Retry-After": "60" } });
    if (!process.env.MOLLIE_API_KEY) return remove
      ? apiJson({ error: "Saved cards are not configured." }, { status: 503 })
      : apiJson({ available: false, cards: [] });
    try {
      if (remove) {
        let body: unknown;
        try { body = await event.request.json(); } catch { return apiJson({ error: "Invalid request body." }, { status: 400 }); }
        const input = z.object({ id: z.string().regex(/^mdt_[A-Za-z0-9]{1,80}$/) }).strict().safeParse(body);
        if (!input.success) return apiJson({ error: "Choose a valid saved card." }, { status: 400 });
        await removeSavedCard(session.user.id, input.data.id);
        return apiJson({ removed: true });
      }
      return apiJson({ available: true, cards: await listSavedCards(session.user.id) });
    } catch (error) {
      if (error instanceof SavedCardError) return apiJson({ error: error.message }, { status: error.status });
      throw error;
    }
  });
}

export const GET = (event: APIEvent) => handle(event, false);
export const DELETE = (event: APIEvent) => handle(event, true);
