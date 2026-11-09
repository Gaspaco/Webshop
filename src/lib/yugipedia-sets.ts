export type RecentYugipediaSet = { name: string; updatedAt: string };

/** These are recently edited English set lists, not a release-date ranking. */
export function recentEnglishSets(rows: Array<{ title?: string; timestamp?: string }>): RecentYugipediaSet[] {
  const sets = new Map<string, RecentYugipediaSet>();
  for (const row of rows) {
    const match = /^Set Card Lists:(.+) \(TCG-EN\)$/.exec(row.title ?? "");
    const name = match?.[1]?.trim();
    if (!name || name.length > 80 || /[\x00-\x1f\x7f|]/.test(name) || !row.timestamp || !Number.isFinite(Date.parse(row.timestamp))) continue;
    const previous = sets.get(name.toLowerCase());
    if (!previous || Date.parse(previous.updatedAt) < Date.parse(row.timestamp)) {
      sets.set(name.toLowerCase(), { name, updatedAt: row.timestamp });
    }
  }
  return [...sets.values()].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 20);
}
