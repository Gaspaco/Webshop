import { createMollieClient, type MollieClient } from "@mollie/api-client";
import { getMollieEnv } from "./env.server";

let client: MollieClient | undefined;

export function getMollieClient() {
  client ??= createMollieClient({
    apiKey: getMollieEnv().MOLLIE_API_KEY,
  });

  return client;
}
