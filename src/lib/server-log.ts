const ERROR_NAMES = new Set([
  "Error", "TypeError", "APIError", "PostgresError", "DatabaseError", "ZodError",
]);
const ERROR_CODES = new Set([
  "23505", "23503", "42P01", "42703", "53300", "53400", "08000", "08001",
  "08006", "57P01", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "ECONNRESET",
]);

/** SQL errors and SDK errors can contain passwords, tokens, addresses and queries. */
export function describeServerError(error: unknown) {
  const details: { name: string; code?: string } = { name: "Error" };
  if (!error || typeof error !== "object") return details;
  if ("name" in error && typeof error.name === "string" && ERROR_NAMES.has(error.name)) {
    details.name = error.name;
  }
  const cause = "cause" in error && error.cause && typeof error.cause === "object"
    ? error.cause : error;
  if ("code" in cause && typeof cause.code === "string" && ERROR_CODES.has(cause.code)) {
    details.code = cause.code;
  }
  return details;
}

// Callers supply a fixed event description, never a request body or error.message.
export function logServerError(event: string, error: unknown) {
  console.error(event, describeServerError(error));
}
