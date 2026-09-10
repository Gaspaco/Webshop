import type { APIEvent } from "@solidjs/start/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import { products, wishlistItems } from "~/db/schema";
import { auth } from "~/lib/auth";
import { validateJsonRequest } from "~/lib/request-security.server";

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(180)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid product address.");

const wishlistSchema = z.object({ slug: slugSchema });

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, {
    ...init,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      ...(init?.headers ?? {}),
    },
  });
}

async function getSession(event: APIEvent) {
  return auth.api.getSession({ headers: event.request.headers });
}

async function findActiveProduct(slug: string) {
  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.slug, slug), eq(products.status, "active")))
    .limit(1);
  return product;
}

export async function GET(event: APIEvent) {
  const session = await getSession(event);
  if (!session) return json({ error: "Authentication required." }, { status: 401 });

  const parsedSlug = slugSchema.safeParse(
    new URL(event.request.url).searchParams.get("slug") ?? "",
  );
  if (!parsedSlug.success) {
    return json({ error: "Invalid product address." }, { status: 400 });
  }

  const product = await findActiveProduct(parsedSlug.data);
  if (!product) return json({ saved: false });

  const [savedItem] = await db
    .select({ productId: wishlistItems.productId })
    .from(wishlistItems)
    .where(
      and(
        eq(wishlistItems.userId, session.user.id),
        eq(wishlistItems.productId, product.id),
      ),
    )
    .limit(1);

  return json({ saved: Boolean(savedItem) });
}

export async function PUT(event: APIEvent) {
  const invalidRequest = validateJsonRequest(event, { maxBytes: 1_000 });
  if (invalidRequest) return invalidRequest;

  const session = await getSession(event);
  if (!session) return json({ error: "Authentication required." }, { status: 401 });

  const parsed = wishlistSchema.safeParse(await event.request.json());
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid product." }, { status: 400 });
  }

  const product = await findActiveProduct(parsed.data.slug);
  if (!product) {
    return json({ error: "This product is no longer available." }, { status: 404 });
  }

  await db
    .insert(wishlistItems)
    .values({ userId: session.user.id, productId: product.id })
    .onConflictDoNothing();

  return json({ saved: true });
}

export async function DELETE(event: APIEvent) {
  const invalidRequest = validateJsonRequest(event, { maxBytes: 1_000 });
  if (invalidRequest) return invalidRequest;

  const session = await getSession(event);
  if (!session) return json({ error: "Authentication required." }, { status: 401 });

  const parsed = wishlistSchema.safeParse(await event.request.json());
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid product." }, { status: 400 });
  }

  const product = await findActiveProduct(parsed.data.slug);
  if (product) {
    await db
      .delete(wishlistItems)
      .where(
        and(
          eq(wishlistItems.userId, session.user.id),
          eq(wishlistItems.productId, product.id),
        ),
      );
  }

  return json({ saved: false });
}
