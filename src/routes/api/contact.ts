import type { APIEvent } from "@solidjs/start/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import { contactMessages } from "~/db/schema";
import { escapeEmailHtml, sendTransactionalEmail } from "~/lib/email.server";
import { getEmailEnv } from "~/lib/env.server";
import { checkRateLimit } from "~/lib/rate-limit.server";
import { validateJsonRequest } from "~/lib/request-security.server";
import { getStoreProfile } from "~/lib/store-profile.server";

const safeText = (minimum: number, maximum: number) =>
  z
    .string()
    .normalize("NFKC")
    .trim()
    .min(minimum)
    .max(maximum)
    .refine(value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), {
      message: "Remove unsupported characters.",
    });

const contactSchema = z.object({
  name: safeText(2, 100),
  email: z.string().normalize("NFKC").trim().toLowerCase().email().max(254),
  topic: z.enum([
    "Order question",
    "Card condition or grading",
    "Returns & refunds",
    "Selling to us",
    "Something else",
  ]),
  message: safeText(10, 3000),
  website: z.string().max(200).optional().default(""),
});

const json = (data: unknown, init?: ResponseInit) =>
  Response.json(data, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(init?.headers ?? {}),
    },
  });

export async function POST(event: APIEvent) {
  try {
    const invalidRequest = validateJsonRequest(event, { maxBytes: 16_000 });
    if (invalidRequest) return invalidRequest;

    const input = contactSchema.parse(await event.request.json());
    if (input.website) return json({ ok: true }, { status: 201 });

    const [emailLimited, addressLimited] = await Promise.all([
      checkRateLimit({
        event,
        namespace: "contact-email",
        identity: input.email,
        limit: 5,
        windowMs: 10 * 60 * 1000,
      }),
      checkRateLimit({
        event,
        namespace: "contact-address",
        identity: "all",
        limit: 20,
        windowMs: 60 * 60 * 1000,
      }),
    ]);
    if (emailLimited || addressLimited) {
      return json(
        { error: "Too many messages. Please wait before trying again." },
        { status: 429, headers: { "Retry-After": "600" } },
      );
    }

    const profile = await getStoreProfile();
    const [storedMessage] = await db
      .insert(contactMessages)
      .values({
        name: input.name,
        email: input.email,
        topic: input.topic,
        message: input.message,
      })
      .returning({ id: contactMessages.id });

    try {
      if (getEmailEnv()) {
        await sendTransactionalEmail({
          to: profile.contactNotificationEmail,
          subject: `Website contact: ${input.topic}`,
          text: `Name: ${input.name}\nEmail: ${input.email}\nTopic: ${input.topic}\n\n${input.message}`,
          html: `<h1>New website message</h1><p><strong>Name:</strong> ${escapeEmailHtml(input.name)}</p><p><strong>Email:</strong> ${escapeEmailHtml(input.email)}</p><p><strong>Topic:</strong> ${escapeEmailHtml(input.topic)}</p><p>${escapeEmailHtml(input.message).replaceAll("\n", "<br>")}</p>`,
          replyTo: input.email,
          idempotencyKey: `contact-${storedMessage.id}`,
        });
        await db
          .update(contactMessages)
          .set({ notificationSent: true })
          .where(eq(contactMessages.id, storedMessage.id));
      }
    } catch {
      console.error("Contact notification delivery failed.");
    }

    return json({ ok: true, reference: storedMessage.id }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json(
        { error: error.issues[0]?.message ?? "Check the contact form." },
        { status: 400 },
      );
    }
    console.error("Contact form delivery failed", error);
    return json(
      { error: "Your message could not be sent. Please try again later." },
      { status: 500 },
    );
  }
}
