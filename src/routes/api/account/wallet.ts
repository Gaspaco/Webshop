import type { APIEvent } from "@solidjs/start/server";
import { auth } from "~/lib/auth";
import { apiJson } from "~/lib/admin.server";
import { safeApiResponse } from "~/lib/request-security.server";
import { walletOverview } from "~/lib/wallet.server";

export async function GET(event: APIEvent) {
  return safeApiResponse(async () => {
    const session = await auth.api.getSession({ headers: event.request.headers });
    if (!session) return apiJson({ error: "Sign in to view store credit." }, { status: 401 });
    return apiJson(await walletOverview(session.user.id));
  });
}
