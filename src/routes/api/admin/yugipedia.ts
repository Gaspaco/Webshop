import type { APIEvent } from "@solidjs/start/server";
import { GET as getLibrary, POST as updateLibrary } from "./ygoprodeck";

// Explicit handlers are required by SolidStart's route-method discovery.
// The older endpoint remains available to already-open owner dashboard tabs.
export async function GET(event: APIEvent) { return getLibrary(event); }
export async function POST(event: APIEvent) { return updateLibrary(event); }
