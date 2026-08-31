import type { APIEvent } from "@solidjs/start/server";

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

export function validateJsonRequest(
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
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return jsonError("This endpoint requires a JSON request.", 415);
  }

  const contentLength = Number(event.request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > options.maxBytes) {
    return jsonError("The request is too large.", 413);
  }

  return null;
}
