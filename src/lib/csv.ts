/** Spreadsheet-view exports: quote delimiters and neutralize formula cells. */
export function csvCell(value: unknown) {
  const text = String(value ?? "");
  const dangerous = typeof value === "string" &&
    /^[\s\u0000-\u001f]*[=+@-]/u.test(text.normalize("NFKC"));
  return `"${(dangerous ? "\t" + text : text).replaceAll('"', '""')}"`;
}
