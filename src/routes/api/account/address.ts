import type { APIEvent } from "@solidjs/start/server";
import { eq } from "drizzle-orm";
import { db } from "~/db";
import { customerAddresses } from "~/db/schema";
import { savedAddressSchema } from "~/lib/address";
import { auth } from "~/lib/auth";

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, {
    ...init,
    headers: {
      "Cache-Control": "private, no-store",
      ...(init?.headers ?? {}),
    },
  });
}

async function getSession(event: APIEvent) {
  return auth.api.getSession({
    headers: event.request.headers,
  });
}

export async function GET(event: APIEvent) {
  const session = await getSession(event);

  if (!session) {
    return json({ error: "Authentication required." }, { status: 401 });
  }

  const [address] = await db
    .select({
      firstName: customerAddresses.firstName,
      lastName: customerAddresses.lastName,
      streetAndHouseNumber: customerAddresses.streetAndHouseNumber,
      postalCode: customerAddresses.postalCode,
      city: customerAddresses.city,
      country: customerAddresses.country,
    })
    .from(customerAddresses)
    .where(eq(customerAddresses.userId, session.user.id))
    .limit(1);

  return json({
    address: address ?? null,
    email: session.user.email,
  });
}

export async function PUT(event: APIEvent) {
  const session = await getSession(event);

  if (!session) {
    return json({ error: "Authentication required." }, { status: 401 });
  }

  const parsed = savedAddressSchema.safeParse(await event.request.json());

  if (!parsed.success) {
    return json(
      {
        error:
          parsed.error.issues[0]?.message ??
          "Check the address and try again.",
      },
      { status: 400 },
    );
  }

  const [address] = await db
    .insert(customerAddresses)
    .values({
      userId: session.user.id,
      ...parsed.data,
    })
    .onConflictDoUpdate({
      target: customerAddresses.userId,
      set: {
        ...parsed.data,
        updatedAt: new Date(),
      },
    })
    .returning({
      firstName: customerAddresses.firstName,
      lastName: customerAddresses.lastName,
      streetAndHouseNumber: customerAddresses.streetAndHouseNumber,
      postalCode: customerAddresses.postalCode,
      city: customerAddresses.city,
      country: customerAddresses.country,
    });

  return json({ address });
}
