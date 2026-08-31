import type { APIEvent } from "@solidjs/start/server";
import { getStoreProfile } from "~/lib/store-profile.server";

export async function GET(_event: APIEvent) {
  const profile = await getStoreProfile();
  const { contactNotificationEmail: _privateNotificationEmail, ...publicProfile } = profile;
  return Response.json(
    { profile: publicProfile },
    {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
