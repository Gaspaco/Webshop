import type { APIEvent } from "@solidjs/start/server";
import { auth } from "~/lib/auth";
import { handleAuthRequest } from "~/lib/request-security.server";

export function GET(event: APIEvent) {
  return handleAuthRequest(event.request, request => auth.handler(request));
}

export function POST(event: APIEvent) {
  return handleAuthRequest(event.request, request => auth.handler(request));
}
