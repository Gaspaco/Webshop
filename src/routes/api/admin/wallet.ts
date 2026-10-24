import type { APIEvent } from "@solidjs/start/server";
import { z } from "zod";
import { apiJson, requireAdmin } from "~/lib/admin.server";
import { safeApiResponse } from "~/lib/request-security.server";
import { adjustWallet, WalletError, walletOverview } from "~/lib/wallet.server";

export async function GET(event: APIEvent) {
  return safeApiResponse(async () => {
    const guard = await requireAdmin(event); if (guard.response) return guard.response;
    const id = z.string().uuid().safeParse(new URL(event.request.url).searchParams.get("userId"));
    if (!id.success) return apiJson({ error: "Choose a customer." }, { status: 400 });
    return apiJson(await walletOverview(id.data));
  });
}
export async function POST(event: APIEvent) {
  return safeApiResponse(async () => {
    const guard = await requireAdmin(event); if (guard.response) return guard.response;
    const input = z.object({ userId: z.string().uuid(), requestId: z.string().uuid(),
      amountCents: z.number().int().min(-1_000_000).max(1_000_000).refine(value => value !== 0), reason: z.string().trim().min(3).max(300) }).safeParse(await event.request.json());
    if (!input.success) return apiJson({ error: "Choose a customer, a non-zero amount, and a reason (3–300 characters)." }, { status: 400 });
    try { return apiJson(await adjustWallet({ ...input.data, actorId: guard.session!.user.id })); }
    catch (error) { if (error instanceof WalletError) return apiJson({ error: error.message }, { status: 409 }); throw error; }
  });
}
