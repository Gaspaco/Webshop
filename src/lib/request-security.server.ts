import type { APIEvent } from "@solidjs/start/server";
import { logServerError } from "./server-log";

type JsonRequestOptions = {
  maxBytes: number;
};

function jsonError(error: string, status: number) {
  return Response.json(
    { error },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

export async function validateJsonRequest(
  event: APIEvent,
  options: JsonRequestOptions,
) {
  const origin = event.request.headers.get("origin");
  const fetchSite = event.request.headers.get("sec-fetch-site");
  const requestOrigin = new URL(event.request.url).origin;

  if (
    (origin && origin !== requestOrigin) ||
    fetchSite === "cross-site"
  ) {
    return jsonError("The request origin could not be verified.", 403);
  }

  const contentType = event.request.headers.get("content-type") ?? "";
  if (contentType.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return jsonError("This endpoint requires a JSON request.", 415);
  }

  const contentLength = Number(event.request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > options.maxBytes) {
    return jsonError("The request is too large.", 413);
  }

  const bounded = await limitJsonBody(event.request, options.maxBytes);
  if (bounded instanceof Response) return bounded;
  event.request = bounded;
  return null;
}

const verifiedBodies = new WeakMap<Request, number>();

/** Bound actual bytes, including streamed bodies without Content-Length. */
export async function limitJsonBody(request: Request, maxBytes: number) {
  if ((verifiedBodies.get(request) ?? Infinity) <= maxBytes) return request;
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > maxBytes) {
    return jsonError("The request is too large.", 413);
  }
  if (!request.body) return request;

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        void reader.cancel().catch(() => {});
        return jsonError("The request is too large.", 413);
      }
      chunks.push(value);
    }
  } catch {
    return jsonError("The request body could not be read.", 400);
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const bounded = new Request(request, { body });
  verifiedBodies.set(bounded, maxBytes);
  return bounded;
}

export async function handleAuthRequest(
  request: Request,
  handler: (request: Request) => Promise<Response>,
) {
  if (request.method === "POST") {
    const pathname = new URL(request.url).pathname;
    const maxBytes = pathname === "/api/auth/update-user" || pathname === "/api/auth/sign-up/email"
      ? 512_000 : 16_000;
    const bounded = await limitJsonBody(request, maxBytes);
    if (bounded instanceof Response) return bounded;
    request = bounded;
  }

  let response: Response;
  try {
    response = await handler(request);
  } catch (error) {
    logServerError("Authentication request failed.", error);
    response = jsonError("The account service is temporarily unavailable. Please try again shortly.", 503);
  }
  // Auth responses include sessions and tokens, even when served without the
  // platform's route rules (for example through an alternate deployment).
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

/** Prevent framework-level logging of raw SQL errors on private account APIs. */
export async function safeApiResponse(operation: () => Promise<Response>) {
  try { return await operation(); }
  catch (error) {
    logServerError("Account API request failed.", error);
    return jsonError("This service is temporarily unavailable. Please try again shortly.", 503);
  }
}
