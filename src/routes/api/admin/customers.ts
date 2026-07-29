import type { APIEvent } from "@solidjs/start/server";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import { user } from "~/db/schema";
import { apiJson, requireAdmin } from "~/lib/admin.server";

export async function DELETE(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;

  try {
    const input = z
      .object({
        id: z.string().uuid(),
        confirmation: z.literal("REMOVE"),
      })
      .parse(await event.request.json());

    if (input.id === guard.session!.user.id) {
      return apiJson(
        { error: "The active owner account cannot remove itself." },
        { status: 400 },
      );
    }

    const [removed] = await db
      .delete(user)
      .where(
        and(
          eq(user.id, input.id),
          ne(user.role, "admin"),
        ),
      )
      .returning({ id: user.id, email: user.email });

    if (!removed) {
      return apiJson(
        { error: "Customer account not found or protected." },
        { status: 404 },
      );
    }

    return apiJson({
      ok: true,
      message: "Customer account removed. Existing order records were kept.",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiJson(
        { error: "Account removal confirmation is invalid." },
        { status: 400 },
      );
    }

    console.error("Admin customer removal failed", error);
    return apiJson(
      { error: "The customer account could not be removed." },
      { status: 500 },
    );
  }
}
